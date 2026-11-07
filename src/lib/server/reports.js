import 'server-only';
import { sql } from 'drizzle-orm';
import { db } from '@/db';

const DONE = `('Cancelled','Rejected')`;

export function pkDayRange(day) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  const from = new Date(`${day}T00:00:00+05:00`);
  if (isNaN(from)) return null;
  return { from, to: new Date(from.getTime() + 86400000) };
}

export function rangeFrom(sp, defaultDays = 30) {
  const to = sp.get('to') ? new Date(new Date(`${sp.get('to')}T00:00:00+05:00`).getTime() + 86400000) : new Date(Date.now() + 86400000);
  const from = sp.get('from') ? new Date(`${sp.get('from')}T00:00:00+05:00`) : new Date(to.getTime() - (defaultDays + 1) * 86400000);
  if (isNaN(from) || isNaN(to)) return null;
  return { from, to };
}

const iso = (d) => d.toISOString();

/** Daily closing report. "Collected" never includes pending, unpaid or cancelled orders. */
export async function closingReport(day) {
  const r = pkDayRange(day);
  if (!r) return null;
  const f = iso(r.from), t = iso(r.to);
  const [a] = await db.execute(sql`
    select
      count(*)::int as received,
      count(*) filter (where status = 'Completed')::int as completed,
      count(*) filter (where status in ('Cancelled','Rejected'))::int as cancelled,
      count(*) filter (where order_type = 'pickup')::int as pickup,
      count(*) filter (where order_type = 'delivery')::int as delivery,
      count(*) filter (where payment_method = 'cod' and status not in ('Cancelled','Rejected'))::int as cod_orders,
      coalesce(sum(total_amount) filter (where payment_method = 'bank_transfer' and payment_status = 'verified' and status not in ('Cancelled','Rejected')),0)::float as bank_verified,
      coalesce(sum(total_amount) filter (where payment_method = 'jazzcash' and payment_status = 'verified' and status not in ('Cancelled','Rejected')),0)::float as jazzcash_verified,
      coalesce(sum(total_amount) filter (where payment_method = 'easypaisa' and payment_status = 'verified' and status not in ('Cancelled','Rejected')),0)::float as easypaisa_verified,
      coalesce(sum(total_amount) filter (where payment_status = 'cod_collected'),0)::float as cod_collected,
      coalesce(sum(total_amount) filter (where payment_method <> 'cod' and payment_status in ('pending','submitted','rejected') and status not in ('Cancelled','Rejected')),0)::float as pending_payments,
      coalesce(sum(total_amount) filter (where payment_status = 'cod_pending' and status not in ('Cancelled','Rejected')),0)::float as outstanding_cod,
      coalesce(sum(discount_amount) filter (where status not in ('Cancelled','Rejected')),0)::float as discounts,
      coalesce(sum(total_amount) filter (where status not in ('Cancelled','Rejected')),0)::float as gross
    from orders where created_at >= ${f}::timestamptz and created_at < ${t}::timestamptz`);
  const top = await db.execute(sql`
    select oi.item_title as title, sum(oi.quantity)::int as qty, sum(oi.subtotal_price)::float as revenue
    from order_items oi join orders o on o.id = oi.order_id
    where o.status not in ('Cancelled','Rejected') and o.created_at >= ${f}::timestamptz and o.created_at < ${t}::timestamptz
    group by 1 order by 2 desc limit 10`);
  const collected = a.bank_verified + a.jazzcash_verified + a.easypaisa_verified + a.cod_collected;
  return { day, ...a, collected, bestSellers: [...top] };
}

export async function analytics(range) {
  const f = iso(range.from), t = iso(range.to);
  const span = range.to.getTime() - range.from.getTime();
  const pf = iso(new Date(range.from.getTime() - span)), pt = f;
  const q = (a, b) => db.execute(sql`
    select oi.item_title as title, coalesce(c.name, 'Other') as category, sum(oi.quantity)::int as qty, sum(oi.subtotal_price)::float as revenue
    from order_items oi join orders o on o.id = oi.order_id
    left join products p on p.id = oi.product_id left join categories c on c.id = p.category_id
    where o.status not in ('Cancelled','Rejected') and o.created_at >= ${a}::timestamptz and o.created_at < ${b}::timestamptz
    group by 1, 2`);
  const cur = [...(await q(f, t))];
  const prev = [...(await q(pf, pt))];
  const byQty = [...cur].sort((x, y) => y.qty - x.qty);
  const prevMap = new Map();
  for (const p of prev) prevMap.set(p.title, (prevMap.get(p.title) || 0) + p.qty);
  const cats = new Map();
  for (const r of cur) {
    const c = cats.get(r.category) || { category: r.category, qty: 0, revenue: 0 };
    c.qty += r.qty; c.revenue += r.revenue; cats.set(r.category, c);
  }
  const sum = (arr, k) => arr.reduce((s, x) => s + x[k], 0);
  return {
    mostOrdered: byQty.slice(0, 10),
    leastOrdered: [...byQty].reverse().slice(0, 10),
    revenueByProduct: [...cur].sort((x, y) => y.revenue - x.revenue).slice(0, 15),
    categories: [...cats.values()].sort((x, y) => y.revenue - x.revenue),
    comparison: {
      current: { qty: sum(cur, 'qty'), revenue: sum(cur, 'revenue') },
      previous: { qty: sum(prev, 'qty'), revenue: sum(prev, 'revenue') },
      perProduct: byQty.slice(0, 10).map((r) => ({ title: r.title, qty: r.qty, previousQty: prevMap.get(r.title) || 0 })),
    },
  };
}

// ---------- tabular exports ----------
const dt = (d) => (d ? new Date(d).toLocaleString('en-PK', { timeZone: 'Asia/Karachi', dateStyle: 'medium', timeStyle: 'short' }) : '');

export async function exportData(type, range) {
  const f = iso(range.from), t = iso(range.to);
  if (type === 'orders') {
    const rows = await db.execute(sql`select * from orders where created_at >= ${f}::timestamptz and created_at < ${t}::timestamptz order by created_at desc`);
    return {
      title: 'Orders',
      columns: [['Order #', 24], ['Date', 22], ['Customer', 22], ['Phone', 16], ['Email', 28], ['Type', 10], ['Address', 34], ['Status', 18], ['Payment', 16], ['Payment status', 16], ['Subtotal', 10], ['Discount', 10], ['Delivery', 10], ['Total', 10]],
      rows: [...rows].map((o) => [o.order_number, dt(o.created_at), o.customer_name, o.customer_phone, o.customer_email, o.order_type, o.delivery_address || '', o.status, o.payment_method, o.payment_status, Number(o.subtotal), Number(o.discount_amount), Number(o.delivery_fee), Number(o.total_amount)]),
    };
  }
  if (type === 'customers') {
    const rows = await db.execute(sql`
      select p.full_name, p.email, p.phone, p.loyalty_points, p.created_at,
        count(o.*) filter (where o.status = 'Completed')::int as completed,
        coalesce(sum(o.total_amount) filter (where o.status = 'Completed'),0)::float as spent
      from profiles p left join orders o on o.user_id = p.id where p.role = 'customer' group by p.id order by spent desc`);
    return {
      title: 'Customers',
      columns: [['Name', 24], ['Email', 30], ['Phone', 16], ['Joined', 22], ['Completed orders', 16], ['Lifetime spend', 16], ['Loyalty points', 14]],
      rows: [...rows].map((c) => [c.full_name || '', c.email, c.phone || '', dt(c.created_at), c.completed, c.spent, c.loyalty_points]),
    };
  }
  if (type === 'revenue') {
    const rows = await db.execute(sql`
      select to_char(created_at at time zone 'Asia/Karachi','YYYY-MM-DD') as day, count(*)::int as orders,
        coalesce(sum(total_amount) filter (where status not in ('Cancelled','Rejected')),0)::float as gross,
        coalesce(sum(discount_amount) filter (where status not in ('Cancelled','Rejected')),0)::float as discounts,
        coalesce(sum(total_amount) filter (where payment_status in ('verified','cod_collected') and status not in ('Cancelled','Rejected')),0)::float as collected,
        coalesce(sum(total_amount) filter (where payment_status in ('pending','submitted','cod_pending','rejected') and status not in ('Cancelled','Rejected')),0)::float as uncollected
      from orders where created_at >= ${f}::timestamptz and created_at < ${t}::timestamptz group by 1 order by 1`);
    return { title: 'Revenue', columns: [['Day', 14], ['Orders', 10], ['Gross value', 14], ['Discounts', 12], ['Collected', 14], ['Not yet collected', 16]], rows: [...rows].map((r) => [r.day, r.orders, r.gross, r.discounts, r.collected, r.uncollected]) };
  }
  if (type === 'payments') {
    const rows = await db.execute(sql`
      select o.order_number, o.created_at, o.payment_method, o.payment_status, o.total_amount, o.payment_reference, ps.status as sub_status, ps.verified_at
      from orders o left join lateral (select * from payment_submissions s where s.order_id = o.id order by submitted_at desc limit 1) ps on true
      where o.created_at >= ${f}::timestamptz and o.created_at < ${t}::timestamptz order by o.created_at desc`);
    return {
      title: 'Payments',
      columns: [['Order #', 24], ['Date', 22], ['Method', 16], ['Payment status', 16], ['Amount', 12], ['Reference', 24], ['Verified at', 22]],
      rows: [...rows].map((r) => [r.order_number, dt(r.created_at), r.payment_method, r.payment_status, Number(r.total_amount), r.payment_reference || '', dt(r.verified_at)]),
    };
  }
  if (type === 'products') {
    const rows = await db.execute(sql`
      select oi.item_title as title, sum(oi.quantity)::int as qty, sum(oi.subtotal_price)::float as revenue, count(distinct o.id)::int as orders
      from order_items oi join orders o on o.id = oi.order_id
      where o.status not in ('Cancelled','Rejected') and o.created_at >= ${f}::timestamptz and o.created_at < ${t}::timestamptz group by 1 order by 3 desc`);
    return { title: 'Product sales', columns: [['Product', 36], ['Quantity sold', 14], ['Revenue', 14], ['Orders', 10]], rows: [...rows].map((r) => [r.title, r.qty, r.revenue, r.orders]) };
  }
  return null;
}
