const express = require('express');
const { supabaseAdmin } = require('../lib/supabase');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

async function ownsShop(userId, shopId) {
  const { data } = await supabaseAdmin
    .from('shops').select('id').eq('id', shopId).eq('owner_id', userId).maybeSingle();
  return !!data;
}

// GET /api/offers  (public — all active offers, highlighted first)
router.get('/', async (req, res) => {
  const { shop_id } = req.query;
  let query = supabaseAdmin
    .from('offers')
    .select('*, shops(name)')
    .eq('is_active', true)
    .order('is_highlighted', { ascending: false })
    .order('created_at', { ascending: false });
  if (shop_id) query = query.eq('shop_id', shop_id);

  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  res.json({ offers: data });
});

// POST /api/offers — shopkeeper only, must own the shop
router.post('/', requireAuth, requireRole('shopkeeper'), async (req, res) => {
  const { shop_id, title, description, points_required, reward_type, reward_value, is_highlighted, valid_until } = req.body;

  if (!shop_id || !title || !points_required || !reward_type) {
    return res.status(400).json({ error: 'shop_id, title, points_required, reward_type are required' });
  }
  if (!(await ownsShop(req.user.sub, shop_id))) {
    return res.status(403).json({ error: 'You do not own this shop' });
  }

  const { data, error } = await supabaseAdmin
    .from('offers')
    .insert({
      shop_id, title, description, points_required, reward_type, reward_value,
      is_highlighted: !!is_highlighted, valid_until, created_by: req.user.sub,
    })
    .select().single();

  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json({ offer: data });
});

// PATCH /api/offers/:id — shopkeeper only, must own the shop (e.g. toggle highlight)
router.patch('/:id', requireAuth, requireRole('shopkeeper'), async (req, res) => {
  const { data: offer } = await supabaseAdmin.from('offers').select('shop_id').eq('id', req.params.id).single();
  if (!offer || !(await ownsShop(req.user.sub, offer.shop_id))) {
    return res.status(403).json({ error: 'You do not own this offer' });
  }

  const allowed = ['title', 'description', 'points_required', 'reward_type', 'reward_value', 'is_highlighted', 'is_active', 'valid_until'];
  const updates = {};
  for (const key of allowed) if (key in req.body) updates[key] = req.body[key];

  const { data, error } = await supabaseAdmin
    .from('offers').update(updates).eq('id', req.params.id).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json({ offer: data });
});

// POST /api/offers/:id/save — customer saves an offer for later
router.post('/:id/save', requireAuth, requireRole('customer'), async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from('saved_offers')
    .insert({ user_id: req.user.sub, offer_id: req.params.id })
    .select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json({ saved: data });
});

// DELETE /api/offers/:id — shopkeeper only, must own the shop
router.delete('/:id', requireAuth, requireRole('shopkeeper'), async (req, res) => {
  const { data: offer } = await supabaseAdmin.from('offers').select('shop_id').eq('id', req.params.id).single();
  if (!offer || !(await ownsShop(req.user.sub, offer.shop_id))) {
    return res.status(403).json({ error: 'You do not own this offer' });
  }
  const { error } = await supabaseAdmin.from('offers').delete().eq('id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.status(204).send();
});

module.exports = router;
