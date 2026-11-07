import { NextResponse } from 'next/server';
import { requireStaff } from '@/lib/server/guard';
import { saveImage } from '@/lib/server/storage';

export const runtime = 'nodejs';

// Product / deal images. Stored privately on disk and served by /api/files/product/[name].
export async function POST(request) {
  const g = await requireStaff(request);
  if (g.error) return g.error;
  const form = await request.formData().catch(() => null);
  const res = await saveImage(form?.get('file'), 'products');
  if (res.error) return NextResponse.json({ error: res.error }, { status: 400 });
  return NextResponse.json({ success: true, url: `/api/files/product/${res.name}` });
}
