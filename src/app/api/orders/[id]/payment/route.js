import { NextResponse, after } from 'next/server';
import { z } from 'zod';
import { getCustomer } from '@/lib/server/auth';
import { OrderError, submitPayment } from '@/lib/server/orders';
import { notifyStaffOfOrder } from '@/lib/server/push';

const schema = z.object({
  reference: z.string().trim().max(100).optional().nullable(),
  proofFile: z.string().regex(/^[a-f0-9-]{36}\.(jpg|png|webp)$/).optional().nullable(),
});

export async function POST(request, { params }) {
  const { id } = await params;
  const customer = await getCustomer();
  if (!customer) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid payment details.' }, { status: 400 });
  try {
    await submitPayment(id, customer, parsed.data);
    after(() => notifyStaffOfOrder(id)); // the order now needs a payment check: push to owner/admin
    return NextResponse.json({ success: true });
  } catch (e) {
    if (e instanceof OrderError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error(e);
    return NextResponse.json({ error: 'Could not submit payment details.' }, { status: 500 });
  }
}
