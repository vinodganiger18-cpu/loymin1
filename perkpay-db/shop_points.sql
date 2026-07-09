-- Run after schema.sql, functions.sql, add_upi_id.sql, seed_admin.sql.
--
-- Changes the points model from one global wallet to a SEPARATE points
-- balance per shop — points earned at Shop Y can only be redeemed at
-- Shop Y, not at Shop B.
--
-- users.points_balance is repurposed as a LIFETIME "total coins earned"
-- counter for display only (it never decreases). The actual spendable
-- balance per shop lives in the new shop_points table.

create table if not exists shop_points (
  user_id     uuid references users(id) on delete cascade,
  shop_id     uuid references shops(id) on delete cascade,
  balance     integer not null default 0 check (balance >= 0),
  updated_at  timestamptz not null default now(),
  primary key (user_id, shop_id)
);

create index if not exists idx_shop_points_user on shop_points(user_id);

alter table points_log add column if not exists shop_id uuid references shops(id);

-- Track what a specific transaction earned/redeemed, so the customer's
-- post-payment screen can show "you earned X points at this shop".
alter table transactions add column if not exists earned_points integer default 0;

alter table shop_points enable row level security;

create policy shop_points_owner_select on shop_points
  for select using (user_id = (auth.jwt() ->> 'sub')::uuid);
