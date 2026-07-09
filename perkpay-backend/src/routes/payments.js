const express = require('express');
const crypto = require('crypto');
const QRCode = require('qrcode');
const { supabaseAdmin } = require('../lib/supabase');
const { requireAuth, requireRole } = require('../middleware/auth');
const { validateBody, schemas, HttpError } = require('../lib/validate');
const { razorpay, verifyWebhookSignature } = require('../lib/razorpay');
const { env } = require('../lib/env');

const router = express.Router();

function genOrderId() {
  return `ORD${Date.now()}${crypto.randomBytes(4).toString('hex')}`;
}

async function getShopPoints(userId, shopId) {
  const { data } = await supabaseAdmin
    .from('shop_points').select('balance').eq('user_id', userId).eq('shop_id', shopId).maybeSingle();
  return data?.balance || 0;
}

// Runs the atomic settlement SQL function (earn/redeem/log/counter/status in
// one transaction, idempotent on replay). See production_functions.sql.
async function settle(orderId, upiPaid, newStatus, razorpayPaymentId = null) {
  const { data, error } = await supabaseAdmin.rpc('settle_transaction', {
    in_order_id: orderId,
    in_upi_paid: upiPaid,
    in_new_status: newStatus,
    in_razorpay_payment_id: razorpayPaymentId,
  });
  if (error) throw new Error(`settle_transaction failed: ${error.message}`);
  return data;
}

// ---------------------------------------------------------
// SHOPKEEPER: create a bill. Generates a PerkPay order ref + QR the customer
// scans. The actual Razorpay order is created later (at lock-amount), once the
// customer has decided whether to apply reward points, since that changes the
// payable amount.
// POST /api/payments/generate-qr  { amount }
// ---------------------------------------------------------
router.post('/generate-qr', requireAuth, requireRole('shopkeeper'), validateBody(schemas.generateQr), async (req, res) => {
  const { amount } = req.body;

  const { data: shop } = await supabaseAdmin
    .from('shops').select('id, name, upi_id').eq('owner_id', req.user.sub).maybeSingle();
  if (!shop) throw new HttpError(403, 'No shop assigned to this shopkeeper account');

  const orderId = genOrderId();
  const expiresAt = new Date(Date.now() + env.qrExpiryMinutes * 60 * 1000);

  const { data: txn, error } = await supabaseAdmin
    .from('transactions')
    .insert({ order_id: orderId, shop_id: shop.id, amount, status: 'pending', expires_at: expiresAt.toISOString() })
    .select().single();
  if (error) throw new Error(error.message);

  // QR encodes our order ref; the customer app looks it up and opens Razorpay.
  const qrDataUrl = await QRCode.toDataURL(`perkpay://pay?order=${orderId}`);

  res.status(201).json({ qrDataUrl, orderId, expiresAt: expiresAt.toISOString(), transactionId: txn.id });
});

// ---------------------------------------------------------
// CUSTOMER: scan QR → look up the order, show shop-specific points balance.
// GET /api/payments/initiate/:orderId
// ---------------------------------------------------------
router.get('/initiate/:orderId', requireAuth, requireRole('customer'), async (req, res) => {
  const { orderId } = req.params;

  const { data: txn } = await supabaseAdmin.from('transactions').select('*').eq('order_id', orderId).maybeSingle();
  if (!txn || txn.status !== 'pending' || new Date(txn.expires_at) < new Date()) {
    throw new HttpError(400, 'This QR code has expired or the payment is already in progress/completed.');
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
    customerPoints: shopPoints,
    maxDiscount,
  });
});

// ---------------------------------------------------------
// CUSTOMER: lock in reward usage, then create the Razorpay order for the
// remaining (possibly discounted) amount and return the checkout parameters.
// If rewards cover the whole bill, settle immediately (no Razorpay needed).
// POST /api/payments/lock-amount  { orderId, applyRewards }
// ---------------------------------------------------------
router.post('/lock-amount', requireAuth, requireRole('customer'), validateBody(schemas.lockAmount), async (req, res) => {
  const { orderId, applyRewards } = req.body;

  const { data: txn } = await supabaseAdmin.from('transactions').select('*').eq('order_id', orderId).maybeSingle();
  if (!txn || txn.status !== 'pending') throw new HttpError(400, 'Invalid or already-processed order');
  if (new Date(txn.expires_at) < new Date()) throw new HttpError(400, 'This bill has expired.');

  const { data: shop } = await supabaseAdmin.from('shops').select('*').eq('id', txn.shop_id).single();
  const shopPoints = await getShopPoints(req.user.sub, shop.id);

  let rewardPointsUsed = 0, rewardValueUsed = 0, remaining = txn.amount;
  if (applyRewards) {
    const maxDiscountRupees = Math.floor(shopPoints / shop.redeem_points_per_rupee);
    rewardValueUsed = Math.min(maxDiscountRupees, txn.amount);
    rewardPointsUsed = rewardValueUsed * shop.redeem_points_per_rupee;
    remaining = txn.amount - rewardValueUsed;
  }

  // Claim the transaction for this customer and record the reward decision.
  await supabaseAdmin.from('transactions').update({
    user_id: req.user.sub,
    reward_points_used: rewardPointsUsed,
    reward_value_used: rewardValueUsed,
  }).eq('order_id', orderId);

  // Fully covered by points — settle now, no UPI/Razorpay step.
  if (remaining <= 0) {
    const result = await settle(orderId, 0, 'reward_paid');
    return res.json({ fullyPaidByRewards: true, ...result });
  }

  // Create a Razorpay order for the remaining amount (in paise).
  const rzpOrder = await razorpay.orders.create({
    amount: remaining * 100,
    currency: 'INR',
    receipt: orderId,
    notes: { perkpayOrderId: orderId, shopId: shop.id },
  });

  await supabaseAdmin.from('transactions')
    .update({ razorpay_order_id: rzpOrder.id }).eq('order_id', orderId);

  res.json({
    fullyPaidByRewards: false,
    razorpayOrderId: rzpOrder.id,
    razorpayKeyId: process.env.RAZORPAY_KEY_ID,
    amount: remaining,          // rupees, for display
    amountPaise: remaining * 100,
    rewardValueUsed,
    shopName: shop.name,
    orderId,
  });
});

// ---------------------------------------------------------
// Poll transaction status — shopkeeper QR screen + customer summary screen.
// Settlement is driven by the Razorpay webhook, so this just reports state.
// GET /api/payments/status/:orderId
// ---------------------------------------------------------
router.get('/status/:orderId', requireAuth, async (req, res) => {
  const { data: txn } = await supabaseAdmin
    .from('transactions').select('*, shops(owner_id, name), users(name)').eq('order_id', req.params.orderId).maybeSingle();
  if (!txn) throw new HttpError(404, 'Order not found');

  const isOwnerShopkeeper = req.user.role === 'shopkeeper' && txn.shops?.owner_id === req.user.sub;
  const isOwnerCustomer = req.user.role === 'customer' && txn.user_id === req.user.sub;
  if (!isOwnerShopkeeper && !isOwnerCustomer && req.user.role !== 'admin') {
    throw new HttpError(403, 'Not authorized to view this order');
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

// ---------------------------------------------------------
// CRON: expire stale pending orders. Protected by a shared secret so only the
// scheduler (Vercel Cron) can call it. GET /api/payments/expire
// ---------------------------------------------------------
router.get('/expire', async (req, res) => {
  const secret = req.headers['authorization'] === `Bearer ${env.cronSecret}`
    || req.query.key === env.cronSecret;
  if (!env.cronSecret || !secret) throw new HttpError(401, 'Unauthorized');

  const { data, error } = await supabaseAdmin.rpc('mark_expired_orders');
  if (error) throw new Error(error.message);
  res.json({ expired: data });
});

// =========================================================
// WEBHOOK ROUTER — mounted separately in app.js with a RAW body parser so we
// can verify the signature over the exact bytes Razorpay sent.
// POST /api/payments/webhook
// =========================================================
const webhookRouter = express.Router();

webhookRouter.post('/', async (req, res) => {
  const signature = req.headers['x-razorpay-signature'];
  const rawBody = req.body; // Buffer, thanks to express.raw()

  if (!verifyWebhookSignature(rawBody, signature)) {
    return res.status(400).json({ error: 'Invalid signature' });
  }

  let event;
  try {
    event = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return res.status(400).json({ error: 'Invalid payload' });
  }

  // Acknowledge fast; only settle on a captured payment.
  if (event.event === 'payment.captured' || event.event === 'order.paid') {
    const payment = event.payload?.payment?.entity;
    const perkpayOrderId = payment?.notes?.perkpayOrderId;
    const razorpayOrderId = payment?.order_id;

    try {
      // Prefer the note; fall back to razorpay_order_id lookup.
      let orderId = perkpayOrderId;
      if (!orderId && razorpayOrderId) {
        const { data: txn } = await supabaseAdmin
          .from('transactions').select('order_id, reward_value_used')
          .eq('razorpay_order_id', razorpayOrderId).maybeSingle();
        orderId = txn?.order_id;
      }
      if (orderId) {
        const { data: txn } = await supabaseAdmin
          .from('transactions').select('reward_value_used').eq('order_id', orderId).maybeSingle();
        const upiPaid = Math.round((payment.amount || 0) / 100);
        const newStatus = (txn?.reward_value_used || 0) > 0 ? 'partial_paid' : 'success';
        await settle(orderId, upiPaid, newStatus, payment.id); // idempotent
      }
    } catch (err) {
      // Log but still 200 so Razorpay doesn't hammer retries on our bug;
      // the idempotent settle makes a later manual replay safe.
      // eslint-disable-next-line no-console
      console.error('[webhook] settle error:', err);
    }
  }

  res.json({ received: true });
});

module.exports = router;
module.exports.webhookRouter = webhookRouter;
