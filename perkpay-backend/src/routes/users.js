const express = require('express');
const { supabaseAdmin } = require('../lib/supabase');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

// GET /api/user/transactions
router.get('/transactions', requireAuth, requireRole('customer'), async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from('transactions')
    .select('*, shops(name)')
    .eq('user_id', req.user.sub)
    .order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json({ transactions: data });
});

// GET /api/user/favorites
router.get('/favorites', requireAuth, requireRole('customer'), async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from('favorite_shops').select('shop_id, shops(*)').eq('user_id', req.user.sub);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ favorites: data });
});

// POST /api/user/favorites/:shopId
router.post('/favorites/:shopId', requireAuth, requireRole('customer'), async (req, res) => {
  const { error } = await supabaseAdmin
    .from('favorite_shops').insert({ user_id: req.user.sub, shop_id: req.params.shopId });
  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json({ success: true });
});

// DELETE /api/user/favorites/:shopId
router.delete('/favorites/:shopId', requireAuth, requireRole('customer'), async (req, res) => {
  const { error } = await supabaseAdmin
    .from('favorite_shops').delete().eq('user_id', req.user.sub).eq('shop_id', req.params.shopId);
  if (error) return res.status(500).json({ error: error.message });
  res.status(204).send();
});

// GET /api/user/saved-offers
router.get('/saved-offers', requireAuth, requireRole('customer'), async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from('saved_offers').select('*, offers(*, shops(name))').eq('user_id', req.user.sub);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ savedOffers: data });
});

// GET /api/user/shop-points — breakdown of points balance per shop
router.get('/shop-points', requireAuth, requireRole('customer'), async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from('shop_points')
    .select('shop_id, balance, shops(name, category)')
    .eq('user_id', req.user.sub)
    .gt('balance', 0)
    .order('balance', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json({ shopPoints: data });
});

module.exports = router;
