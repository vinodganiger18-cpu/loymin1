const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { supabaseAdmin } = require('../lib/supabase');

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
    { expiresIn: '7d' }
  );
}

function publicUser(u) {
  const { password_hash, ...rest } = u;
  return rest;
}

// POST /auth/signup  { name, email, password, referralCode? }
// Customer self-signup ONLY. Shopkeeper accounts are created exclusively
// by an admin via POST /api/admin/shopkeepers.
router.post('/signup', async (req, res) => {
  const { name, email, password, referralCode } = req.body;
  const role = 'customer';

  if (!name || !email || !password) {
    return res.status(400).json({ error: 'name, email and password are required' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }

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
      points_balance: referredBy ? 50 : 0,
    })
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });

  // referral bonus: 50 points each, logged in points_log
  if (referredBy) {
    await supabaseAdmin.from('points_log').insert([
      { user_id: newUser.id, points_change: 50, reason: 'referral_bonus' },
    ]);
    const { data: referrer } = await supabaseAdmin
      .from('users').select('points_balance').eq('id', referredBy).single();
    await supabaseAdmin
      .from('users').update({ points_balance: referrer.points_balance + 50 }).eq('id', referredBy);
    await supabaseAdmin.from('points_log').insert([
      { user_id: referredBy, points_change: 50, reason: 'referral_bonus' },
    ]);
  }

  const token = signToken(newUser);
  res.status(201).json({ token, user: publicUser(newUser) });
});

// POST /auth/login  { email, password }
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'email and password are required' });

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
