import { NextResponse } from 'next/server';
import { sql } from 'drizzle-orm';
import { db } from '@/db';
import { requireStaff } from '@/lib/server/guard';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const g = await requireStaff(request);
  if (g.error) return g.error;
  const q = new URL(request.url).searchParams.get('q')?.trim().replace(/[%_]/g, '');
  const like = q ? `%${q}%` : '%';
  const rows = await db.execute(sql`
    select p.id, p.full_name, p.email, p.phone, p.loyalty_points, p.created_at,
      count(o.*) filter (where o.status = 'Completed')::int as completed,
      count(o.*)::int as total_orders,
      coalesce(sum(o.total_amount) filter (where o.status = 'Completed'),0)::float as spent
    from profiles p left join orders o on o.user_id = p.id
    where p.role = 'customer' and (coalesce(p.full_name,'') ilike ${like} or p.email ilike ${like} or coalesce(p.phone,'') ilike ${like})
    group by p.id order by spent desc, p.created_at desc limit 200`);
  return NextResponse.json({ customers: [...rows].map((c) => ({ ...c, repeat: c.completed >= 2 })) });
}
