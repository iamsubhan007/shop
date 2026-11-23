import { NextResponse } from 'next/server';
import { getMenuData } from '@/lib/server/menuData';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json(await getMenuData());
}
