-- Run this once in Supabase SQL Editor to create the first PerkPay admin login.
-- Login: admin@perkpay.com / Perk@Admin123
-- IMPORTANT: log in once, then change this password from a real "change password"
-- flow (not built yet) or by re-running this UPDATE with a new hash.

insert into users (name, email, password_hash, role, referral_code)
values (
  'PerkPay Admin',
  'admin@perkpay.com',
  '$2b$10$FErTeatg/8CYEdw//tc4iuiKL0O0.KcHyfuqeKq7nr1mAFRe8aBN.',
  'admin',
  'ADMIN001'
)
on conflict (email) do nothing;
