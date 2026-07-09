const { z } = require('zod');

// A thrown HttpError with expose:true is safe to show the client (see app.js
// error handler). Validation failures use this so users get actionable 400s.
class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
    this.expose = true;
  }
}

// Parse `body` against a zod schema; throw a safe 400 on failure.
function parse(schema, body) {
  const result = schema.safeParse(body);
  if (!result.success) {
    const first = result.error.issues[0];
    const path = first.path.length ? `${first.path.join('.')}: ` : '';
    throw new HttpError(400, `${path}${first.message}`);
  }
  return result.data;
}

// Express middleware factory: validates req.body and replaces it with the
// parsed/coerced result.
function validateBody(schema) {
  return (req, res, next) => {
    req.body = parse(schema, req.body);
    next();
  };
}

// ---- Reusable field schemas ----
const email = z.string().trim().toLowerCase().email('A valid email is required').max(255);
const password = z.string().min(8, 'Password must be at least 8 characters').max(128);
const name = z.string().trim().min(1, 'Name is required').max(100);
const upiId = z.string().trim().regex(/^[\w.\-]{2,256}@[a-zA-Z]{2,64}$/, 'A valid UPI ID (e.g. shop@okhdfcbank) is required');
const positiveInt = z.coerce.number().int().positive();
const money = z.coerce.number().int().positive().max(1_000_000, 'Amount is too large');

// ---- Endpoint schemas ----
const schemas = {
  signup: z.object({
    name,
    email,
    password,
    referralCode: z.string().trim().max(10).optional().or(z.literal('')),
  }),

  login: z.object({
    email,
    password: z.string().min(1, 'Password is required').max(128),
  }),

  createShopkeeper: z.object({ name, email, password }),

  createShop: z.object({
    name,
    address: z.string().trim().min(1, 'Address is required').max(500),
    lat: z.coerce.number().min(-90).max(90),
    lng: z.coerce.number().min(-180).max(180),
    category: z.string().trim().max(50).optional(),
    earn_points_per_100: positiveInt,
    redeem_points_per_rupee: positiveInt,
    owner_id: z.string().uuid().optional().nullable(),
    upi_id: upiId,
  }),

  updateShop: z.object({
    name: name.optional(),
    address: z.string().trim().min(1).max(500).optional(),
    category: z.string().trim().max(50).optional(),
    earn_points_per_100: positiveInt.optional(),
    redeem_points_per_rupee: positiveInt.optional(),
    owner_id: z.string().uuid().nullable().optional(),
    is_active: z.boolean().optional(),
    upi_id: upiId.optional(),
  }),

  createOffer: z.object({
    shop_id: z.string().uuid(),
    title: z.string().trim().min(1).max(100),
    description: z.string().trim().max(1000).optional().nullable(),
    points_required: positiveInt,
    reward_type: z.enum(['free_item', 'discount_coupon']),
    reward_value: z.string().trim().max(100).optional().nullable(),
    is_highlighted: z.boolean().optional(),
    valid_until: z.string().datetime().optional().nullable(),
  }),

  updateOffer: z.object({
    title: z.string().trim().min(1).max(100).optional(),
    description: z.string().trim().max(1000).nullable().optional(),
    points_required: positiveInt.optional(),
    reward_type: z.enum(['free_item', 'discount_coupon']).optional(),
    reward_value: z.string().trim().max(100).nullable().optional(),
    is_highlighted: z.boolean().optional(),
    is_active: z.boolean().optional(),
    valid_until: z.string().datetime().nullable().optional(),
  }),

  generateQr: z.object({ amount: money }),

  lockAmount: z.object({
    orderId: z.string().trim().min(1).max(50),
    applyRewards: z.boolean().optional().default(false),
  }),
};

module.exports = { z, HttpError, parse, validateBody, schemas };
