# PerkPay — Local Setup & Run Guide

**Live Demo:** [https://loymin1-dusky.vercel.app/](https://loymin1-dusky.vercel.app/)
**GitHub Repository:** [https://github.com/vinodganiger18-cpu/loymin1.git](https://github.com/vinodganiger18-cpu/loymin1.git)

A loyalty-points web app: customers earn/redeem points via UPI (Razorpay) payments
at local shops, shops are onboarded only by an admin, and shopkeepers post offers
customers can browse and save.

## What's in this package

```
perkpay-db/         SQL to run in Supabase (schema + PostGIS functions)
perkpay-backend/     Express API (Node.js)
perkpay-frontend/    React app (Vite) — white/violet theme
```

## 1. Database (Supabase)

In your Supabase project → SQL Editor, run in this order:
1. `perkpay-db/schema.sql`
2. `perkpay-db/functions.sql`
3. `perkpay-db/add_upi_id.sql` (adds the shop UPI ID column)
4. `perkpay-db/seed_admin.sql` (creates your first admin login — see below)
5. `perkpay-db/shop_points.sql` (switches points to a per-shop wallet)

**If you already ran all 5 before:** just re-run `functions.sql` again —
`nearby_shops()` was updated to return every shop (sorted by distance)
instead of only ones within a radius. It's safe to re-run (`create or
replace function`).

## 2. Backend setup

```bash
cd perkpay-backend
npm install
npm run dev
```

The `.env` file is already filled in with your Supabase + Razorpay test
credentials. Server runs on **http://localhost:4000**.

Quick check:
```bash
curl http://localhost:4000/health
# {"status":"ok","service":"PerkPay API"}
```

Create your first signup (customer):
```bash
curl -X POST http://localhost:4000/auth/signup -H "Content-Type: application/json" \
  -d '{"name":"Your Name","email":"you@example.com","password":"test1234","role":"customer"}'
```

### Create the first admin account (manual, one-time)

Admin accounts aren't created through signup (only `customer`/`shopkeeper` are).
Run this once in Supabase's SQL Editor, replacing the password hash:

```bash
# In perkpay-backend, generate a bcrypt hash for your chosen admin password:
node -e "console.log(require('bcryptjs').hashSync('YOUR_ADMIN_PASSWORD', 10))"
```

Then in Supabase SQL Editor:
```sql
insert into users (name, email, password_hash, role)
values ('Admin', 'admin@perkpay.com', '<paste-the-hash-here>', 'admin');
```

Now log in on the frontend with that email/password to reach `/admin`.

## 3. Frontend setup

```bash
cd perkpay-frontend
npm install
npm run dev
```

Opens on **http://localhost:5173**. It's already pointed at
`http://localhost:4000` for the API — see `.env` (`VITE_API_BASE`) if you
need to change that.

## 4. How payment actually works (real UPI, not a gateway)

The QR the shopkeeper generates is a **standard UPI deep link**
(`upi://pay?pa=<shop's VPA>&pn=<shop name>&am=<amount>&tr=<order id>`) —
the exact same format real merchant QR codes use. Money goes directly
from the customer's bank to the **shopkeeper's own UPI ID** (set by the
admin when the shop is created). PerkPay never holds or routes the money.

1. **Admin registers a shop** → must enter the shopkeeper's UPI ID
   (e.g. `shopname@okhdfcbank`) at this point. This is required.
2. **Shopkeeper generates a bill** → QR is shown, encoding that UPI link.
3. **Customer scans it in the PerkPay app** → sees the bill, can choose
   to apply reward points to discount it → taps "Continue" → their
   phone opens the installed UPI app (GPay/PhonePe/Paytm/etc.) with the
   shop's VPA and the (possibly discounted) amount **pre-filled**, same
   as Zomato/Swiggy.
4. Customer completes the payment in their UPI app, returns to PerkPay,
   and taps **"I've completed the payment."**

### Why there's a manual confirm step

A raw UPI deep link is a direct bank-to-bank transfer — there's no
payment gateway in the middle, so there's no automatic webhook telling
PerkPay the payment succeeded (unlike Razorpay/Stripe checkouts). The
customer's own confirmation tap is what finalizes the transaction and
updates points on both sides. If you later want gateway-verified
confirmation instead of self-report, that means integrating a UPI PSP
with Intent+status APIs (e.g. Razorpay/Cashfree UPI Intent) — a bigger
change than swapping one endpoint, since it would route the money
through the aggregator rather than directly to the shopkeeper's VPA.

### Testing on one machine

Since real UPI links only do something on a phone with UPI apps
installed, testing this fully requires an actual phone. On desktop,
scanning will still fetch the bill correctly, but tapping "Continue"
won't open anything (no UPI apps on a laptop) — you can still test the
rest of the flow (points calculation, confirm button, balance update)
manually.

## 5. Points are per-shop, not a shared wallet

Points earned at Shop Y can **only** be redeemed at Shop Y — a separate
balance is tracked per (customer, shop) pair. `users.points_balance` is
repurposed as a **lifetime "total coins earned" counter** (display-only,
never decreases) shown on the customer's home screen and profile.

- After a payment completes, the customer sees a summary screen with:
  points earned in that specific visit, their running balance at that
  specific shop, and their lifetime total.
- The Profile tab has a "Points by shop" breakdown of every shop
  they've earned at.
- The shopkeeper's QR screen flips from a spinner to a green
  checkmark ("Payment received!") the moment the customer confirms —
  this was already working correctly, no change needed there.
- Referral sign-up bonuses (+50 pts) are **not** tied to any shop —
  they only count toward the lifetime total, since there's no shop
  context at signup time. They aren't currently spendable anywhere;
  let me know if you'd rather they land in a specific "starter" shop
  or become a general-purpose bonus instead.

## 6. What's new in this round

- **Shopkeeper's QR screen now reliably flips to green.** The bug was
  that navigating to a `upi://` link often reloads the mobile browser
  page, wiping the customer's in-progress state before they could tap
  "I've completed the payment." The pending order is now saved to
  `localStorage` before handoff and restored on return, so the confirm
  step always survives the round trip to the UPI app.
- **Shopkeepers can delete offers**, not just highlight them (Offers tab).
- **Customers see every registered shop**, sorted nearest-to-farthest,
  instead of only ones within a fixed radius (Shops tab).
- **Shopkeepers get a History tab**: today's transaction count, today's
  total collected, and the full transaction history for their shop.

## 7. Roles recap

| Role | Can do |
|---|---|
| **Customer** | Self sign-up (email+password), browse/scan shops, pay with UPI/points, save offers, refer friends |
| **Shopkeeper** | Created by admin only. Generates bill QR codes, posts/highlights offers for their assigned shop |
| **Admin** | The only role that can create/edit shops and assign a shopkeeper as owner. Also creates shopkeeper logins |

## Security note

Rotate your Supabase database password and Razorpay keys before going to
production — the test values currently in `.env` were shared in plain chat
text during development.
