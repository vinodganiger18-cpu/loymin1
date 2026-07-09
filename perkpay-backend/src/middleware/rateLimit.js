const rateLimit = require('express-rate-limit');

// Tight limiter for auth endpoints — blunts credential stuffing / brute force.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 min
  max: 20,                  // 20 attempts / IP / window
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts. Please try again later.' },
});

// General limiter for the rest of the API.
const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 min
  max: 120,            // 120 req / IP / min
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please slow down.' },
});

module.exports = { authLimiter, apiLimiter };
