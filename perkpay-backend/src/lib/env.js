// Centralized environment validation. Called once at startup (app.js) so a
// misconfigured deploy fails fast and loudly instead of throwing obscure
// errors deep inside a request handler in production.
require('dotenv').config();

const REQUIRED = [
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'JWT_SECRET',
  'RAZORPAY_KEY_ID',
  'RAZORPAY_KEY_SECRET',
  'RAZORPAY_WEBHOOK_SECRET',
];

// Values that must never appear in production — leftovers from dev/chat.
const WEAK_JWT_SECRETS = new Set([
  '', 'secret', 'changeme', 'change-me', 'dev', 'devsecret', 'test', 'jwt',
  'perkpay', 'your-secret', 'supersecret',
]);

function validateEnv() {
  const missing = REQUIRED.filter((k) => !process.env[k] || !String(process.env[k]).trim());
  if (missing.length) {
    throw new Error(
      `Missing required environment variables: ${missing.join(', ')}. ` +
      `See .env.example. Refusing to start.`
    );
  }

  const secret = String(process.env.JWT_SECRET);
  const isProd = process.env.NODE_ENV === 'production';
  if (WEAK_JWT_SECRETS.has(secret.toLowerCase()) || (isProd && secret.length < 32)) {
    throw new Error(
      'JWT_SECRET is weak or default. Use a random string of at least 32 chars ' +
      '(e.g. `openssl rand -hex 32`). Refusing to start.'
    );
  }

  // Optional but recommended: CORS_ORIGIN. Warn (don't fail) so local dev works.
  if (isProd && !process.env.CORS_ORIGIN) {
    // eslint-disable-next-line no-console
    console.warn('[env] CORS_ORIGIN not set in production — CORS will reject browser requests.');
  }
}

// Convenience accessors with sane defaults.
const env = {
  get corsOrigins() {
    // Comma-separated allowlist. Empty in dev => reflect localhost origins.
    const raw = process.env.CORS_ORIGIN || '';
    return raw.split(',').map((s) => s.trim()).filter(Boolean);
  },
  get jwtIssuer() {
    return process.env.JWT_ISSUER || 'perkpay';
  },
  get jwtAudience() {
    return process.env.JWT_AUDIENCE || 'perkpay-app';
  },
  get isProd() {
    return process.env.NODE_ENV === 'production';
  },
  get qrExpiryMinutes() {
    return parseInt(process.env.QR_EXPIRY_MINUTES || '10', 10);
  },
  get cronSecret() {
    return process.env.CRON_SECRET || '';
  },
};

module.exports = { validateEnv, env };
