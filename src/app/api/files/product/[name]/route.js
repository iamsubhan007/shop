import { NextResponse } from 'next/server';
import { readImage } from '@/lib/server/storage';

// Product images are public (they appear on the menu).
export async function GET(_req, { params }) {
  const { name } = await params;
  const img = await readImage('products', name);
  if (!img) return new NextResponse('Not found', { status: 404 });
  return new NextResponse(img.buf, { headers: { 'Content-Type': img.mime, 'Cache-Control': 'public, max-age=31536000, immutable', 'X-Content-Type-Options': 'nosniff' } });
}
