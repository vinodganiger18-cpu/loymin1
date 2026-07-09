const { validateEnv, env } = require('./lib/env');
validateEnv(); // fail fast before anything else touches process.env

require('express-async-errors');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');

const authRoutes = require('./routes/auth');
const shopRoutes = require('./routes/shops');
const offerRoutes = require('./routes/offers');
const paymentRoutes = require('./routes/payments');
const { webhookRouter } = require('./routes/payments');
const userRoutes = require('./routes/users');
const adminRoutes = require('./routes/admin');
const { authLimiter, apiLimiter } = require('./middleware/rateLimit');

const app = express();

// Behind Vercel / any proxy — needed for correct client IPs in rate limiting.
app.set('trust proxy', 1);

app.use(helmet());

// CORS allowlist. In dev (no CORS_ORIGIN set) reflect the request origin so
// localhost:5173 works; in prod only the configured origins are allowed.
const allowlist = env.corsOrigins;
app.use(cors({
  origin(origin, cb) {
    if (!origin) return cb(null, true); // curl / server-to-server / same-origin
    if (allowlist.length === 0) return cb(null, true); // dev convenience
    return cb(null, allowlist.includes(origin));
  },
  credentials: true,
}));

// IMPORTANT: the Razorpay webhook needs the RAW body to verify the signature,
// so it is mounted BEFORE express.json() with its own raw parser.
app.use('/api/payments/webhook', express.raw({ type: '*/*' }), webhookRouter);

app.use(express.json({ limit: '100kb' }));

app.get('/health', (req, res) => res.json({ status: 'ok', service: 'PerkPay API' }));

app.use('/auth', authLimiter, authRoutes);
app.use('/api', apiLimiter);
app.use('/api/shops', shopRoutes);
app.use('/api/offers', offerRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/user', userRoutes);
app.use('/api/admin', adminRoutes);

// Centralized error handler — never leak internals to clients.
// Validation errors (err.status 400) carry a safe, explicit message; everything
// else is logged server-side and returned as a generic 500.
app.use((err, req, res, next) => {
  // eslint-disable-next-line no-console
  console.error(err);
  const status = err.status || 500;
  const safeMessage = err.expose === true || status < 500
    ? (err.message || 'Request failed')
    : 'Internal server error';
  res.status(status).json({ error: safeMessage });
});

// Only listen when run directly (local dev). On Vercel the app is imported
// as a serverless handler and must NOT bind a port.
if (require.main === module) {
  const PORT = process.env.PORT || 4000;
  app.listen(PORT, () => console.log(`PerkPay API running on port ${PORT}`));
}

module.exports = app;
