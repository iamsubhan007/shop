import 'server-only';
import { eq } from 'drizzle-orm';
import PDFDocument from 'pdfkit';
import { db, schema } from '@/db';
import { getSettings } from './settings';
import { PAYMENT_LABELS } from '@/lib/orderStatus';

const rs = (n) => `Rs. ${Math.round(Number(n)).toLocaleString('en-PK')}`;

/** Compact one-page order receipt (A5) for the owner / for printing. */
export async function buildReceiptPdf(orderId) {
  const [o] = await db.select().from(schema.orders).where(eq(schema.orders.id, orderId));
  if (!o) throw new Error('Order not found');
  const items = await db.select().from(schema.orderItems).where(eq(schema.orderItems.orderId, orderId));
  const s = await getSettings();

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A5', margin: 28 });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    const W = doc.page.width - 56;
    const row = (l, r, bold) => {
      doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(9).fillColor('#000');
      const y = doc.y;
      doc.text(l, 28, y, { width: W - 90 });
      doc.text(r, 28, y, { width: W, align: 'right' });
      doc.y = Math.max(doc.y, y + 12);
    };

    doc.rect(0, 0, doc.page.width, 52).fill('#2b1d14');
    doc.fillColor('#f6efe4').font('Helvetica-Bold').fontSize(16).text(s.shop.name || 'Haq Bahu Tandoor', 28, 14);
    doc.font('Helvetica').fontSize(8).text(s.shop.address || '', 28, 34, { width: W });
    doc.y = 64;

    doc.fillColor('#b4451f').font('Helvetica-Bold').fontSize(13).text(`Order ${o.orderNumber}`, 28);
    doc.fillColor('#555').font('Helvetica').fontSize(8).text(new Date(o.createdAt).toLocaleString('en-PK', { timeZone: 'Asia/Karachi' })).moveDown(0.5);

    doc.fillColor('#000').font('Helvetica-Bold').fontSize(9).text(`${o.customerName}  |  ${o.customerPhone}`);
    doc.font('Helvetica').text(o.orderType === 'delivery' ? `DELIVERY: ${o.deliveryAddress}` : 'PICKUP from shop');
    doc.moveDown(0.4);
    doc.moveTo(28, doc.y).lineTo(28 + W, doc.y).strokeColor('#ccc').stroke();
    doc.moveDown(0.3);
    for (const i of items) row(`${i.quantity} x ${i.itemTitle}${i.notes ? ` (${i.notes})` : ''}`, rs(i.subtotalPrice));
    doc.moveDown(0.2).moveTo(28, doc.y).lineTo(28 + W, doc.y).strokeColor('#ccc').stroke();
    doc.moveDown(0.3);
    row('Subtotal', rs(o.subtotal));
    if (Number(o.discountAmount) > 0) row(`Discount${o.couponCode ? ` (${o.couponCode})` : ''}`, `- ${rs(o.discountAmount)}`);
    if (Number(o.deliveryFee) > 0) row('Delivery fee', rs(o.deliveryFee));
    row('TOTAL', rs(o.totalAmount), true);
    doc.moveDown(0.5);
    row('Payment', `${PAYMENT_LABELS[o.paymentMethod]} - ${o.paymentStatus.replace(/_/g, ' ')}`);
    if (o.paymentReference) row('Reference', o.paymentReference);
    if (o.specialInstructions) { doc.moveDown(0.4).font('Helvetica-Bold').text('Customer note:'); doc.font('Helvetica').text(o.specialInstructions, { width: W }); }
    doc.end();
  });
}
