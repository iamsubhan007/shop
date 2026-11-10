import { NextResponse } from 'next/server';
import { getCustomer, rateLimit } from '@/lib/server/auth';
import { saveImage } from '@/lib/server/storage';

export const runtime = 'nodejs';

export async function POST(request) {
  const customer = await getCustomer();
  if (!customer) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });
  const rl = await rateLimit(`upload:${customer.id}`, 20, 3600);
  if (!rl.ok) return NextResponse.json({ error: 'Too many uploads. Try again later.' }, { status: 429 });
  const form = await request.formData().catch(() => null);
  const res = await saveImage(form?.get('file'), 'proofs');
  if (res.error) return NextResponse.json({ error: res.error }, { status: res.status || 400 });
  return NextResponse.json({ success: true, file: res.name });
}
