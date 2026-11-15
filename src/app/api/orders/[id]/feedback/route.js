import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db, schema } from '@/db';
import { getCustomer, rateLimit } from '@/lib/server/auth';

export const dynamic = 'force-dynamic';

const body = z.object({
  rating: z.coerce.number().int().min(1).max(5),
  comment: z.string().trim().max(500).optional().nullable(),
});

/**
 * A customer rates one of their own orders (1-5 stars, optional comment) once it is Completed. One feedback per
 * order; sending again replaces it, so they can change their mind.
 */
export async function POST(request, { params }) {
  const { id } = await params;
  const customer = await getCustomer();
  if (!customer) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });
  const rl = await rateLimit(`feedback:${customer.id}`, 20, 3600);
  if (!rl.ok) return NextResponse.json({ error: 'Too many requests. Please try again later.' }, { status: 429 });
  const p = body.safeParse(await request.json().catch(() => null));
  if (!p.success) return NextResponse.json({ error: 'Choose a rating from 1 to 5 stars. Comments can be up to 500 characters.' }, { status: 400 });
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: 'Order not found.' }, { status: 404 });

  const [order] = await db.select().from(schema.orders).where(and(eq(schema.orders.id, id), eq(schema.orders.userId, customer.id)));
  if (!order) return NextResponse.json({ error: 'Order not found.' }, { status: 404 });
  if (order.status !== 'Completed') return NextResponse.json({ error: 'You can leave feedback once your order is completed.' }, { status: 409 });

  const comment = p.data.comment?.trim() || null;
  const [row] = await db
    .insert(schema.orderFeedback)
    .values({ orderId: id, userId: customer.id, rating: p.data.rating, comment })
    .onConflictDoUpdate({ target: schema.orderFeedback.orderId, set: { rating: p.data.rating, comment, updatedAt: new Date() } })
    .returning();
  return NextResponse.json({ success: true, feedback: { rating: row.rating, comment: row.comment } });
}
