import { NextResponse } from 'next/server';
import { sql } from 'drizzle-orm';
import { db } from '@/db';
import { requireStaff } from '@/lib/server/guard';
import { startOfPkDay } from '@/lib/server/orders';

export const dynamic = 'force-dynamic';

/**
 * Money definitions (so the owner is never misled):
 *  - collected = prepaid orders with payment VERIFIED + COD orders COLLECTED (delivered). Cancelled/rejected never count.
 *  - pending   = live orders whose money is not yet collected (unverified prepaid, COD not delivered).
 *  - gross     = value of all non-cancelled orders placed.
 */
export async function GET(request) {
  const g = await requireStaff(request, ['owner', 'admin']);
  if (g.error) return g.error;
  const sp = new URL(request.url).searchParams;
  const from = sp.get('from') ? new Date(sp.get('from')) : new Date(Date.now() - 29 * 86400000);
  const to = sp.get('to') ? new Date(new Date(sp.get('to')).getTime() + 86400000) : new Date(Date.now() + 86400000);
  const today = startOfPkDay();
  const iso = (d) => d.toISOString();

  const [t] = await db.execute(sql`
    select
      count(*)::int as total,
      count(*) filter (where created_at >= ${iso(today)}::timestamptz)::int as today,
      count(*) filter (where status in ('Placed','Payment Pending','Payment Verification','Confirmed','Cooking','Ready for Pickup','Out for Delivery'))::int as pending,
      count(*) filter (where status = 'Completed')::int as completed,
      count(*) filter (where status in ('Cancelled','Rejected'))::int as cancelled,
      coalesce(sum(total_amount) filter (where status not in ('Cancelled','Rejected')),0)::float as gross,
      coalesce(sum(total_amount) filter (where payment_status in ('verified','cod_collected') and status not in ('Cancelled','Rejected')),0)::float as collected,
      coalesce(sum(total_amount) filter (where payment_status in ('verified','cod_collected') and status not in ('Cancelled','Rejected') and created_at >= ${iso(today)}::timestamptz),0)::float as collected_today,
      coalesce(sum(total_amount) filter (where payment_status in ('pending','submitted','cod_pending') and status not in ('Cancelled','Rejected','Completed')),0)::float as pending_amount,
      coalesce(sum(total_amount) filter (where payment_status = 'verified' and status not in ('Cancelled','Rejected')),0)::float as verified_prepaid,
      coalesce(sum(total_amount) filter (where payment_status = 'cod_collected'),0)::float as cod_collected
    from orders where created_at >= ${iso(from)}::timestamptz and created_at < ${iso(to)}::timestamptz`);

  const daily = await db.execute(sql`
    select to_char(created_at at time zone 'Asia/Karachi','YYYY-MM-DD') as day, count(*)::int as orders,
      coalesce(sum(total_amount) filter (where payment_status in ('verified','cod_collected') and status not in ('Cancelled','Rejected')),0)::float as revenue
    from orders where created_at >= ${iso(from)}::timestamptz and created_at < ${iso(to)}::timestamptz group by 1 order by 1`);
  const byStatus = await db.execute(sql`select status, count(*)::int as n from orders where created_at >= ${iso(from)}::timestamptz and created_at < ${iso(to)}::timestamptz group by 1 order by 2 desc`);
  const byPayment = await db.execute(sql`select payment_method as method, count(*)::int as n from orders where status not in ('Cancelled','Rejected') and created_at >= ${iso(from)}::timestamptz and created_at < ${iso(to)}::timestamptz group by 1 order by 2 desc`);
  const top = await db.execute(sql`
    select oi.item_title as title, sum(oi.quantity)::int as qty, sum(oi.subtotal_price)::float as revenue
    from order_items oi join orders o on o.id = oi.order_id
    where o.status not in ('Cancelled','Rejected') and o.created_at >= ${iso(from)}::timestamptz and o.created_at < ${iso(to)}::timestamptz
    group by 1 order by 2 desc limit 8`);

  return NextResponse.json({
    range: { from: iso(from), to: iso(to) },
    totals: { ...t, avgOrder: t.total - t.cancelled > 0 ? Math.round(t.gross / (t.total - t.cancelled)) : 0 },
    daily: [...daily],
    byStatus: [...byStatus],
    byPayment: [...byPayment],
    topProducts: [...top],
  });
}
