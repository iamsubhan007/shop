// Builds a sales report from the contents of a backup file (hbt-backup-*.json.gz, already decompressed and parsed).
// Pure functions with no imports: the Storage & Backups page runs them in the browser, so the file you pick never leaves
// your phone or computer, and the same code is tested in plain Node. All days are shop time (Pakistan, UTC+5, no DST).
//
// The money definitions are the live "Daily closing report" ones (src/lib/server/reports.js), so a day in a backup
// reads the same as that day did when the backup was taken: cancelled/rejected orders never count as sales, "collected"
// is verified transfers plus COD cash taken, and so on.

const PK_OFFSET_MS = 5 * 3600 * 1000;
const DAY_MS = 86400000;
const NOT_COUNTED = ['Cancelled', 'Rejected'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const num = (v) => Number(v) || 0;
const money = (n) => Math.round(n * 100) / 100;

/** Milliseconds since 1970 for a database timestamp such as "2026-11-15T10:59:03.123456+00:00"; NaN if unreadable. */
export function parseTimestamp(v) {
  if (v instanceof Date) return v.getTime();
  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?\s*(Z|[+-]\d{2}(?::?\d{2})?)?$/.exec(String(v ?? '').trim());
  if (!m) return NaN;
  const ms = Number((m[7] || '0').slice(0, 3).padEnd(3, '0'));
  let offsetMin = 0;
  if (m[8] && m[8] !== 'Z') {
    const sign = m[8][0] === '-' ? -1 : 1;
    const digits = m[8].slice(1).replace(':', '');
    offsetMin = sign * (Number(digits.slice(0, 2)) * 60 + Number(digits.slice(2) || 0));
  }
  return Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6], ms) - offsetMin * 60000;
}

export const pkDay = (ms) => new Date(ms + PK_OFFSET_MS).toISOString().slice(0, 10);
const pkHour = (ms) => new Date(ms + PK_OFFSET_MS).getUTCHours();
const ymd = (s) => { const m = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/.exec(String(s || '')); return m ? [+m[1], +m[2], m[3] ? +m[3] : 1] : null; };
const startOfPkDay = (y, mo, d) => Date.UTC(y, mo - 1, d) - PK_OFFSET_MS;
const labelDay = (ms) => { const d = new Date(ms + PK_OFFSET_MS); return `${DOW[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()].slice(0, 3)}`; };

/**
 * The time window a report covers. period: 'day' | 'week' (Monday to Sunday, containing `date`) | 'month'.
 * `date` is YYYY-MM-DD (YYYY-MM is fine for a month). Returns { from, to, label, days } or null for a bad date.
 */
export function periodRange(period, date) {
  const p = ymd(date);
  if (!p) return null;
  const [y, mo, d] = p;
  let from, to;
  if (period === 'day') { from = startOfPkDay(y, mo, d); to = from + DAY_MS; }
  else if (period === 'week') { const dow = (new Date(Date.UTC(y, mo - 1, d)).getUTCDay() + 6) % 7; from = startOfPkDay(y, mo, d - dow); to = from + 7 * DAY_MS; }
  else if (period === 'month') { from = startOfPkDay(y, mo, 1); to = startOfPkDay(y, mo + 1, 1); }
  else return null;
  const days = [];
  for (let t = from; t < to; t += DAY_MS) days.push(pkDay(t));
  const yearOf = (ms) => new Date(ms + PK_OFFSET_MS).getUTCFullYear();
  const label = period === 'month' ? `${MONTHS[mo - 1]} ${y}`
    : period === 'day' ? `${labelDay(from)} ${y}`
    : `${labelDay(from)} - ${labelDay(to - DAY_MS)} ${yearOf(to - DAY_MS)}`;
  return { from, to, label, days };
}

/** The same kind of period one step earlier (-1) or later (+1), as a YYYY-MM-DD date. */
export function shiftPeriod(period, date, dir) {
  const r = periodRange(period, date);
  if (!r) return date;
  if (period === 'month') { const [y, mo] = ymd(date); return pkDay(startOfPkDay(y, mo + dir, 1)); }
  return pkDay(r.from + dir * (period === 'week' ? 7 : 1) * DAY_MS);
}

/** Basic sanity check of a parsed backup; returns an error message or null. */
export function checkBackup(data) {
  if (!data || typeof data !== 'object' || !data.tables || typeof data.tables !== 'object') return 'This does not look like a shop backup file.';
  if (data.version !== 1) return 'This backup was made by a different version of the app and cannot be read here.';
  if (!Array.isArray(data.tables.orders)) return 'This backup file has no orders in it.';
  return null;
}

/** What the file covers: when it was taken and the first and last order day. */
export function backupInfo(data) {
  const ms = (data.tables.orders || []).map((o) => parseTimestamp(o.created_at)).filter(Number.isFinite);
  return {
    takenAt: data.createdAt || null,
    orders: (data.tables.orders || []).length,
    firstDay: ms.length ? pkDay(Math.min(...ms)) : null,
    lastDay: ms.length ? pkDay(Math.max(...ms)) : null,
  };
}

const top = (map, key, n) => [...map.entries()].map(([title, v]) => ({ title, ...v })).sort((a, b) => b[key] - a[key] || (a.title < b.title ? -1 : 1)).slice(0, n);

export function buildReport(data, { period = 'day', date }) {
  const range = periodRange(period, date);
  if (!range) return null;
  const t = data.tables || {};
  const inRange = (t.orders || [])
    .map((o) => ({ o, ms: parseTimestamp(o.created_at) }))
    .filter((x) => x.ms >= range.from && x.ms < range.to)
    .sort((a, b) => b.ms - a.ms);
  const all = inRange.map((x) => x.o);
  const live = all.filter((o) => !NOT_COUNTED.includes(o.status));
  const sum = (rows, f) => money(rows.reduce((s, o) => s + num(f(o)), 0));
  const verified = (method) => sum(live.filter((o) => o.payment_method === method && o.payment_status === 'verified'), (o) => o.total_amount);

  const bankVerified = verified('bank_transfer');
  const jazzcashVerified = verified('jazzcash');
  const easypaisaVerified = verified('easypaisa');
  const codCollected = sum(all.filter((o) => o.payment_status === 'cod_collected'), (o) => o.total_amount);
  const gross = sum(live, (o) => o.total_amount);

  const summary = {
    received: all.length,
    completed: all.filter((o) => o.status === 'Completed').length,
    cancelled: all.filter((o) => NOT_COUNTED.includes(o.status)).length,
    inProgress: all.filter((o) => !['Completed', ...NOT_COUNTED].includes(o.status)).length,
    pickup: all.filter((o) => o.order_type === 'pickup').length,
    delivery: all.filter((o) => o.order_type === 'delivery').length,
    codOrders: live.filter((o) => o.payment_method === 'cod').length,
    gross,
    averageOrder: live.length ? money(gross / live.length) : 0,
    discounts: sum(live, (o) => o.discount_amount),
    deliveryFees: sum(live, (o) => o.delivery_fee),
    bankVerified, jazzcashVerified, easypaisaVerified, codCollected,
    collected: money(bankVerified + jazzcashVerified + easypaisaVerified + codCollected),
    pendingPayments: sum(live.filter((o) => o.payment_method !== 'cod' && ['pending', 'submitted', 'rejected'].includes(o.payment_status)), (o) => o.total_amount),
    outstandingCod: sum(live.filter((o) => o.payment_status === 'cod_pending'), (o) => o.total_amount),
  };

  const byStatus = {};
  for (const o of all) byStatus[o.status] = (byStatus[o.status] || 0) + 1;

  const payMap = new Map();
  for (const o of live) { const v = payMap.get(o.payment_method) || { orders: 0, amount: 0 }; v.orders += 1; v.amount = money(v.amount + num(o.total_amount)); payMap.set(o.payment_method, v); }
  const byPayment = [...payMap.entries()].map(([method, v]) => ({ method, ...v })).sort((a, b) => b.amount - a.amount);

  const dayMap = new Map(range.days.map((d) => [d, { day: d, orders: 0, sales: 0, salesOrders: 0 }]));
  for (const { o, ms } of inRange) {
    const row = dayMap.get(pkDay(ms));
    if (!row) continue;
    row.orders += 1;
    if (!NOT_COUNTED.includes(o.status)) { row.salesOrders += 1; row.sales = money(row.sales + num(o.total_amount)); }
  }

  // items and categories of the counted orders
  const liveIds = new Set(live.map((o) => o.id));
  const catOfProduct = new Map();
  const catName = new Map((t.categories || []).map((c) => [c.id, c.name]));
  for (const p of t.products || []) catOfProduct.set(p.id, catName.get(p.category_id) || 'Other');
  const items = new Map();
  const cats = new Map();
  for (const it of t.order_items || []) {
    if (!liveIds.has(it.order_id)) continue;
    const q = num(it.quantity), r = num(it.subtotal_price);
    const a = items.get(it.item_title) || { qty: 0, revenue: 0 };
    a.qty += q; a.revenue = money(a.revenue + r); items.set(it.item_title, a);
    const cname = (it.product_id && catOfProduct.get(it.product_id)) || 'Other';
    const c = cats.get(cname) || { qty: 0, revenue: 0 };
    c.qty += q; c.revenue = money(c.revenue + r); cats.set(cname, c);
  }

  const hours = new Map();
  for (const { o, ms } of inRange) if (!NOT_COUNTED.includes(o.status)) hours.set(pkHour(ms), (hours.get(pkHour(ms)) || 0) + 1);
  const busiestHours = [...hours.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0]).slice(0, 3).map(([h, orders]) => ({ hour: `${String(h).padStart(2, '0')}:00`, orders }));

  const ids = new Set(all.map((o) => o.id));
  const numberOf = new Map(all.map((o) => [o.id, o.order_number]));
  const fb = (t.order_feedback || []).filter((f) => ids.has(f.order_id));
  const dist = [0, 0, 0, 0, 0];
  for (const f of fb) { const r = Math.round(num(f.rating)); if (r >= 1 && r <= 5) dist[r - 1] += 1; }
  const rated = dist.reduce((a, b) => a + b, 0);
  const feedback = {
    count: fb.length,
    average: rated ? Math.round((dist.reduce((s, c, i) => s + c * (i + 1), 0) / rated) * 10) / 10 : null,
    distribution: dist,
    comments: fb.filter((f) => f.comment).sort((a, b) => parseTimestamp(b.updated_at) - parseTimestamp(a.updated_at)).slice(0, 8)
      .map((f) => ({ rating: f.rating, comment: f.comment, orderNumber: numberOf.get(f.order_id) || '' })),
  };

  return {
    period, date, label: range.label, from: range.from, to: range.to,
    summary, byStatus, byPayment,
    byDay: [...dayMap.values()],
    bestSellers: top(items, 'qty', 10),
    topRevenue: top(items, 'revenue', 10),
    categories: top(cats, 'revenue', 20),
    busiestHours,
    feedback,
    orders: inRange.map(({ o, ms }) => ({
      orderNumber: o.order_number, createdAt: ms, customerName: o.customer_name || '', type: o.order_type, status: o.status,
      paymentMethod: o.payment_method, paymentStatus: o.payment_status,
      subtotal: num(o.subtotal), discount: num(o.discount_amount), delivery: num(o.delivery_fee), total: num(o.total_amount),
    })),
  };
}

const csvCell = (v) => {
  let s = String(v ?? '');
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; // a name that starts like a formula must not run in Excel
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** The period's orders as CSV text (customer name only: no phone, email or address). */
export function ordersToCsv(report) {
  const head = ['Order #', 'Date and time (Pakistan)', 'Customer', 'Type', 'Status', 'Payment', 'Payment status', 'Items total', 'Discount', 'Delivery', 'Total'];
  const rows = report.orders.map((o) => [o.orderNumber, new Date(o.createdAt + PK_OFFSET_MS).toISOString().slice(0, 16).replace('T', ' '), o.customerName, o.type, o.status, o.paymentMethod, o.paymentStatus, o.subtotal, o.discount, o.delivery, o.total]);
  return [head, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n');
}
