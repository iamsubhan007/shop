import {
  pgTable,
  uuid,
  text,
  numeric,
  integer,
  boolean,
  timestamp,
  jsonb,
  index,
  uniqueIndex,
  doublePrecision,
} from 'drizzle-orm/pg-core';

// ==========================================
// 1. PROFILES (customers + staff)
// role: customer | owner | admin | kitchen
// ==========================================
export const profiles = pgTable('profiles', {
  id: uuid('id').defaultRandom().primaryKey(),
  email: text('email').unique(),
  passwordHash: text('password_hash'), // staff only (scrypt); customers use email OTP
  fullName: text('full_name'),
  phone: text('phone'),
  role: text('role').default('customer').notNull(),
  isActive: boolean('is_active').default(true).notNull(),
  loyaltyPoints: integer('loyalty_points').default(0).notNull(),
  lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

// ==========================================
// 2. CATEGORIES
// ==========================================
export const categories = pgTable('categories', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  slug: text('slug').unique().notNull(),
  description: text('description'),
  sortOrder: integer('sort_order').default(0),
  isActive: boolean('is_active').default(true),
  isPaused: boolean('is_paused').default(false).notNull(), // temporarily not orderable
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

// ==========================================
// 3. PRODUCTS
// ==========================================
export const products = pgTable('products', {
  id: uuid('id').defaultRandom().primaryKey(),
  categoryId: uuid('category_id').references(() => categories.id, { onDelete: 'set null' }),
  name: text('name').notNull(),
  description: text('description'),
  price: numeric('price', { precision: 10, scale: 2 }).notNull(),
  compareAtPrice: numeric('compare_at_price', { precision: 10, scale: 2 }), // original price when discounted
  isAvailable: boolean('is_available').default(true),
  isFeatured: boolean('is_featured').default(false),
  isSoldOut: boolean('is_sold_out').default(false).notNull(),
  unavailableUntil: timestamp('unavailable_until', { withTimezone: true }), // auto-reactivation
  trackStock: boolean('track_stock').default(false).notNull(),
  stockQty: integer('stock_qty').default(0).notNull(),
  lowStockThreshold: integer('low_stock_threshold').default(5).notNull(),
  sortOrder: integer('sort_order').default(0).notNull(),
  imageUrl: text('image_url'),
  additionalImages: text('additional_images').array(),
  genre: text('genre'),
  deletedAt: timestamp('deleted_at', { withTimezone: true }), // soft delete
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (t) => [index('products_category_idx').on(t.categoryId)]);

// ==========================================
// 4. DEALS / COMBOS
// ==========================================
export const deals = pgTable('deals', {
  id: uuid('id').defaultRandom().primaryKey(),
  title: text('title').notNull(),
  description: text('description'),
  price: numeric('price', { precision: 10, scale: 2 }).notNull(),
  originalPrice: numeric('original_price', { precision: 10, scale: 2 }),
  imageUrl: text('image_url'),
  items: text('items').array(), // legacy free-text contents (display)
  badge: text('badge'),
  startsAt: timestamp('starts_at', { withTimezone: true }),
  endsAt: timestamp('ends_at', { withTimezone: true }),
  isFeatured: boolean('is_featured').default(false).notNull(),
  isActive: boolean('is_active').default(true),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

// ==========================================
// 5. SHOP SETTINGS (key -> json)
// ==========================================
export const shopSettings = pgTable('shop_settings', {
  key: text('key').primaryKey(),
  value: jsonb('value').notNull(),
  description: text('description'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

// ==========================================
// 6. ORDERS
// ==========================================
export const orders = pgTable('orders', {
  id: uuid('id').defaultRandom().primaryKey(),
  orderNumber: text('order_number').unique().notNull(),
  userId: uuid('user_id').references(() => profiles.id, { onDelete: 'set null' }),
  idempotencyKey: text('idempotency_key').unique(),
  trackingToken: text('tracking_token').unique(),
  orderType: text('order_type').notNull(), // 'delivery' | 'pickup'
  status: text('status').default('Placed').notNull(),
  customerName: text('customer_name').notNull(),
  customerPhone: text('customer_phone').notNull(),
  customerEmail: text('customer_email'),
  deliveryAddress: text('delivery_address'),
  deliveryLat: numeric('delivery_lat', { precision: 10, scale: 7 }),
  deliveryLng: numeric('delivery_lng', { precision: 10, scale: 7 }),
  distanceKm: numeric('distance_km', { precision: 6, scale: 3 }),
  subtotal: numeric('subtotal', { precision: 10, scale: 2 }).notNull(),
  discountAmount: numeric('discount_amount', { precision: 10, scale: 2 }).default('0').notNull(),
  couponCode: text('coupon_code'),
  deliveryFee: numeric('delivery_fee', { precision: 10, scale: 2 }).default('0').notNull(),
  totalAmount: numeric('total_amount', { precision: 10, scale: 2 }).notNull(),
  paymentStatus: text('payment_status').default('pending').notNull(), // pending | submitted | verified | rejected | cod_pending | cod_collected | refunded
  paymentMethod: text('payment_method').default('bank_transfer').notNull(),
  paymentReference: text('payment_reference'),
  paymentProofUrl: text('payment_proof_url'),
  specialInstructions: text('special_instructions'),
  cancelReason: text('cancel_reason'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (t) => [
  index('orders_user_idx').on(t.userId),
  index('orders_status_idx').on(t.status),
  index('orders_created_idx').on(t.createdAt),
]);

// ==========================================
// 7. ORDER ITEMS (price/name snapshots)
// ==========================================
export const orderItems = pgTable('order_items', {
  id: uuid('id').defaultRandom().primaryKey(),
  orderId: uuid('order_id').references(() => orders.id, { onDelete: 'cascade' }).notNull(),
  productId: uuid('product_id').references(() => products.id, { onDelete: 'set null' }),
  dealId: uuid('deal_id').references(() => deals.id, { onDelete: 'set null' }),
  itemTitle: text('item_title').notNull(),
  unitPrice: numeric('unit_price', { precision: 10, scale: 2 }).notNull(),
  quantity: integer('quantity').notNull(),
  subtotalPrice: numeric('subtotal_price', { precision: 10, scale: 2 }).notNull(),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (t) => [index('order_items_order_idx').on(t.orderId)]);

// ==========================================
// 8. PAYMENT SUBMISSIONS
// ==========================================
export const paymentSubmissions = pgTable('payment_submissions', {
  id: uuid('id').defaultRandom().primaryKey(),
  orderId: uuid('order_id').references(() => orders.id, { onDelete: 'cascade' }).notNull(),
  userId: uuid('user_id').references(() => profiles.id, { onDelete: 'set null' }),
  paymentMethod: text('payment_method').default('bank_transfer').notNull(),
  bankName: text('bank_name'),
  transactionReference: text('transaction_reference').notNull(),
  senderAccount: text('sender_account'),
  proofImageUrl: text('proof_image_url'),
  status: text('status').default('pending').notNull(),
  adminNotes: text('admin_notes'),
  submittedAt: timestamp('submitted_at', { withTimezone: true }).defaultNow(),
  verifiedAt: timestamp('verified_at', { withTimezone: true }),
  verifiedBy: uuid('verified_by').references(() => profiles.id, { onDelete: 'set null' }),
});

// ==========================================
// 9. WISHLIST / 10. CART
// ==========================================
export const wishlist = pgTable('wishlist', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').references(() => profiles.id, { onDelete: 'cascade' }).notNull(),
  productId: uuid('product_id').references(() => products.id, { onDelete: 'cascade' }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

export const cartItems = pgTable('cart_items', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').references(() => profiles.id, { onDelete: 'cascade' }).notNull(),
  productId: uuid('product_id').references(() => products.id, { onDelete: 'cascade' }),
  dealId: uuid('deal_id').references(() => deals.id, { onDelete: 'cascade' }),
  quantity: integer('quantity').default(1).notNull(),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

// ==========================================
// 11. AUTH: SESSIONS, OTP CODES, RATE LIMITS
// ==========================================
export const sessions = pgTable('sessions', {
  id: uuid('id').defaultRandom().primaryKey(),
  tokenHash: text('token_hash').unique().notNull(), // sha256 of the cookie token
  profileId: uuid('profile_id').references(() => profiles.id, { onDelete: 'cascade' }).notNull(),
  kind: text('kind').notNull(), // 'customer' | 'staff'
  ip: text('ip'),
  userAgent: text('user_agent'),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [index('sessions_profile_idx').on(t.profileId)]);

export const otpCodes = pgTable('otp_codes', {
  id: uuid('id').defaultRandom().primaryKey(),
  email: text('email').notNull(),
  codeHash: text('code_hash').notNull(), // HMAC of the code; never plaintext
  attempts: integer('attempts').default(0).notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  consumedAt: timestamp('consumed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [index('otp_email_idx').on(t.email)]);

export const rateLimits = pgTable('rate_limits', {
  key: text('key').primaryKey(),
  count: integer('count').default(0).notNull(),
  windowStart: timestamp('window_start', { withTimezone: true }).defaultNow().notNull(),
});

// ==========================================
// 12. CUSTOMER ADDRESSES
// ==========================================
export const customerAddresses = pgTable('customer_addresses', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').references(() => profiles.id, { onDelete: 'cascade' }).notNull(),
  label: text('label').default('Home').notNull(),
  address: text('address').notNull(),
  lat: doublePrecision('lat'),
  lng: doublePrecision('lng'),
  isDefault: boolean('is_default').default(false).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

// ==========================================
// 13. DEAL CONTENTS
// ==========================================
export const dealItems = pgTable('deal_items', {
  id: uuid('id').defaultRandom().primaryKey(),
  dealId: uuid('deal_id').references(() => deals.id, { onDelete: 'cascade' }).notNull(),
  productId: uuid('product_id').references(() => products.id, { onDelete: 'restrict' }).notNull(),
  quantity: integer('quantity').default(1).notNull(),
});

// ==========================================
// 14. ORDER HISTORY, AUDIT, NOTIFICATIONS, STOCK
// ==========================================
export const orderStatusHistory = pgTable('order_status_history', {
  id: uuid('id').defaultRandom().primaryKey(),
  orderId: uuid('order_id').references(() => orders.id, { onDelete: 'cascade' }).notNull(),
  fromStatus: text('from_status'),
  toStatus: text('to_status').notNull(),
  changedBy: uuid('changed_by').references(() => profiles.id, { onDelete: 'set null' }),
  note: text('note'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [index('osh_order_idx').on(t.orderId)]);

export const auditLogs = pgTable('audit_logs', {
  id: uuid('id').defaultRandom().primaryKey(),
  actorId: uuid('actor_id').references(() => profiles.id, { onDelete: 'set null' }),
  actorEmail: text('actor_email'),
  action: text('action').notNull(),
  entity: text('entity'),
  entityId: text('entity_id'),
  before: jsonb('before'),
  after: jsonb('after'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [index('audit_created_idx').on(t.createdAt)]);

export const notifications = pgTable('notifications', {
  id: uuid('id').defaultRandom().primaryKey(),
  orderId: uuid('order_id').references(() => orders.id, { onDelete: 'cascade' }).notNull(),
  channel: text('channel').default('whatsapp').notNull(),
  kind: text('kind').default('order_created').notNull(),
  status: text('status').default('pending').notNull(), // pending | sent | failed | retrying
  attempts: integer('attempts').default(0).notNull(),
  lastError: text('last_error'),
  providerMessageId: text('provider_message_id'),
  nextAttemptAt: timestamp('next_attempt_at', { withTimezone: true }),
  sentAt: timestamp('sent_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [uniqueIndex('notif_order_kind_uq').on(t.orderId, t.channel, t.kind)]);

export const stockMovements = pgTable('stock_movements', {
  id: uuid('id').defaultRandom().primaryKey(),
  productId: uuid('product_id').references(() => products.id, { onDelete: 'cascade' }).notNull(),
  delta: integer('delta').notNull(),
  reason: text('reason').notNull(),
  orderId: uuid('order_id').references(() => orders.id, { onDelete: 'set null' }),
  actorId: uuid('actor_id').references(() => profiles.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// ==========================================
// 15. COUPONS, BUSINESS DAYS, BACKUPS
// ==========================================
export const coupons = pgTable('coupons', {
  id: uuid('id').defaultRandom().primaryKey(),
  code: text('code').unique().notNull(),
  kind: text('kind').notNull(), // 'percent' | 'fixed'
  value: numeric('value', { precision: 10, scale: 2 }).notNull(),
  minOrder: numeric('min_order', { precision: 10, scale: 2 }).default('0').notNull(),
  maxUses: integer('max_uses'), // null = unlimited
  usedCount: integer('used_count').default(0).notNull(),
  startsAt: timestamp('starts_at', { withTimezone: true }),
  endsAt: timestamp('ends_at', { withTimezone: true }),
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const businessDays = pgTable('business_days', {
  day: text('day').primaryKey(), // YYYY-MM-DD (Asia/Karachi)
  closedBy: uuid('closed_by').references(() => profiles.id, { onDelete: 'set null' }),
  closedAt: timestamp('closed_at', { withTimezone: true }).defaultNow().notNull(),
  summary: jsonb('summary').notNull(), // snapshot only; orders are never locked or changed
  note: text('note'),
});

export const backups = pgTable('backups', {
  id: uuid('id').defaultRandom().primaryKey(),
  filename: text('filename'),
  sizeBytes: integer('size_bytes'),
  status: text('status').notNull(), // success | failed
  error: text('error'),
  trigger: text('trigger').notNull(), // manual | scheduled
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// Browsers/phones that opted in to push notifications for new orders (owner / admin / kitchen only).
// One row per device (endpoint is unique). Recipients are chosen by the profile's CURRENT role when sending, so
// removing someone's staff access also stops their alerts. Not part of backups: a subscription is tied to a device.
export const pushSubscriptions = pgTable('push_subscriptions', {
  id: uuid('id').defaultRandom().primaryKey(),
  profileId: uuid('profile_id').references(() => profiles.id, { onDelete: 'cascade' }).notNull(),
  endpoint: text('endpoint').unique().notNull(),
  p256dh: text('p256dh').notNull(),
  auth: text('auth').notNull(),
  userAgent: text('user_agent'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).defaultNow().notNull(),
});
