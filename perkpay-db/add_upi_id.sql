-- Run this after schema.sql + functions.sql.
-- Adds the shopkeeper's UPI ID to shops — captured by the admin at
-- shop-registration time, used to build the UPI payment deep link.

alter table shops add column if not exists upi_id varchar(100);

comment on column shops.upi_id is
  'Shopkeeper''s UPI VPA (e.g. shopname@okhdfcbank). Set by admin at shop creation. Payments go directly here, not through PerkPay.';
