import 'server-only';
import crypto from 'node:crypto';
import { and, eq, gte, inArray, sql } from 'drizzle-orm';
import { db, schema } from '@/db';
import { getSettings, orderingState } from './settings';
import { evaluateDelivery } from '@/lib/delivery';
import { PAYMENT_METHODS, nextStatuses, roleCanTransition, CUSTOMER_CANCELLABLE } from '@/lib/orderStatus';
import { audit } from './audit';

const { orders, orderItems, products, categories, deals, dealItems, paymentSubmissions, orderStatusHistory, notifications, stockMovements, coupons, profiles } = schema;

export class OrderError extends Error {
  constructor(message, code = 'invalid', status = 400, extra = {}) {
    super(message);
    this.code = code;
    this.status = status;
    this.extra = extra;
  }
}

const money = (n) => Math.round(Number(n) * 100) / 100;

/** Validates a coupon and (inside the order transaction) consumes one use. Admin must create coupons; none are automatic. */
export async function applyCoupon(tx, rawCode, subtotal, { consume }) {
  const code = String(rawCode || '').trim().toUpperCase();
  const [c] = await tx.select().from(coupons).where(eq(coupons.code, code));
  const now = new Date();
  if (!c || !c.isActive || (c.startsAt && c.startsAt > now) || (c.endsAt && c.endsAt < now)) throw new OrderError('This coupon code is not valid.', 'bad_coupon');
  if (subtotal < Number(c.minOrder)) throw new OrderError(`This coupon needs a minimum order of Rs. ${Number(c.minOrder)}.`, 'bad_coupon');
  if (consume) {
    const res = await tx.update(coupons).set({ usedCount: sql`${coupons.usedCount} + 1` })
      .where(and(eq(coupons.id, c.id), sql`(${coupons.maxUses} is null or ${coupons.usedCount} < ${coupons.maxUses})`)).returning({ id: coupons.id });
    if (!res.length) throw new OrderError('This coupon has been fully used.', 'bad_coupon');
  } else if (c.maxUses != null && c.usedCount >= c.maxUses) throw new OrderError('This coupon has been fully used.', 'bad_coupon');
  const raw = c.kind === 'percent' ? (subtotal * Number(c.value)) / 100 : Number(c.value);
  return { code: c.code, discount: money(Math.min(subtotal, raw)) };
}

/** Start of the current day in Asia/Karachi (UTC+5, no DST) as a Date. */
export function startOfPkDay(d = new Date()) {
  const off = 5 * 3600 * 1000;
  return new Date(Math.floor((d.getTime() + off) / 86400000) * 86400000 - off);
}

export function productOrderable(p, now = new Date()) {
  if (!p || p.deletedAt) return false;
  if (p.isAvailable === false || p.isSoldOut) return false;
  if (p.unavailableUntil && new Date(p.unavailableUntil) > now) return false; // passes automatically after this time
  if (p.categoryPaused || p.categoryInactive) return false;
  return true;
}

/**
 * Create an order atomically. Prices, availability, delivery radius, payment methods and
 * stock are all decided here from the database, never from client-supplied numbers.
 */
export async function createOrder(input, customer) {
  const settings = await getSettings();
  const state = orderingState(settings);
  if (!state.open) throw new OrderError(state.notice || 'We are not taking orders right now.', 'ordering_closed', 409);

  const type = input.orderType;
  if (type === 'delivery' && !settings.delivery.enabled) throw new OrderError('Home delivery is currently unavailable. Please choose pickup.', 'delivery_disabled', 409);
  if (type === 'pickup' && !settings.pickup.enabled) throw new OrderError('Pickup is currently unavailable.', 'pickup_disabled', 409);

  const method = input.paymentMethod;
  if (!PAYMENT_METHODS[type].includes(method)) {
    throw new OrderError(type === 'pickup' && method === 'cod' ? 'Cash on delivery is only available for delivery orders.' : 'Invalid payment method.', 'bad_payment');
  }
  const methodEnabled = { bank_transfer: settings.payment.bank?.enabled, jazzcash: settings.payment.jazzcash?.enabled, easypaisa: settings.payment.easypaisa?.enabled, cod: true }[method];
  if (!methodEnabled) throw new OrderError('This payment method is not available right now.', 'bad_payment');

  // Delivery eligibility is recomputed here from the stored shop location + radius.
  let distanceM = null;
  let deliveryFee = 0;
  if (type === 'delivery') {
    const ev = evaluateDelivery({ shop: settings.shop, radiusM: Number(settings.delivery.radius_m), lat: input.deliveryLat, lng: input.deliveryLng });
    if (ev.reason === 'invalid_coordinates') throw new OrderError('Please select your delivery location on the map.', 'location_required');
    if (!ev.eligible) throw new OrderError(`Delivery is only available within ${settings.delivery.radius_m} m of our shop. You are ${Math.round(ev.distanceM)} m away. Please choose pickup instead.`, 'outside_radius', 422, { distanceM: ev.distanceM });
    distanceM = ev.distanceM;
    deliveryFee = money(settings.delivery.fee);
    if (!input.deliveryAddress?.trim()) throw new OrderError('Delivery address is required.', 'address_required');
  }

  return db.transaction(async (tx) => {
    if (input.idempotencyKey) {
      const [dup] = await tx.select().from(orders).where(eq(orders.idempotencyKey, input.idempotencyKey));
      if (dup) return { order: dup, duplicate: true };
    }

    // Merge duplicate lines, validate quantities
    const lines = new Map();
    for (const it of input.items) {
      const qty = Math.floor(Number(it.quantity));
      if (!Number.isFinite(qty) || qty < 1 || qty > 50) throw new OrderError('Invalid item quantity.', 'bad_quantity');
      const key = `${it.type}:${it.id}`;
      const prev = lines.get(key);
      lines.set(key, { type: it.type, id: it.id, quantity: (prev?.quantity || 0) + qty, notes: it.notes?.toString().slice(0, 200) || prev?.notes || null });
    }

    const productIds = [...lines.values()].filter((l) => l.type === 'product').map((l) => l.id);
    const dealIds = [...lines.values()].filter((l) => l.type === 'deal').map((l) => l.id);

    const prodRows = productIds.length
      ? await tx
          .select({ p: products, catActive: categories.isActive, catPaused: categories.isPaused })
          .from(products)
          .leftJoin(categories, eq(categories.id, products.categoryId))
          .where(inArray(products.id, productIds))
      : [];
    const prodMap = new Map(prodRows.map((r) => [r.p.id, { ...r.p, categoryInactive: r.catActive === false, categoryPaused: !!r.catPaused }]));
    const dealRows = dealIds.length ? await tx.select().from(deals).where(inArray(deals.id, dealIds)) : [];
    const dealMap = new Map(dealRows.map((d) => [d.id, d]));

    const now = new Date();
    let subtotal = 0;
    const itemRows = [];
    const stockNeeds = new Map(); // productId -> qty

    for (const l of lines.values()) {
      if (l.type === 'product') {
        const p = prodMap.get(l.id);
        if (!p) throw new OrderError('An item in your cart is no longer on the menu.', 'item_missing');
        if (!productOrderable(p, now)) throw new OrderError(`"${p.name}" is currently unavailable.`, 'item_unavailable', 409, { itemId: p.id });
        const unit = money(p.price);
        itemRows.push({ productId: p.id, dealId: null, itemTitle: p.name, unitPrice: unit, quantity: l.quantity, subtotalPrice: money(unit * l.quantity), notes: l.notes });
        subtotal += unit * l.quantity;
        if (p.trackStock) stockNeeds.set(p.id, (stockNeeds.get(p.id) || 0) + l.quantity);
      } else {
        const d = dealMap.get(l.id);
        const live = d && d.isActive && !d.deletedAt && (!d.startsAt || d.startsAt <= now) && (!d.endsAt || d.endsAt >= now);
        if (!live) throw new OrderError(`"${d?.title || 'A deal in your cart'}" is no longer available.`, 'item_unavailable', 409);
        const unit = money(d.price);
        itemRows.push({ productId: null, dealId: d.id, itemTitle: d.title, unitPrice: unit, quantity: l.quantity, subtotalPrice: money(unit * l.quantity), notes: l.notes });
        subtotal += unit * l.quantity;
        const parts = await tx.select().from(dealItems).where(eq(dealItems.dealId, d.id));
        for (const part of parts) {
          const [pp] = await tx.select().from(products).where(eq(products.id, part.productId));
          if (pp?.trackStock) stockNeeds.set(pp.id, (stockNeeds.get(pp.id) || 0) + part.quantity * l.quantity);
        }
      }
    }
    subtotal = money(subtotal);

    if (settings.delivery.min_order && subtotal < Number(settings.delivery.min_order)) {
      throw new OrderError(`Minimum order is Rs. ${settings.delivery.min_order}.`, 'min_order');
    }
    if (type === 'delivery' && Number(settings.delivery.free_over) > 0 && subtotal >= Number(settings.delivery.free_over)) deliveryFee = 0;

    // Reserve stock atomically (prevents overselling)
    for (const [pid, qty] of stockNeeds) {
      const res = await tx
        .update(products)
        .set({ stockQty: sql`${products.stockQty} - ${qty}`, updatedAt: new Date() })
        .where(and(eq(products.id, pid), sql`${products.stockQty} >= ${qty}`))
        .returning({ id: products.id, name: products.name });
      if (!res.length) {
        const name = prodMap.get(pid)?.name || 'An item';
        throw new OrderError(`Sorry, "${name}" does not have enough stock.`, 'out_of_stock', 409, { itemId: pid });
      }
    }

    let discount = 0;
    let couponCode = null;
    if (input.couponCode) {
      const c = await applyCoupon(tx, input.couponCode, subtotal, { consume: true });
      discount = c.discount;
      couponCode = c.code;
    }
    const total = money(subtotal - discount + deliveryFee);
    const hasProof = !!(input.paymentReference?.trim() || input.paymentProofFile);
    const prepaid = method !== 'cod';
    const status = !prepaid ? 'Placed' : hasProof ? 'Payment Verification' : 'Payment Pending';
    const paymentStatus = !prepaid ? 'cod_pending' : hasProof ? 'submitted' : 'pending';

    // Human-readable sequential number per day, serialized by an advisory lock
    await tx.execute(sql`select pg_advisory_xact_lock(7331)`);
    const dayStart = startOfPkDay();
    const [{ n }] = await tx.select({ n: sql`count(*)::int` }).from(orders).where(gte(orders.createdAt, dayStart));
    const stamp = new Date(dayStart.getTime() + 5 * 3600 * 1000).toISOString().slice(2, 10).replace(/-/g, '');
    const orderNumber = `HBT-${stamp}-${String(n + 1).padStart(3, '0')}`;

    const [order] = await tx
      .insert(orders)
      .values({
        orderNumber,
        userId: customer.id,
        idempotencyKey: input.idempotencyKey || null,
        trackingToken: crypto.randomBytes(16).toString('hex'),
        orderType: type,
        status,
        customerName: input.customerName,
        customerPhone: input.customerPhone,
        customerEmail: customer.email,
        deliveryAddress: type === 'delivery' ? input.deliveryAddress.trim() : null,
        deliveryLat: type === 'delivery' ? String(input.deliveryLat) : null,
        deliveryLng: type === 'delivery' ? String(input.deliveryLng) : null,
        distanceKm: distanceM !== null ? String(Math.round(distanceM) / 1000) : null,
        subtotal: String(subtotal),
        discountAmount: String(discount),
        couponCode,
        deliveryFee: String(deliveryFee),
        totalAmount: String(total),
        paymentStatus,
        paymentMethod: method,
        paymentReference: input.paymentReference?.trim() || null,
        paymentProofUrl: input.paymentProofFile || null,
        specialInstructions: input.specialInstructions?.trim() || null,
      })
      .returning();

    await tx.insert(orderItems).values(itemRows.map((r) => ({ ...r, orderId: order.id, unitPrice: String(r.unitPrice), subtotalPrice: String(r.subtotalPrice) })));
    for (const [pid, qty] of stockNeeds) {
      await tx.insert(stockMovements).values({ productId: pid, delta: -qty, reason: `Order ${orderNumber}`, orderId: order.id });
    }
    await tx.insert(orderStatusHistory).values({ orderId: order.id, fromStatus: null, toStatus: status, note: 'Order placed' });
    if (hasProof) {
      await tx.insert(paymentSubmissions).values({
        orderId: order.id,
        userId: customer.id,
        paymentMethod: method,
        transactionReference: input.paymentReference?.trim() || 'Proof uploaded',
        proofImageUrl: input.paymentProofFile || null,
        status: 'pending',
      });
    }
    await tx.insert(notifications).values({ orderId: order.id, channel: 'whatsapp', kind: 'order_created', status: 'pending' }).onConflictDoNothing();

    return { order, duplicate: false };
  });
}

async function restoreStock(tx, order, reason) {
  const moves = await tx.select().from(stockMovements).where(and(eq(stockMovements.orderId, order.id), sql`${stockMovements.delta} < 0`));
  const already = await tx.select().from(stockMovements).where(and(eq(stockMovements.orderId, order.id), sql`${stockMovements.delta} > 0`));
  if (already.length) return;
  for (const m of moves) {
    await tx.update(products).set({ stockQty: sql`${products.stockQty} + ${-m.delta}` }).where(eq(products.id, m.productId));
    await tx.insert(stockMovements).values({ productId: m.productId, delta: -m.delta, reason, orderId: order.id });
  }
}

/** Change an order's status with workflow, role and payment guards. */
export async function changeOrderStatus(orderId, to, actor, { note, reason, asCustomer = false } = {}) {
  return db.transaction(async (tx) => {
    const [order] = await tx.select().from(orders).where(eq(orders.id, orderId)).for('update');
    if (!order) throw new OrderError('Order not found.', 'not_found', 404);
    const from = order.status;

    if (asCustomer) {
      if (to !== 'Cancelled' || !CUSTOMER_CANCELLABLE.includes(from)) throw new OrderError('This order can no longer be cancelled online. Please contact the shop.', 'not_allowed', 409);
    } else {
      if (!roleCanTransition(actor.role, from, to)) throw new OrderError('You are not allowed to make this change.', 'forbidden', 403);
      if (!nextStatuses(from, order.orderType).includes(to)) throw new OrderError(`Cannot move an order from "${from}" to "${to}".`, 'bad_transition', 409);
    }
    // Prepaid orders cannot be confirmed until the payment is verified.
    if (to === 'Confirmed' && order.paymentMethod !== 'cod' && order.paymentStatus !== 'verified') {
      throw new OrderError('Verify the payment before confirming this order.', 'payment_unverified', 409);
    }

    const updates = { status: to, updatedAt: new Date() };
    if (to === 'Cancelled' || to === 'Rejected') updates.cancelReason = reason || note || null;
    if (to === 'Completed' && order.paymentMethod === 'cod') updates.paymentStatus = 'cod_collected';
    if ((to === 'Cancelled' || to === 'Rejected') && order.paymentStatus === 'verified') updates.paymentStatus = 'refund_due';
    const [updated] = await tx.update(orders).set(updates).where(eq(orders.id, orderId)).returning();
    await tx.insert(orderStatusHistory).values({ orderId, fromStatus: from, toStatus: to, changedBy: asCustomer ? null : actor.id, note: note || reason || null });
    if (to === 'Cancelled' || to === 'Rejected') {
      await restoreStock(tx, order, `Order ${order.orderNumber} ${to.toLowerCase()}`);
      if (order.couponCode) await tx.update(coupons).set({ usedCount: sql`greatest(0, ${coupons.usedCount} - 1)` }).where(eq(coupons.code, order.couponCode));
    }
    if (to === 'Completed' && order.userId) {
      const loyalty = (await getSettings()).loyalty;
      const pts = loyalty.enabled ? Math.floor(((Number(order.subtotal) - Number(order.discountAmount)) / 100) * Number(loyalty.points_per_100 || 0)) : 0;
      if (pts > 0) await tx.update(profiles).set({ loyaltyPoints: sql`${profiles.loyaltyPoints} + ${pts}` }).where(eq(profiles.id, order.userId));
    }
    if (!asCustomer) await audit(actor, 'order.status', 'order', order.orderNumber, { status: from }, { status: to }, tx);
    return updated;
  });
}

/** Verify or reject a manual payment (owner/admin only; caller must enforce role). */
export async function reviewPayment(orderId, decision, actor, adminNotes) {
  return db.transaction(async (tx) => {
    const [order] = await tx.select().from(orders).where(eq(orders.id, orderId)).for('update');
    if (!order) throw new OrderError('Order not found.', 'not_found', 404);
    if (order.paymentMethod === 'cod') throw new OrderError('Cash on delivery has no payment to verify.', 'bad_request');
    if (order.paymentStatus !== 'submitted') throw new OrderError('There is no submitted payment to review.', 'bad_request', 409);
    const verified = decision === 'verify';
    const [sub] = await tx.select().from(paymentSubmissions).where(and(eq(paymentSubmissions.orderId, orderId), eq(paymentSubmissions.status, 'pending')));
    if (sub) {
      await tx.update(paymentSubmissions).set({ status: verified ? 'verified' : 'rejected', adminNotes: adminNotes || null, verifiedAt: new Date(), verifiedBy: actor.id }).where(eq(paymentSubmissions.id, sub.id));
    }
    const toStatus = verified ? 'Confirmed' : 'Payment Pending';
    const [updated] = await tx
      .update(orders)
      .set({ paymentStatus: verified ? 'verified' : 'rejected', status: toStatus, updatedAt: new Date() })
      .where(eq(orders.id, orderId))
      .returning();
    await tx.insert(orderStatusHistory).values({ orderId, fromStatus: order.status, toStatus, changedBy: actor.id, note: verified ? 'Payment verified' : `Payment rejected${adminNotes ? ': ' + adminNotes : ''}` });
    await audit(actor, verified ? 'payment.verify' : 'payment.reject', 'order', order.orderNumber, { paymentStatus: order.paymentStatus }, { paymentStatus: updated.paymentStatus }, tx);
    return updated;
  });
}

/** Customer submits (or resubmits) payment details for an existing prepaid order. */
export async function submitPayment(orderId, customer, { reference, proofFile }) {
  return db.transaction(async (tx) => {
    const [order] = await tx.select().from(orders).where(and(eq(orders.id, orderId), eq(orders.userId, customer.id))).for('update');
    if (!order) throw new OrderError('Order not found.', 'not_found', 404);
    if (order.paymentMethod === 'cod' || !['pending', 'rejected'].includes(order.paymentStatus) || order.status !== 'Payment Pending') {
      throw new OrderError('Payment cannot be submitted for this order.', 'not_allowed', 409);
    }
    if (!reference?.trim() && !proofFile) throw new OrderError('Enter the transaction ID or upload a screenshot.', 'bad_request');
    await tx.insert(paymentSubmissions).values({ orderId, userId: customer.id, paymentMethod: order.paymentMethod, transactionReference: reference?.trim() || 'Proof uploaded', proofImageUrl: proofFile || null, status: 'pending' });
    const [updated] = await tx.update(orders).set({ paymentStatus: 'submitted', status: 'Payment Verification', paymentReference: reference?.trim() || order.paymentReference, paymentProofUrl: proofFile || order.paymentProofUrl, updatedAt: new Date() }).where(eq(orders.id, orderId)).returning();
    await tx.insert(orderStatusHistory).values({ orderId, fromStatus: order.status, toStatus: 'Payment Verification', note: 'Customer submitted payment details' });
    return updated;
  });
}
