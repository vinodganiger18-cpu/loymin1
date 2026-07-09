# PerkPay — Loyalty Points Web App

**Live Demo:** [https://loymin1-dusky.vercel.app/](https://loymin1-dusky.vercel.app/)
**GitHub Repository:** [https://github.com/vinodganiger18-cpu/loymin1.git](https://github.com/vinodganiger18-cpu/loymin1.git)

A loyalty-points web app: customers earn/redeem points via Razorpay-verified UPI
payments at local shops. Shops are onboarded only by an admin, and shopkeepers
post offers customers can browse and save.

## What's in this package

```
perkpay-db/          SQL to run in Supabase (schema + PostGIS + production functions)
perkpay-backend/     Express API (Node.js) — deployed as Vercel serverless
perkpay-frontend/    React app (Vite) — white/violet theme
api/                 Vercel serverless entrypoint (re-exports Express app)
```

---

## 1. Database (Supabase)

In your Supabase project → SQL Editor, run in this order:
1. `perkpay-db/schema.sql`
2. `perkpay-db/functions.sql`
3. `perkpay-db/add_upi_id.sql` (adds the shop UPI ID column)
4. `perkpay-db/seed_admin.sql` (creates your first admin login — see below)
5. `perkpay-db/shop_points.sql` (switches points to a per-shop wallet)
6. `perkpay-db/production_functions.sql` (atomic settlement, referral bonus, order expiry)

**If you already ran 1–5 before:** just run `production_functions.sql` — it uses
`create or replace function` and is safe to re-run.

## 2. Backend setup (local dev)

```bash
cd perkpay-backend
cp .env.example .env   # then fill in your real values
npm install
npm run dev
```

Server runs on **http://localhost:4000**.

Quick check:
```bash
curl http://localhost:4000/health
# {"status":"ok","service":"PerkPay API"}
```

### Environment variables

See `perkpay-backend/.env.example` for the full list. Required:

| Variable | Description |
|---|---|
| `SUPABASE_URL` | Your Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service-role key (not the anon key) |
| `JWT_SECRET` | Random string, ≥32 chars in production |
| `RAZORPAY_KEY_ID` | Razorpay API key ID |
| `RAZORPAY_KEY_SECRET` | Razorpay API key secret |
| `RAZORPAY_WEBHOOK_SECRET` | Razorpay webhook signing secret |
| `CORS_ORIGIN` | Comma-separated frontend origins (empty = allow all, for dev) |

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

## 3. Frontend setup (local dev)

```bash
cd perkpay-frontend
cp .env.example .env   # VITE_API_BASE=http://localhost:4000
npm install
npm run dev
```

Opens on **http://localhost:5173**.

## 4. How payment works (Razorpay-verified)

Payments are processed through the **Razorpay payment gateway** with server-side
webhook verification. Money routes through Razorpay settlement, not direct-to-VPA.

1. **Admin registers a shop** → enters the shopkeeper's UPI ID (informational).
2. **Shopkeeper generates a bill** → backend creates a PerkPay order; QR is shown
   encoding the order reference (`perkpay://pay?order=ORD...`).
3. **Customer scans it in the PerkPay app** → sees the bill, can choose to apply
   reward points to discount it → taps "Pay".
4. **If rewards cover the full amount** → settled immediately, no payment needed.
5. **Otherwise** → backend creates a Razorpay order for the remaining amount →
   Razorpay Checkout opens on the customer's device (UPI/card/netbanking).
6. **On payment success** → Razorpay fires a webhook (`POST /api/payments/webhook`)
   → backend verifies the HMAC-SHA256 signature → atomically settles the transaction
   (earns points, deducts redeemed points, updates balances) via the `settle_transaction()`
   Postgres function. The shopkeeper's QR screen flips to a green checkmark.

> **No manual "I've completed the payment" step** — settlement is entirely
> server-verified via the Razorpay webhook. Idempotent: replayed webhooks
> are safe.

### Testing payments

Use Razorpay's [test mode](https://razorpay.com/docs/payments/payments/test-mode/)
with test API keys. The Checkout SDK will show a test payment form.

## 5. Points are per-shop, not a shared wallet

Points earned at Shop Y can **only** be redeemed at Shop Y — a separate
balance is tracked per (customer, shop) pair. `users.points_balance` is
repurposed as a **lifetime "total coins earned" counter** (display-only,
never decreases) shown on the customer's home screen and profile.

- After a payment completes, the customer sees a summary screen with:
  points earned in that specific visit, their running balance at that
  specific shop, and their lifetime total.
- The Profile tab has a "Points by shop" breakdown.
- Referral sign-up bonuses (+50 pts) are **not** tied to any shop —
  they only count toward the lifetime total, since there's no shop
  context at signup time.

## 6. Deploying to Vercel (production)

The app deploys as a **single Vercel project** — frontend as static build,
backend as a serverless function.

### Steps

1. Push the repo to GitHub.
2. Import the project in [Vercel](https://vercel.com/new).
3. Add all backend environment variables in Vercel → Project Settings → Environment Variables:
   - `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
   - `JWT_SECRET` (use `openssl rand -hex 32`)
   - `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`
   - `CORS_ORIGIN` = `https://your-vercel-domain.vercel.app`
   - `CRON_SECRET` = a random string for the expiry cron
   - `NODE_ENV` = `production`
4. **Do NOT set `VITE_API_BASE`** — the frontend defaults to same-origin (`""`),
   which works because the backend serverless function is on the same Vercel domain.
5. Deploy. Vercel will build the frontend and set up the serverless function automatically.
6. In Razorpay Dashboard → Webhooks, add `https://your-domain.vercel.app/api/payments/webhook`
   with events `payment.captured` and `order.paid`.
7. Run `production_functions.sql` in Supabase SQL Editor if you haven't already.

### How it's wired

- `api/index.js` re-exports the Express app as a Vercel serverless handler.
- `vercel.json` routes `/api/*`, `/auth/*`, `/health` to the serverless function;
  everything else to the SPA.
- A cron job (`*/5 * * * *`) calls `/api/payments/expire` to mark stale pending
  orders as expired.

## 7. Roles recap

| Role | Can do |
|---|---|
| **Customer** | Self sign-up (email+password), browse/scan shops, pay via Razorpay, earn/redeem points, save offers, refer friends |
| **Shopkeeper** | Created by admin only. Generates bill QR codes, posts/highlights/deletes offers, views transaction history |
| **Admin** | Creates/edits shops, assigns shopkeeper owners, creates shopkeeper logins, views all transactions |

## 8. Security notes

- **Env validation on boot** — the server refuses to start if required env vars are
  missing or if `JWT_SECRET` is weak/default.
- **Rate limiting** — `/auth/*` (20 req / 15 min / IP), `/api/*` (120 req / min / IP).
- **Helmet** — standard security headers.
- **CORS** — allowlisted origins only in production.
- **Input validation** — all write endpoints use `zod` schemas.
- **Error hygiene** — 5xx errors never leak internals to clients.
- **Webhook verification** — HMAC-SHA256 with constant-time comparison.
- **Atomic settlement** — single Postgres transaction prevents race conditions and
  double-credit on webhook replay.

> **Before going to production:** rotate your Supabase database password and
> Razorpay keys. Never commit `.env` files to git.
