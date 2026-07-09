const express = require('express');
const bcrypt = require('bcryptjs');
const { supabaseAdmin } = require('../lib/supabase');
const { requireAuth, requireRole } = require('../middleware/auth');
const { validateBody, schemas } = require('../lib/validate');

const router = express.Router();
router.use(requireAuth, requireRole('admin'));

// GET /api/admin/shopkeepers — list shopkeeper accounts (to assign as shop owners)
router.get('/shopkeepers', async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from('users').select('id, name, email, created_at')
    .eq('role', 'shopkeeper')
    .order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json({ shopkeepers: data });
});

// POST /api/admin/shopkeepers — admin creates a shopkeeper login
// body: { name, email, password }
router.post('/shopkeepers', validateBody(schemas.createShopkeeper), async (req, res) => {
  const { name, email, password } = req.body;
  const { data: existing } = await supabaseAdmin.from('users').select('id').eq('email', email).maybeSingle();
  if (existing) return res.status(409).json({ error: 'Email already registered' });

  const password_hash = await bcrypt.hash(password, 10);
  const referral_code = `${name.replace(/[^a-zA-Z]/g, '').toUpperCase().slice(0, 5).padEnd(5, 'X')}${Math.floor(1000 + Math.random() * 9000)}`;

  const { data, error } = await supabaseAdmin
    .from('users')
    .insert({ name, email, password_hash, role: 'shopkeeper', referral_code })
    .select('id, name, email, role, created_at')
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json({ shopkeeper: data });
});

// GET /api/admin/users — list all users (basic admin oversight)
router.get('/users', async (req, res) => {
  const { role } = req.query;
  let query = supabaseAdmin.from('users').select('id, name, email, role, points_balance, created_at').order('created_at', { ascending: false });
  if (role) query = query.eq('role', role);
  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  res.json({ users: data });
});

// GET /api/admin/transactions — all transactions across all shops
router.get('/transactions', async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from('transactions').select('*, shops(name), users(name, email)')
    .order('created_at', { ascending: false }).limit(200);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ transactions: data });
});

module.exports = router;
