import { NextResponse } from 'next/server';
import { eq, or } from 'drizzle-orm';
import { db, schema } from '@/db';
import { getCustomer, getStaff } from '@/lib/server/auth';
import { readImage } from '@/lib/server/storage';

// Payment proofs are private: only staff, or the customer who owns the order, can view them.
export async function GET(_req, { params }) {
  const { name } = await params;
  const staff = await getStaff(['owner', 'admin']);
  if (!staff) {
    const customer = await getCustomer();
    if (!customer) return new NextResponse('Not found', { status: 404 });
    const [o] = await db.select({ userId: schema.orders.userId }).from(schema.orders).where(eq(schema.orders.paymentProofUrl, name));
    const [s] = o ? [o] : await db.select({ userId: schema.paymentSubmissions.userId }).from(schema.paymentSubmissions).where(eq(schema.paymentSubmissions.proofImageUrl, name));
    if (!s || s.userId !== customer.id) return new NextResponse('Not found', { status: 404 });
  }
  const img = await readImage('proofs', name);
  if (!img) return new NextResponse('Not found', { status: 404 });
  return new NextResponse(img.buf, { headers: { 'Content-Type': img.mime, 'Cache-Control': 'private, max-age=0', 'X-Content-Type-Options': 'nosniff' } });
}
