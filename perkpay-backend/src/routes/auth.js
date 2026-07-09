const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { supabaseAdmin } = require('../lib/supabase');
const { validateBody, schemas } = require('../lib/validate');
const { env } = require('../lib/env');

const router = express.Router();

function makeReferralCode(name) {
  const letters = (name || 'USER').replace(/[^a-zA-Z]/g, '').toUpperCase().slice(0, 5).padEnd(5, 'X');
  const digits = Math.floor(1000 + Math.random() * 9000);
  return `${letters}${digits}`;
}

function signToken(user) {
  return jwt.sign(
    { sub: user.id, role: user.role, name: user.name, email: user.email },
    process.env.JWT_SECRET,
    { expiresIn: '7d', issuer: env.jwtIssuer, audience: env.jwtAudience }
  );
}

function publicUser(u) {
  const { password_hash, ...rest } = u;
  return rest;
}

// POST /auth/signup  { name, email, password, referralCode? }
// Customer self-signup ONLY. Shopkeeper accounts are created exclusively
// by an admin via POST /api/admin/shopkeepers.
router.post('/signup', validateBody(schemas.signup), async (req, res) => {
  const { name, email, password, referralCode } = req.body;
  const role = 'customer';

  const { data: existing } = await supabaseAdmin
    .from('users').select('id').eq('email', email).maybeSingle();
  if (existing) return res.status(409).json({ error: 'Email already registered' });

  let referredBy = null;
  if (referralCode) {
    const { data: referrer } = await supabaseAdmin
      .from('users').select('id').eq('referral_code', referralCode).maybeSingle();
    if (referrer) referredBy = referrer.id;
  }

  const password_hash = await bcrypt.hash(password, 10);
  const referral_code = makeReferralCode(name);

  const { data: newUser, error } = await supabaseAdmin
    .from('users')
    .insert({
      name, email, password_hash, role,
      referral_code,
      referred_by: referredBy,
    })
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });

  // Referral bonus: +50 lifetime points to both users, atomically (see
  // apply_referral_bonus in production_functions.sql).
  if (referredBy) {
    const { error: refErr } = await supabaseAdmin.rpc('apply_referral_bonus', {
      in_new_user_id: newUser.id,
      in_referrer_id: referredBy,
    });
    if (refErr) console.error('[signup] referral bonus failed:', refErr);
    newUser.points_balance = (newUser.points_balance || 0) + 50;
  }

  const token = signToken(newUser);
  res.status(201).json({ token, user: publicUser(newUser) });
});

// POST /auth/login  { email, password }
router.post('/login', validateBody(schemas.login), async (req, res) => {
  const { email, password } = req.body;

  const { data: user } = await supabaseAdmin
    .from('users').select('*').eq('email', email).maybeSingle();

  if (!user) return res.status(401).json({ error: 'Invalid email or password' });

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) return res.status(401).json({ error: 'Invalid email or password' });

  const token = signToken(user);
  res.json({ token, user: publicUser(user) });
});

// GET /auth/me
router.get('/me', require('../middleware/auth').requireAuth, async (req, res) => {
  const { data: user, error } = await supabaseAdmin
    .from('users').select('*').eq('id', req.user.sub).single();
  if (error) return res.status(404).json({ error: 'User not found' });
  res.json({ user: publicUser(user) });
});

module.exports = router;
