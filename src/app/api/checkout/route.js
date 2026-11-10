import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getCustomer, normalizePkPhone, rateLimit } from '@/lib/server/auth';
import { createOrder, OrderError } from '@/lib/server/orders';
import { dispatchOrderNotification } from '@/lib/server/notify';
import { notifyStaffOfOrder } from '@/lib/server/push';
import { after } from 'next/server';

const schema = z.object({
  orderType: z.enum(['pickup', 'delivery']),
  customerName: z.string().trim().min(2).max(80),
  customerPhone: z.string(),
  deliveryAddress: z.string().trim().max(300).optional().nullable(),
  deliveryLat: z.coerce.number().optional().nullable(),
  deliveryLng: z.coerce.number().optional().nullable(),
  paymentMethod: z.enum(['bank_transfer', 'jazzcash', 'easypaisa', 'cod']),
  paymentReference: z.string().trim().max(100).optional().nullable(),
  paymentProofFile: z.string().regex(/^[a-f0-9-]{36}\.(jpg|png|webp)$/).optional().nullable(),
  couponCode: z.string().trim().max(40).optional().nullable(),
  specialInstructions: z.string().trim().max(500).optional().nullable(),
  idempotencyKey: z.string().min(8).max(80).optional(),
  items: z.array(z.object({ type: z.enum(['product', 'deal']), id: z.string().uuid(), quantity: z.coerce.number().int().min(1).max(50), notes: z.string().max(200).optional().nullable() })).min(1).max(60),
});

export async function POST(request) {
  const customer = await getCustomer();
  if (!customer) return NextResponse.json({ error: 'Please sign in to place your order.' }, { status: 401 });

  const rl = await rateLimit(`checkout:${customer.id}`, 15, 600);
  if (!rl.ok) return NextResponse.json({ error: 'Too many order attempts. Please wait a few minutes.' }, { status: 429 });

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Please check your order details and try again.' }, { status: 400 });
  const data = parsed.data;
  const phone = normalizePkPhone(data.customerPhone);
  if (!phone) return NextResponse.json({ error: 'Enter a valid Pakistani mobile number, e.g. 03XXXXXXXXX.' }, { status: 400 });

  try {
    const { order, duplicate } = await createOrder({ ...data, customerPhone: phone }, customer);
    if (!duplicate) {
      // Neither of these blocks or fails the order.
      after(() => dispatchOrderNotification(order.id)); // optional WhatsApp message (only if configured)
      after(() => notifyStaffOfOrder(order.id)); // push notification to subscribed owner/admin/kitchen devices
    }
    return NextResponse.json({
      success: true,
      duplicate,
      orderId: order.id,
      orderNumber: order.orderNumber,
      status: order.status,
      paymentStatus: order.paymentStatus,
      subtotal: Number(order.subtotal),
      discountAmount: Number(order.discountAmount),
      deliveryFee: Number(order.deliveryFee),
      totalAmount: Number(order.totalAmount),
      trackingToken: order.trackingToken,
    });
  } catch (e) {
    if (e instanceof OrderError) return NextResponse.json({ error: e.message, code: e.code, ...e.extra }, { status: e.status });
    console.error('checkout failed', e);
    return NextResponse.json({ error: 'Something went wrong while placing your order. Please try again.' }, { status: 500 });
  }
}
