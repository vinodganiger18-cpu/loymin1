const express = require('express');
const { supabaseAdmin } = require('../lib/supabase');
const { requireAuth, requireRole } = require('../middleware/auth');
const { validateBody, schemas } = require('../lib/validate');

const router = express.Router();

// GET /api/shops/nearby?lat=&lng=&radius=5
router.get('/nearby', async (req, res) => {
  const { lat, lng, radius = 5 } = req.query;
  if (!lat || !lng) return res.status(400).json({ error: 'lat and lng are required' });

  const { data, error } = await supabaseAdmin.rpc('nearby_shops', {
    in_lat: parseFloat(lat),
    in_lng: parseFloat(lng),
    in_radius_km: parseFloat(radius),
  });

  if (error) return res.status(500).json({ error: error.message });
  res.json({ shops: data });
});

// GET /api/shops/:id
router.get('/:id', async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from('shops').select('*').eq('id', req.params.id).single();
  if (error) return res.status(404).json({ error: 'Shop not found' });
  res.json({ shop: data });
});

// GET /api/shops  (admin: list all; shopkeeper: list own)
router.get('/', requireAuth, async (req, res) => {
  let query = supabaseAdmin.from('shops').select('*').order('created_at', { ascending: false });
  if (req.user.role === 'shopkeeper') query = query.eq('owner_id', req.user.sub);
  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  res.json({ shops: data });
});

// POST /api/shops  — ADMIN ONLY (shopkeepers cannot self-register a shop)
router.post('/', requireAuth, requireRole('admin'), validateBody(schemas.createShop), async (req, res) => {
  const { name, address, lat, lng, category, earn_points_per_100, redeem_points_per_rupee, owner_id, upi_id } = req.body;

  const { data, error } = await supabaseAdmin.rpc('create_shop', {
    in_name: name,
    in_address: address,
    in_lat: lat,
    in_lng: lng,
    in_category: category || 'other',
    in_earn_rate: earn_points_per_100,
    in_redeem_rate: redeem_points_per_rupee,
    in_owner_id: owner_id || null,
    in_created_by: req.user.sub,
    in_upi_id: upi_id,
  });

  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json({ shop: data });
});

// PATCH /api/shops/:id — ADMIN ONLY
router.patch('/:id', requireAuth, requireRole('admin'), validateBody(schemas.updateShop), async (req, res) => {
  const allowed = ['name', 'address', 'category', 'earn_points_per_100', 'redeem_points_per_rupee', 'owner_id', 'is_active', 'upi_id'];
  const updates = {};
  for (const key of allowed) if (key in req.body) updates[key] = req.body[key];

  const { data, error } = await supabaseAdmin
    .from('shops').update(updates).eq('id', req.params.id).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json({ shop: data });
});

// DELETE /api/shops/:id — ADMIN ONLY
router.delete('/:id', requireAuth, requireRole('admin'), async (req, res) => {
  const { error } = await supabaseAdmin.from('shops').delete().eq('id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.status(204).send();
});

// GET /api/shops/:id/my-points — customer's points balance at this specific shop
router.get('/:id/my-points', requireAuth, requireRole('customer'), async (req, res) => {
  const { data } = await supabaseAdmin
    .from('shop_points').select('balance').eq('user_id', req.user.sub).eq('shop_id', req.params.id).maybeSingle();
  res.json({ balance: data?.balance || 0 });
});

// GET /api/shops/my/summary — shopkeeper's shop + today's stats
router.get('/my/summary', requireAuth, requireRole('shopkeeper'), async (req, res) => {
  const { data: shop } = await supabaseAdmin.from('shops').select('*').eq('owner_id', req.user.sub).maybeSingle();
  if (!shop) return res.status(404).json({ error: 'No shop assigned to this account' });

  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const { data: todayTxns, error } = await supabaseAdmin
    .from('transactions')
    .select('amount, status')
    .eq('shop_id', shop.id)
    .gte('created_at', startOfDay.toISOString())
    .in('status', ['success', 'partial_paid', 'reward_paid']);
  if (error) return res.status(500).json({ error: error.message });

  const todayCount = todayTxns.length;
  const todayTotal = todayTxns.reduce((sum, t) => sum + Number(t.amount), 0);

  res.json({ shop, todayCount, todayTotal });
});

// GET /api/shops/my/transactions — full transaction history for the shopkeeper's shop
router.get('/my/transactions', requireAuth, requireRole('shopkeeper'), async (req, res) => {
  const { data: shop } = await supabaseAdmin.from('shops').select('id').eq('owner_id', req.user.sub).maybeSingle();
  if (!shop) return res.status(404).json({ error: 'No shop assigned to this account' });

  const { data, error } = await supabaseAdmin
    .from('transactions')
    .select('*, users(name, email)')
    .eq('shop_id', shop.id)
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ transactions: data });
});

module.exports = router;
