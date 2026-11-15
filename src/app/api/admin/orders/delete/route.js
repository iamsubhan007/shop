import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireStaff } from '@/lib/server/guard';
import { ORDER_ADMIN_ROLES } from '@/lib/orderStatus';
import { OrderError } from '@/lib/server/orders';
import { deleteOrders } from '@/lib/server/orderAdmin';

export const dynamic = 'force-dynamic';

/**
 * Owner/admin only: permanently delete finished orders (Completed, Cancelled or Rejected). Anything still in
 * progress is refused, and nothing is deleted if any selected order is not finished.
 */
export async function POST(request) {
  const g = await requireStaff(request, ORDER_ADMIN_ROLES);
  if (g.error) return g.error;
  const p = z.object({ ids: z.array(z.string().uuid()).min(1).max(100) }).safeParse(await request.json().catch(() => null));
  if (!p.success) return NextResponse.json({ error: 'Choose between 1 and 100 orders to delete.' }, { status: 400 });
  try {
    const r = await deleteOrders([...new Set(p.data.ids)], g.staff);
    return NextResponse.json({ success: true, deleted: r.deleted });
  } catch (e) {
    if (e instanceof OrderError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error('order delete failed', e);
    return NextResponse.json({ error: 'Could not delete the orders.' }, { status: 500 });
  }
}
