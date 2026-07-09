-- =========================================================
-- PERKPAY — DATABASE SCHEMA (Supabase / PostgreSQL + PostGIS)
-- =========================================================
-- Auth model: custom email + password (bcrypt hash stored in `users`).
-- We are NOT using Supabase Auth / OTP — plain email+password login,
-- backend issues its own JWT after verifying the hash.
--
-- Roles: customer | shopkeeper | admin
--   - Customers: self sign-up.
--   - Shopkeepers: account created by admin OR self sign-up for login,
--     but they can NEVER create their own shop row — only admin can.
--   - Admin: manually seeded (see bottom), the only role that can
--     insert/update/delete rows in `shops` and assign a shopkeeper
--     (owner_id) to a shop.
--   - Shopkeepers CAN create/edit `offers` for the shop(s) they own.
-- =========================================================

create extension if not exists pgcrypto;   -- for gen_random_uuid()
create extension if not exists postgis;    -- geospatial distance queries

-- ---------------------------------------------------------
-- ENUM TYPES
-- ---------------------------------------------------------
create type user_role as enum ('customer', 'shopkeeper', 'admin');
create type txn_status as enum (
  'pending', 'success', 'failed',
  'reward_paid', 'partial_paid', 'expired'
);
create type points_reason as enum ('purchase', 'reward_redeem', 'referral_bonus');
create type reward_type as enum ('free_item', 'discount_coupon');

-- ---------------------------------------------------------
-- 1. USERS  (email + password auth, no OTP)
-- ---------------------------------------------------------
create table users (
  id               uuid primary key default gen_random_uuid(),
  name             varchar(100) not null,
  email            varchar(255) unique not null,
  password_hash    text not null,                 -- bcrypt hash, never store plaintext
  phone            varchar(20) unique,
  role             user_role not null default 'customer',
  profile_pic      text,                            -- Supabase Storage URL
  points_balance   integer not null default 0 check (points_balance >= 0),
  referral_code    varchar(10) unique,
  referred_by      uuid references users(id) on delete set null,
  preferences      text[] default '{}',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index idx_users_email on users(email);
create index idx_users_role  on users(role);

-- ---------------------------------------------------------
-- 2. SHOPS  (admin-only creation — enforced via RLS below)
-- ---------------------------------------------------------
create table shops (
  id                        uuid primary key default gen_random_uuid(),
  name                      varchar(100) not null,
  address                   text not null,
  location                  geography(point, 4326) not null,   -- (lng, lat)
  category                  varchar(50) default 'other',        -- cafe/restaurant/salon/...
  earn_points_per_100       integer not null check (earn_points_per_100 > 0),
  redeem_points_per_rupee   integer not null check (redeem_points_per_rupee > 0),
  rating                    decimal(2,1) default 0,
  owner_id                  uuid references users(id) on delete set null, -- assigned shopkeeper
  is_active                 boolean not null default true,
  created_by                uuid references users(id),          -- admin who created it
  created_at                timestamptz not null default now()
);

create index idx_shops_location on shops using gist(location);
create index idx_shops_owner    on shops(owner_id);

-- ---------------------------------------------------------
-- 3. TRANSACTIONS
-- ---------------------------------------------------------
create table transactions (
  id                    uuid primary key default gen_random_uuid(),
  order_id              varchar(50) unique not null,       -- ORD_<ts>_<rand>
  user_id               uuid references users(id),         -- customer, null until scanned
  shop_id               uuid references shops(id) not null,
  amount                integer not null check (amount > 0),
  reward_points_used    integer default 0,
  reward_value_used     integer default 0,
  upi_paid              integer default 0,
  status                txn_status not null default 'pending',
  razorpay_order_id     varchar(100),
  razorpay_payment_id   varchar(100),
  expires_at            timestamptz not null,               -- now() + 2 minutes
  created_at            timestamptz not null default now()
);

create index idx_txn_shop   on transactions(shop_id);
create index idx_txn_user   on transactions(user_id);
create index idx_txn_status on transactions(status);
create index idx_txn_order  on transactions(order_id);

-- ---------------------------------------------------------
-- 4. POINTS LOG (audit trail — never mutate points_balance directly)
-- ---------------------------------------------------------
create table points_log (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid references users(id) not null,
  transaction_id uuid references transactions(id),
  points_change  integer not null,          -- +earned / -redeemed
  reason         points_reason not null,
  created_at     timestamptz not null default now()
);

create index idx_points_log_user on points_log(user_id);

-- ---------------------------------------------------------
-- 5. OFFERS  (created by shopkeeper who owns the shop)
-- ---------------------------------------------------------
create table offers (
  id               uuid primary key default gen_random_uuid(),
  shop_id          uuid references shops(id) not null,
  created_by       uuid references users(id) not null,   -- shopkeeper
  title            varchar(100) not null,
  description      text,
  points_required  integer not null check (points_required > 0),
  reward_type      reward_type not null,
  reward_value     varchar(100),
  is_highlighted   boolean not null default false,        -- "highlighting" from spec
  is_active        boolean not null default true,
  valid_until      timestamptz,
  created_at       timestamptz not null default now()
);

create index idx_offers_shop        on offers(shop_id);
create index idx_offers_highlighted on offers(is_highlighted) where is_highlighted = true;

-- ---------------------------------------------------------
-- 6. FAVORITE SHOPS
-- ---------------------------------------------------------
create table favorite_shops (
  user_id    uuid references users(id) on delete cascade,
  shop_id    uuid references shops(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, shop_id)
);

-- ---------------------------------------------------------
-- 7. SAVED OFFERS
-- ---------------------------------------------------------
create table saved_offers (
  id        uuid primary key default gen_random_uuid(),
  user_id   uuid references users(id) on delete cascade,
  offer_id  uuid references offers(id) on delete cascade,
  is_used   boolean not null default false,
  saved_at  timestamptz not null default now(),
  unique(user_id, offer_id)
);

-- ---------------------------------------------------------
-- 8. ADDRESSES (customer addresses, future use)
-- ---------------------------------------------------------
create table addresses (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid references users(id) on delete cascade,
  address_line  text not null,
  city          varchar(50) not null,
  district      varchar(50) not null,
  state         varchar(50) not null,
  is_default    boolean not null default false
);

-- =========================================================
-- TRIGGERS
-- =========================================================

-- keep users.updated_at fresh
create or replace function set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger trg_users_updated_at
before update on users
for each row execute function set_updated_at();

-- =========================================================
-- ROW LEVEL SECURITY
-- =========================================================
alter table users           enable row level security;
alter table shops           enable row level security;
alter table transactions    enable row level security;
alter table points_log      enable row level security;
alter table offers          enable row level security;
alter table favorite_shops  enable row level security;
alter table saved_offers    enable row level security;
alter table addresses       enable row level security;

-- Helper: current user's role/id come from the backend JWT (custom claims),
-- exposed via auth.jwt() ->> 'role' / auth.jwt() ->> 'sub' when using
-- Supabase's JWT verification with a custom secret. Adjust claim names
-- to match whatever your Express backend puts in the JWT payload.

-- USERS: read/update own row only
create policy users_select_own on users
  for select using (id = (auth.jwt() ->> 'sub')::uuid);

create policy users_update_own on users
  for update using (id = (auth.jwt() ->> 'sub')::uuid);

-- SHOPS: everyone can read; ONLY admin can insert/update/delete
create policy shops_select_all on shops
  for select using (true);

create policy shops_admin_insert on shops
  for insert with check (auth.jwt() ->> 'role' = 'admin');

create policy shops_admin_update on shops
  for update using (auth.jwt() ->> 'role' = 'admin');

create policy shops_admin_delete on shops
  for delete using (auth.jwt() ->> 'role' = 'admin');

-- TRANSACTIONS: customer sees own; shopkeeper sees their shop's; admin sees all
create policy txn_customer_select on transactions
  for select using (user_id = (auth.jwt() ->> 'sub')::uuid);

create policy txn_shopkeeper_select on transactions
  for select using (
    shop_id in (select id from shops where owner_id = (auth.jwt() ->> 'sub')::uuid)
  );

create policy txn_admin_all on transactions
  for all using (auth.jwt() ->> 'role' = 'admin');

-- OFFERS: everyone reads; only owning shopkeeper writes
create policy offers_select_all on offers
  for select using (true);

create policy offers_shopkeeper_write on offers
  for all using (
    shop_id in (select id from shops where owner_id = (auth.jwt() ->> 'sub')::uuid)
  );

-- FAVORITES / SAVED OFFERS / ADDRESSES: owner-only
create policy favorites_owner on favorite_shops
  for all using (user_id = (auth.jwt() ->> 'sub')::uuid);

create policy saved_offers_owner on saved_offers
  for all using (user_id = (auth.jwt() ->> 'sub')::uuid);

create policy addresses_owner on addresses
  for all using (user_id = (auth.jwt() ->> 'sub')::uuid);

-- POINTS LOG: user reads own; admin reads all; inserts only via backend (service role)
create policy points_log_owner_select on points_log
  for select using (user_id = (auth.jwt() ->> 'sub')::uuid);

create policy points_log_admin_select on points_log
  for select using (auth.jwt() ->> 'role' = 'admin');

-- =========================================================
-- SEED: one admin account (password: change immediately)
-- Replace the password_hash below with a real bcrypt hash generated
-- by the backend before running this in production.
-- =========================================================
-- insert into users (name, email, password_hash, role)
-- values ('PerkPay Admin', 'admin@perkpay.com', '<bcrypt-hash-here>', 'admin');

-- =========================================================
-- USEFUL QUERY: nearby shops (PostGIS)
-- =========================================================
-- select id, name, address, earn_points_per_100, rating,
--        st_distance(location, st_setsrid(st_makepoint(:lng, :lat), 4326)::geography) / 1000 as distance_km
-- from shops
-- where is_active = true
--   and st_dwithin(location, st_setsrid(st_makepoint(:lng, :lat), 4326)::geography, :radius_km * 1000)
-- order by distance_km;
