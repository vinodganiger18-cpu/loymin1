const express = require('express');
const crypto = require('crypto');
const QRCode = require('qrcode');
const { supabaseAdmin } = require('../lib/supabase');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

function genOrderId() {
  return `ORD${Date.now()}${crypto.randomBytes(3).toString('hex')}`;
}

// Builds a standard UPI deep link — the same format real merchant QR
// codes use (upi://pay?...). Any UPI app on the customer's phone can
// read this directly; no payment gateway is involved, money goes
// straight from the customer's bank to the shopkeeper's VPA (shop.upi_id).
function buildUpiLink({ vpa, payeeName, amount, orderId, note }) {
  const params = new URLSearchParams({
    pa: vpa,
    pn: payeeName,
    am: amount.toFixed(2),
    cu: 'INR',
    tr: orderId,
    tn: note || `Payment via PerkPay`,
  });
  return `upi://pay?${params.toString()}`;
}

// Points are a SEPARATE wallet per shop — points earned at Shop Y can
// only be redeemed at Shop Y. Returns the current balance (0 if no row yet).
async function getShopPoints(userId, shopId) {
  const { data } = await supabaseAdmin
    .from('shop_points').select('balance').eq('user_id', userId).eq('shop_id', shopId).maybeSingle();
  return data?.balance || 0;
}

// Upserts a shop_points row by a signed delta (positive = earn, negative = redeem).
async function adjustShopPoints(userId, shopId, delta) {
  const current = await getShopPoints(userId, shopId);
  const next = Math.max(0, current + delta);
  await supabaseAdmin
    .from('shop_points')
    .upsert({ user_id: userId, shop_id: shopId, balance: next, updated_at: new Date().toISOString() }, { onConflict: 'user_id,shop_id' });
  return next;
}

// ---------------------------------------------------------
// SHOPKEEPER: generate bill + UPI QR (2-min expiry)
// POST /api/payments/generate-qr  { amount }
// ---------------------------------------------------------
router.post('/generate-qr', requireAuth, requireRole('shopkeeper'), async (req, res) => {
  const { amount } = req.body;
  if (!amount || amount <= 0) return res.status(400).json({ error: 'Amount must be greater than 0' });

  const { data: shop } = await supabaseAdmin
    .from('shops').select('id, name, upi_id').eq('owner_id', req.user.sub).maybeSingle();
  if (!shop) return res.status(403).json({ error: 'No shop assigned to this shopkeeper account' });
  if (!shop.upi_id) return res.status(400).json({ error: 'This shop has no UPI ID on file — ask the admin to add one' });

  const orderId = genOrderId();
  const expiryMinutes = parseInt(process.env.QR_EXPIRY_MINUTES || '2', 10);
  const expiresAt = new Date(Date.now() + expiryMinutes * 60 * 1000);

  const { data: txn, error } = await supabaseAdmin
    .from('transactions')
    .insert({ order_id: orderId, shop_id: shop.id, amount, status: 'pending', expires_at: expiresAt.toISOString() })
    .select().single();
  if (error) return res.status(500).json({ error: error.message });

  const upiLink = buildUpiLink({ vpa: shop.upi_id, payeeName: shop.name, amount, orderId, note: `Bill at ${shop.name}` });
  const qrDataUrl = await QRCode.toDataURL(upiLink);

  res.status(201).json({ qrDataUrl, orderId, expiresAt: expiresAt.toISOString(), transactionId: txn.id });
});

// ---------------------------------------------------------
// CUSTOMER: scan QR → look up the order by its ref (tr= param).
// Shows the SHOP-SPECIFIC points balance, not a global one.
// GET /api/payments/initiate/:orderId
// ---------------------------------------------------------
router.get('/initiate/:orderId', requireAuth, requireRole('customer'), async (req, res) => {
  const { orderId } = req.params;

  const { data: txn } = await supabaseAdmin.from('transactions').select('*').eq('order_id', orderId).maybeSingle();
  if (!txn || txn.status !== 'pending' || new Date(txn.expires_at) < new Date()) {
    return res.status(400).json({ valid: false, error: 'This QR code has expired or the payment is already in progress/completed.' });
  }

  const { data: shop } = await supabaseAdmin.from('shops').select('*').eq('id', txn.shop_id).single();
  const shopPoints = await getShopPoints(req.user.sub, shop.id);

  const maxDiscountRupees = Math.floor(shopPoints / shop.redeem_points_per_rupee);
  const maxDiscount = Math.min(maxDiscountRupees, txn.amount);

  res.json({
    valid: true,
    orderId, amount: txn.amount, shopId: shop.id,
    shopName: shop.name,
    earnRate: shop.earn_points_per_100,
    redeemRate: shop.redeem_points_per_rupee,
    customerPoints: shopPoints, // this shop's balance only
    maxDiscount,
  });
});

// ---------------------------------------------------------
// CUSTOMER: lock in whether they're applying reward points (from THIS
// shop's balance only), get back the UPI deep link for the remaining amount.
// POST /api/payments/lock-amount  { orderId, applyRewards }
// ---------------------------------------------------------
router.post('/lock-amount', requireAuth, requireRole('customer'), async (req, res) => {
  const { orderId, applyRewards = false } = req.body;

  const { data: txn } = await supabaseAdmin.from('transactions').select('*').eq('order_id', orderId).single();
  if (!txn || txn.status !== 'pending') return res.status(400).json({ error: 'Invalid or already-processed order' });

  const { data: shop } = await supabaseAdmin.from('shops').select('*').eq('id', txn.shop_id).single();
  const shopPoints = await getShopPoints(req.user.sub, shop.id);

  let rewardPointsUsed = 0, rewardValueUsed = 0, remaining = txn.amount;

  if (applyRewards) {
    const maxDiscountRupees = Math.floor(shopPoints / shop.redeem_points_per_rupee);
    rewardValueUsed = Math.min(maxDiscountRupees, txn.amount);
    rewardPointsUsed = rewardValueUsed * shop.redeem_points_per_rupee;
    remaining = txn.amount - rewardValueUsed;
  }

  await supabaseAdmin.from('transactions').update({
    user_id: req.user.sub,
    reward_points_used: rewardPointsUsed,
    reward_value_used: rewardValueUsed,
  }).eq('order_id', orderId);

  // Full reward payment — no UPI needed at all, settle immediately.
  if (remaining <= 0) {
    const result = await settleTransaction({ ...txn, reward_points_used: rewardPointsUsed, reward_value_used: rewardValueUsed }, shop, 0, 'reward_paid');
    return res.json(result);
  }

  const upiLink = buildUpiLink({ vpa: shop.upi_id, payeeName: shop.name, amount: remaining, orderId, note: `Bill at ${shop.name}` });
  res.json({ upiLink, remaining, rewardValueUsed });
});

// ---------------------------------------------------------
// CUSTOMER: self-confirm after returning from their UPI app.
// This is the one trust-based step in the flow — plain UPI deep links
// (unlike a gateway/aggregator) don't give us a server-side webhook,
// so we rely on the customer confirming completion here.
// POST /api/payments/confirm  { orderId }
// ---------------------------------------------------------
router.post('/confirm', requireAuth, requireRole('customer'), async (req, res) => {
  const { orderId } = req.body;
  const { data: txn } = await supabaseAdmin.from('transactions').select('*').eq('order_id', orderId).single();
  if (!txn || txn.status !== 'pending') return res.status(400).json({ error: 'Invalid or already-processed order' });
  if (txn.user_id !== req.user.sub) return res.status(403).json({ error: 'Not your transaction' });

  const { data: shop } = await supabaseAdmin.from('shops').select('*').eq('id', txn.shop_id).single();
  const upiPaid = txn.amount - txn.reward_value_used;
  const newStatus = txn.reward_value_used > 0 ? 'partial_paid' : 'success';

  const result = await settleTransaction(txn, shop, upiPaid, newStatus);
  res.json(result);
});

// Applies the earn/redeem to the shop-specific wallet, bumps the
// lifetime "total coins earned" counter, and logs everything.
async function settleTransaction(txn, shop, upiPaid, newStatus) {
  const earnedPoints = Math.floor(upiPaid / 100) * shop.earn_points_per_100;

  await supabaseAdmin.from('transactions').update({
    status: newStatus,
    upi_paid: upiPaid,
    earned_points: earnedPoints,
  }).eq('id', txn.id);

  if (txn.reward_points_used > 0) {
    await supabaseAdmin.from('points_log').insert({
      user_id: txn.user_id, transaction_id: txn.id, shop_id: shop.id,
      points_change: -txn.reward_points_used, reason: 'reward_redeem',
    });
  }
  if (earnedPoints > 0) {
    await supabaseAdmin.from('points_log').insert({
      user_id: txn.user_id, transaction_id: txn.id, shop_id: shop.id,
      points_change: earnedPoints, reason: 'purchase',
    });
  }

  const netChange = earnedPoints - txn.reward_points_used;
  const newShopBalance = await adjustShopPoints(txn.user_id, shop.id, netChange);

  // Lifetime "total coins earned" — display-only, never decreases.
  if (earnedPoints > 0) {
    const { data: customer } = await supabaseAdmin.from('users').select('points_balance').eq('id', txn.user_id).single();
    await supabaseAdmin.from('users').update({ points_balance: customer.points_balance + earnedPoints }).eq('id', txn.user_id);
  }

  return { success: true, earnedPoints, shopBalance: newShopBalance, shopName: shop.name, shopId: shop.id };
}

// ---------------------------------------------------------
// Poll transaction status — used by the shopkeeper's QR screen to
// detect when the customer has confirmed payment, and by the customer's
// app to show the final "payment received" summary after redirecting back.
// GET /api/payments/status/:orderId
// ---------------------------------------------------------
router.get('/status/:orderId', requireAuth, async (req, res) => {
  const { data: txn } = await supabaseAdmin
    .from('transactions').select('*, shops(owner_id, name), users(name)').eq('order_id', req.params.orderId).single();
  if (!txn) return res.status(404).json({ error: 'Order not found' });

  const isOwnerShopkeeper = req.user.role === 'shopkeeper' && txn.shops?.owner_id === req.user.sub;
  const isOwnerCustomer = req.user.role === 'customer' && txn.user_id === req.user.sub;
  if (!isOwnerShopkeeper && !isOwnerCustomer && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Not authorized to view this order' });
  }

  let shopBalance = null;
  if (isOwnerCustomer) shopBalance = await getShopPoints(req.user.sub, txn.shop_id);

  res.json({
    status: txn.status,
    amount: txn.amount,
    upiPaid: txn.upi_paid,
    rewardValueUsed: txn.reward_value_used,
    earnedPoints: txn.earned_points,
    shopName: txn.shops?.name,
    shopBalance,
    customerName: txn.users?.name || null,
  });
});

module.exports = router;
