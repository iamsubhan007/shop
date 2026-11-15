import 'server-only';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { db, schema } from '@/db';
import { TERMINAL } from '@/lib/orderStatus';
import { OrderError } from './orders';
import { audit } from './audit';
import { deleteImage } from './storage';

// Owner/admin-only order tools: change what is in an order, and delete old orders. Callers must have checked the role.
const { orders, orderItems, products, dealItems, stockMovements, paymentSubmissions, orderStatusHistory } = schema;
const money = (n) => Math.round(Number(n) * 100) / 100;

/**
 * What the shop needs to do about money after an order's total changed, if anything. Payment status is left as it
 * is: revenue reports then count the new total, which is the amount that actually stays with the shop.
 */
function moneyNote(order, oldTotal, total) {
  if (total === oldTotal) return null;
  const alreadyPaid = order.paymentMethod !== 'cod' && order.paymentStatus === 'verified';
  if (alreadyPaid) return total < oldTotal ? `The customer already paid Rs. ${oldTotal}. Refund Rs. ${money(oldTotal - total)}.` : `The customer already paid Rs. ${oldTotal}. They owe Rs. ${money(total - oldTotal)} more.`;
  if (order.paymentMethod === 'cod') return `Cash to collect is now Rs. ${total}.`;
  return `The customer should pay Rs. ${total}.`;
}

/** The part of an order's discount that came from a coupon (the rest was given by hand). */
const couponPartOf = (order) => Math.max(0, money(Number(order.discountAmount) - Number(order.manualDiscount || 0)));

/**
 * Include or exclude items on an order that is still in progress.
 *  changes: [{ itemId, quantity }]  (quantity 0 removes that line)
 *  add:     [{ productId, quantity }] (added at today's menu price)
 * Totals are recalculated (an existing coupon discount is kept, capped at the new subtotal; the delivery fee is
 * unchanged). Stock for tracked products is returned or taken. Every change is written to the order history and the
 * audit log. Orders that are Completed, Cancelled or Rejected cannot be edited.
 */
export async function editOrderItems(orderId, actor, { changes = [], add = [], note = '' } = {}) {
  return db.transaction(async (tx) => {
    const [order] = await tx.select().from(orders).where(eq(orders.id, orderId)).for('update');
    if (!order) throw new OrderError('Order not found.', 'not_found', 404);
    if (TERMINAL.includes(order.status)) throw new OrderError('Completed, cancelled or rejected orders cannot be changed.', 'not_allowed', 409);

    const lines = await tx.select().from(orderItems).where(eq(orderItems.orderId, orderId));
    const before = lines.map((l) => ({ title: l.itemTitle, quantity: l.quantity, unitPrice: Number(l.unitPrice) }));

    const newQty = new Map(lines.map((l) => [l.id, l.quantity]));
    for (const c of changes) {
      if (!newQty.has(c.itemId)) throw new OrderError('One of those items is not part of this order.', 'bad_request');
      newQty.set(c.itemId, c.quantity);
    }

    const addIds = [...new Set(add.map((a) => a.productId))];
    const addRows = addIds.length ? await tx.select().from(products).where(inArray(products.id, addIds)) : [];
    const addMap = new Map(addRows.map((p) => [p.id, p]));
    const created = add.map((a) => {
      const p = addMap.get(a.productId);
      if (!p || p.deletedAt) throw new OrderError('That product is not on the menu.', 'item_missing');
      const unit = money(p.price);
      return { productId: p.id, dealId: null, itemTitle: p.name, unitPrice: unit, quantity: a.quantity, subtotalPrice: money(unit * a.quantity), notes: null };
    });
    const kept = lines.filter((l) => newQty.get(l.id) > 0).map((l) => ({ ...l, quantity: newQty.get(l.id) }));
    if (!kept.length && !created.length) throw new OrderError('An order needs at least one item. To remove everything, cancel the order instead.', 'bad_request');

    // ---- stock (tracked products only). A deal line uses its component products.
    const dealIds = [...new Set(lines.filter((l) => l.dealId).map((l) => l.dealId))];
    const parts = dealIds.length ? await tx.select().from(dealItems).where(inArray(dealItems.dealId, dealIds)) : [];
    const needs = (list) => {
      const m = new Map();
      for (const l of list) {
        if (l.productId) m.set(l.productId, (m.get(l.productId) || 0) + l.quantity);
        else if (l.dealId) for (const p of parts.filter((x) => x.dealId === l.dealId)) m.set(p.productId, (m.get(p.productId) || 0) + p.quantity * l.quantity);
      }
      return m;
    };
    const oldNeeds = needs(lines);
    const newNeeds = needs([...kept, ...created]);
    const touched = [...new Set([...oldNeeds.keys(), ...newNeeds.keys()])];
    const prodRows = touched.length ? await tx.select().from(products).where(inArray(products.id, touched)) : [];
    for (const p of prodRows) {
      if (!p.trackStock) continue;
      const delta = (newNeeds.get(p.id) || 0) - (oldNeeds.get(p.id) || 0); // > 0 means the order now uses more stock
      if (!delta) continue;
      if (delta > 0) {
        const res = await tx.update(products).set({ stockQty: sql`${products.stockQty} - ${delta}`, updatedAt: new Date() })
          .where(and(eq(products.id, p.id), sql`${products.stockQty} >= ${delta}`)).returning({ id: products.id });
        if (!res.length) throw new OrderError(`Sorry, "${p.name}" does not have enough stock.`, 'out_of_stock', 409);
      } else {
        await tx.update(products).set({ stockQty: sql`${products.stockQty} + ${-delta}`, updatedAt: new Date() }).where(eq(products.id, p.id));
      }
      await tx.insert(stockMovements).values({ productId: p.id, delta: -delta, reason: `Order ${order.orderNumber} edited`, orderId, actorId: actor.id });
    }

    // ---- apply the line changes
    for (const l of lines) {
      const q = newQty.get(l.id);
      if (q === 0) await tx.delete(orderItems).where(eq(orderItems.id, l.id));
      else if (q !== l.quantity) await tx.update(orderItems).set({ quantity: q, subtotalPrice: String(money(Number(l.unitPrice) * q)) }).where(eq(orderItems.id, l.id));
    }
    if (created.length) {
      await tx.insert(orderItems).values(created.map((r) => ({ ...r, orderId, unitPrice: String(r.unitPrice), subtotalPrice: String(r.subtotalPrice) })));
    }

    // ---- totals
    const subtotal = money([...kept.map((l) => money(Number(l.unitPrice) * l.quantity)), ...created.map((c) => c.subtotalPrice)].reduce((a, b) => a + b, 0));
    // A coupon discount stays as it was and a manual (admin) discount stays too; each is capped so the order never
    // goes below zero. The delivery fee is unchanged.
    const coupon = Math.min(couponPartOf(order), subtotal);
    const manual = Math.min(Number(order.manualDiscount || 0), money(subtotal - coupon));
    const discount = money(coupon + manual);
    const total = money(subtotal - discount + Number(order.deliveryFee));
    const oldTotal = Number(order.totalAmount);
    const [updated] = await tx.update(orders).set({ subtotal: String(subtotal), discountAmount: String(discount), manualDiscount: String(manual), totalAmount: String(total), updatedAt: new Date() }).where(eq(orders.id, orderId)).returning();
    const paymentNote = moneyNote(order, oldTotal, total);

    const bits = [];
    for (const l of lines) {
      const q = newQty.get(l.id);
      if (q === 0) bits.push(`removed ${l.quantity} x ${l.itemTitle}`);
      else if (q !== l.quantity) bits.push(`${l.itemTitle} ${l.quantity} to ${q}`);
    }
    for (const c of created) bits.push(`added ${c.quantity} x ${c.itemTitle}`);
    await tx.insert(orderStatusHistory).values({
      orderId, fromStatus: order.status, toStatus: order.status, changedBy: actor.id,
      note: `Items changed (${bits.join(', ') || 'no change'}). Total Rs. ${oldTotal} to Rs. ${total}${note ? `. ${note}` : ''}`,
    });
    await audit(actor, 'order.items', 'order', order.orderNumber, { items: before, total: oldTotal },
      { items: [...kept, ...created].map((l) => ({ title: l.itemTitle, quantity: l.quantity, unitPrice: Number(l.unitPrice) })), total }, tx);
    return { order: updated, oldTotal, total, paymentNote };
  });
}

/**
 * Permanently delete finished orders (Completed, Cancelled or Rejected only). Their items, history, payment records
 * and notifications go with them; stock movements are kept but no longer point at the order. Payment screenshots are
 * removed from storage afterwards. Each deletion is written to the audit log.
 */
export async function deleteOrders(ids, actor) {
  const { deleted, files } = await db.transaction(async (tx) => {
    const rows = await tx.select().from(orders).where(inArray(orders.id, ids)).for('update');
    const live = rows.find((o) => !TERMINAL.includes(o.status));
    if (live) throw new OrderError(`Only completed, cancelled or rejected orders can be deleted. ${live.orderNumber} is still "${live.status}".`, 'not_allowed', 409);
    if (!rows.length) return { deleted: 0, files: [] };
    const subs = await tx.select({ f: paymentSubmissions.proofImageUrl }).from(paymentSubmissions).where(inArray(paymentSubmissions.orderId, rows.map((o) => o.id)));
    const files = [...new Set([...rows.map((o) => o.paymentProofUrl), ...subs.map((s) => s.f)].filter(Boolean))];
    await tx.delete(orders).where(inArray(orders.id, rows.map((o) => o.id)));
    for (const o of rows) await audit(actor, 'order.delete', 'order', o.orderNumber, { status: o.status, type: o.orderType, total: Number(o.totalAmount), placedAt: o.createdAt }, null, tx);
    return { deleted: rows.length, files };
  });
  for (const f of files) await deleteImage('proofs', f);
  return { deleted };
}

/**
 * Give an order a discount by hand (owner/admin), at any point while it is still in progress, including after it was
 * confirmed. It is kept separately from any coupon discount so it can be changed or removed later (value 0 removes
 * it). type 'amount' is in rupees, 'percent' is a percentage of the order subtotal. It can never take the items
 * below zero; the delivery fee is not discounted. Shown on the customer's invoice as part of the discount.
 */
export async function setOrderDiscount(orderId, actor, { type = 'amount', value = 0, note = '' } = {}) {
  return db.transaction(async (tx) => {
    const [order] = await tx.select().from(orders).where(eq(orders.id, orderId)).for('update');
    if (!order) throw new OrderError('Order not found.', 'not_found', 404);
    if (TERMINAL.includes(order.status)) throw new OrderError('Completed, cancelled or rejected orders cannot be changed.', 'not_allowed', 409);
    if (type === 'percent' && value > 100) throw new OrderError('A percentage discount cannot be more than 100%.', 'bad_request');

    const subtotal = Number(order.subtotal);
    const coupon = couponPartOf(order);
    const room = money(subtotal - coupon); // the most that can still be taken off the items
    const manual = type === 'percent' ? money((subtotal * value) / 100) : money(value);
    if (manual > room) throw new OrderError(`The discount cannot be more than Rs. ${room} (the items, after any coupon).`, 'bad_request');

    const discount = money(coupon + manual);
    const total = money(subtotal - discount + Number(order.deliveryFee));
    const oldTotal = Number(order.totalAmount);
    const before = Number(order.manualDiscount || 0);
    const [updated] = await tx.update(orders).set({ discountAmount: String(discount), manualDiscount: String(manual), totalAmount: String(total), updatedAt: new Date() }).where(eq(orders.id, orderId)).returning();
    await tx.insert(orderStatusHistory).values({
      orderId, fromStatus: order.status, toStatus: order.status, changedBy: actor.id,
      note: manual === 0 ? `Admin discount removed. Total Rs. ${oldTotal} to Rs. ${total}${note ? `. ${note}` : ''}` : `Admin discount of Rs. ${manual} given${type === 'percent' ? ` (${value}%)` : ''}. Total Rs. ${oldTotal} to Rs. ${total}${note ? `. ${note}` : ''}`,
    });
    await audit(actor, 'order.discount', 'order', order.orderNumber, { manualDiscount: before, total: oldTotal }, { manualDiscount: manual, total, note: note || null }, tx);
    return { order: updated, oldTotal, total, manualDiscount: manual, paymentNote: moneyNote(order, oldTotal, total) };
  });
}

/**
 * Give an order a countdown (owner/admin): "ready / delivered in N minutes". The customer sees the time left; null
 * clears it. Only for orders still in progress.
 */
export async function setOrderEta(orderId, actor, minutes) {
  return db.transaction(async (tx) => {
    const [order] = await tx.select().from(orders).where(eq(orders.id, orderId)).for('update');
    if (!order) throw new OrderError('Order not found.', 'not_found', 404);
    if (TERMINAL.includes(order.status)) throw new OrderError('Completed, cancelled or rejected orders cannot be changed.', 'not_allowed', 409);
    const etaAt = minutes == null ? null : new Date(Date.now() + minutes * 60000);
    await tx.update(orders).set({ etaAt, updatedAt: new Date() }).where(eq(orders.id, orderId));
    await tx.insert(orderStatusHistory).values({ orderId, fromStatus: order.status, toStatus: order.status, changedBy: actor.id, note: minutes == null ? 'Timer cleared' : `Timer set: ${minutes} min` });
    await audit(actor, 'order.eta', 'order', order.orderNumber, { etaAt: order.etaAt }, { etaAt }, tx);
    return { etaAt };
  });
}
