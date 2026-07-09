-- =========================================================
-- PERKPAY — PRODUCTION FUNCTIONS
-- Run AFTER: schema.sql, functions.sql, add_upi_id.sql, seed_admin.sql, shop_points.sql
-- =========================================================
-- These move the money-critical logic (settlement, referral bonus, expiry)
-- into single atomic transactions inside Postgres. The previous JS version
-- did read-then-write across several separate queries, which could lose
-- points under concurrency and could double-credit on a replayed webhook.
-- =========================================================

-- Razorpay order id is stored on the transaction; make sure the column exists.
alter table transactions add column if not exists razorpay_order_id  varchar(100);
alter table transactions add column if not exists razorpay_payment_id varchar(100);

-- Idempotency guard: a payment id should only ever settle once.
create unique index if not exists uniq_txn_razorpay_payment
  on transactions(razorpay_payment_id)
  where razorpay_payment_id is not null;

-- ---------------------------------------------------------
-- settle_transaction(order_id, upi_paid, new_status, razorpay_payment_id)
--
-- Atomically:
--   * locks the transaction row (FOR UPDATE)
--   * is idempotent — if the txn is already settled, returns the existing
--     result instead of crediting again (safe for webhook retries)
--   * computes earned points, applies earn - redeem to the per-shop wallet
--   * bumps the lifetime "coins earned" counter on users
--   * writes points_log audit rows
--   * flips the transaction status
-- All in ONE transaction. Returns a JSON summary for the API.
-- ---------------------------------------------------------
create or replace function settle_transaction(
  in_order_id text,
  in_upi_paid integer,
  in_new_status txn_status,
  in_razorpay_payment_id text default null
) returns jsonb
language plpgsql
as $$
declare
  v_txn        transactions;
  v_shop       shops;
  v_earned     integer;
  v_new_balance integer;
begin
  -- Lock the txn row for the duration of this transaction.
  select * into v_txn from transactions where order_id = in_order_id for update;
  if not found then
    raise exception 'order_not_found';
  end if;

  -- Already settled → return the stored result, do not re-credit (idempotent).
  if v_txn.status <> 'pending' then
    return jsonb_build_object(
      'success', true,
      'alreadySettled', true,
      'earnedPoints', coalesce(v_txn.earned_points, 0),
      'shopId', v_txn.shop_id,
      'orderId', v_txn.order_id
    );
  end if;

  if v_txn.user_id is null then
    raise exception 'transaction_has_no_customer';
  end if;

  select * into v_shop from shops where id = v_txn.shop_id;

  v_earned := floor(in_upi_paid / 100.0)::int * v_shop.earn_points_per_100;

  -- Flip status + record what was paid/earned.
  update transactions
     set status = in_new_status,
         upi_paid = in_upi_paid,
         earned_points = v_earned,
         razorpay_payment_id = coalesce(in_razorpay_payment_id, razorpay_payment_id)
   where id = v_txn.id;

  -- Audit log: redemption then earning.
  if coalesce(v_txn.reward_points_used, 0) > 0 then
    insert into points_log (user_id, transaction_id, shop_id, points_change, reason)
    values (v_txn.user_id, v_txn.id, v_shop.id, -v_txn.reward_points_used, 'reward_redeem');
  end if;
  if v_earned > 0 then
    insert into points_log (user_id, transaction_id, shop_id, points_change, reason)
    values (v_txn.user_id, v_txn.id, v_shop.id, v_earned, 'purchase');
  end if;

  -- Per-shop wallet: earn - redeem, clamped at 0. Atomic upsert.
  insert into shop_points (user_id, shop_id, balance, updated_at)
  values (v_txn.user_id, v_shop.id, greatest(0, v_earned - coalesce(v_txn.reward_points_used, 0)), now())
  on conflict (user_id, shop_id) do update
    set balance = greatest(0, shop_points.balance + v_earned - coalesce(v_txn.reward_points_used, 0)),
        updated_at = now()
  returning balance into v_new_balance;

  -- Lifetime "total coins earned" — display-only, never decreases.
  if v_earned > 0 then
    update users set points_balance = points_balance + v_earned where id = v_txn.user_id;
  end if;

  return jsonb_build_object(
    'success', true,
    'alreadySettled', false,
    'earnedPoints', v_earned,
    'shopBalance', v_new_balance,
    'shopName', v_shop.name,
    'shopId', v_shop.id,
    'orderId', v_txn.order_id
  );
end;
$$;

-- ---------------------------------------------------------
-- apply_referral_bonus(new_user_id, referrer_id)
-- Atomically credits +50 lifetime points to both users and logs it.
-- ---------------------------------------------------------
create or replace function apply_referral_bonus(
  in_new_user_id uuid,
  in_referrer_id uuid
) returns void
language plpgsql
as $$
begin
  update users set points_balance = points_balance + 50 where id = in_new_user_id;
  update users set points_balance = points_balance + 50 where id = in_referrer_id;

  insert into points_log (user_id, points_change, reason)
  values (in_new_user_id, 50, 'referral_bonus'),
         (in_referrer_id, 50, 'referral_bonus');
end;
$$;

-- ---------------------------------------------------------
-- mark_expired_orders() — flips stale pending transactions to 'expired'.
-- Called by a scheduled job (Vercel Cron → /api/payments/expire).
-- Returns the number of rows expired.
-- ---------------------------------------------------------
create or replace function mark_expired_orders()
returns integer
language plpgsql
as $$
declare
  v_count integer;
begin
  update transactions
     set status = 'expired'
   where status = 'pending'
     and expires_at < now();
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
