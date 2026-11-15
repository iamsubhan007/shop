// Unit test for src/lib/backupReport.js and src/lib/storageMath.js (pure code, no server or database needed).
// Usage: node scripts/test-backup-report.mjs
import { backupInfo, buildReport, checkBackup, ordersToCsv, parseTimestamp, periodRange, shiftPeriod } from '../src/lib/backupReport.js';
import { buildAlertEmail, formatBytes, levelFor, usagePercent } from '../src/lib/storageMath.js';

let pass = 0, fail = 0;
const check = (n, c, x = '') => { c ? pass++ : fail++; console.log(`${c ? 'PASS' : 'FAIL'}  ${n}${c ? '' : '  ' + x}`); };
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// ---- timestamps
check('parses a Postgres timestamp with microseconds and +00:00', parseTimestamp('2026-11-15T10:59:03.123456+00:00') === Date.UTC(2026, 10, 15, 10, 59, 3, 123));
check('parses a space-separated timestamp with +05', parseTimestamp('2026-11-15 15:59:03+05') === Date.UTC(2026, 10, 15, 10, 59, 3));
check('parses Z and a +05:30 offset', parseTimestamp('2026-11-15T10:00:00Z') === Date.UTC(2026, 10, 15, 10) && parseTimestamp('2026-11-15T15:30:00+05:30') === Date.UTC(2026, 10, 15, 10));
check('rejects garbage', Number.isNaN(parseTimestamp('yesterday')) && Number.isNaN(parseTimestamp(null)));

// ---- periods (shop time = UTC+5)
const day = periodRange('day', '2026-11-15');
check('a day runs from 00:00 to 24:00 shop time', day.from === Date.UTC(2026, 10, 14, 19) && day.to - day.from === 86400000 && day.days.length === 1 && day.days[0] === '2026-11-15', JSON.stringify(day));
const wk = periodRange('week', '2026-11-15'); // a Sunday
check('a week is Monday to Sunday (Sunday belongs to the week before it)', wk.days[0] === '2026-11-09' && wk.days[6] === '2026-11-15' && wk.days.length === 7, wk.days.join());
check('a Monday starts its own week', periodRange('week', '2026-11-16').days[0] === '2026-11-16');
const mo = periodRange('month', '2026-02-10');
check('February 2026 has 28 days and a clear label', mo.days.length === 28 && mo.days[0] === '2026-02-01' && mo.label === 'February 2026', `${mo.days.length} ${mo.label}`);
check('a month can be given as YYYY-MM', periodRange('month', '2026-12').days.length === 31);
check('a bad date or period gives nothing', periodRange('day', 'nope') === null && periodRange('year', '2026-01-01') === null);
check('week labels cross months and years', periodRange('week', '2026-12-30').label.includes('Mon 28 Dec') && periodRange('week', '2026-12-30').label.endsWith('2027'), periodRange('week', '2026-12-30').label);
check('shifting steps by a day, a week or a month', shiftPeriod('day', '2026-11-15', -1) === '2026-11-14' && shiftPeriod('week', '2026-11-15', 1) === '2026-11-16' && shiftPeriod('month', '2026-12-20', 1) === '2027-01-01' && shiftPeriod('month', '2026-01-31', -1) === '2025-12-01');

// ---- a small synthetic backup
const O = (id, no, at, over = {}) => ({ id, order_number: no, created_at: at, order_type: 'delivery', status: 'Completed', customer_name: 'Ali', payment_method: 'cod', payment_status: 'cod_collected', subtotal: 1000, discount_amount: 0, delivery_fee: 100, total_amount: 1100, ...over });
const backup = {
  version: 1, createdAt: '2026-11-16T09:00:00+00:00',
  tables: {
    orders: [
      O('o1', 'HBT-261115-001', '2026-11-15T07:00:00+00:00'),                                                                   // 12:00 PKT, COD collected 1100
      O('o2', 'HBT-261115-002', '2026-11-15T08:00:00+00:00', { order_type: 'pickup', payment_method: 'bank_transfer', payment_status: 'verified', delivery_fee: 0, total_amount: 500, subtotal: 500 }),
      O('o3', 'HBT-261115-003', '2026-11-15T09:00:00+00:00', { status: 'Cancelled', payment_status: 'cod_pending', total_amount: 900 }),   // cancelled: not a sale
      O('o4', 'HBT-261115-004', '2026-11-15T10:00:00+00:00', { status: 'Placed', payment_status: 'cod_pending', discount_amount: 100, total_amount: 1000 }), // open COD, outstanding
      O('o5', 'HBT-261114-009', '2026-11-14T19:30:00+00:00', { total_amount: 700 }),                                             // 00:30 PKT on 15 Nov: belongs to the 15th
      O('o6', 'HBT-261114-008', '2026-11-14T18:59:00+00:00', { total_amount: 300 }),                                             // 23:59 PKT on 14 Nov: the day before
      O('o7', 'HBT-261110-001', '2026-11-10T07:00:00+00:00', { payment_method: 'jazzcash', payment_status: 'pending', total_amount: 400 }),
    ],
    order_items: [
      { order_id: 'o1', product_id: 'p1', item_title: 'Nutella Naan', quantity: 2, subtotal_price: 1000 },
      { order_id: 'o2', product_id: 'p1', item_title: 'Nutella Naan', quantity: 1, subtotal_price: 500 },
      { order_id: 'o3', product_id: 'p2', item_title: 'Cheese Naan', quantity: 5, subtotal_price: 2000 },   // cancelled: ignored
      { order_id: 'o4', product_id: null, deal_id: 'd1', item_title: 'Family Deal', quantity: 1, subtotal_price: 900 },
    ],
    products: [{ id: 'p1', category_id: 'c1' }, { id: 'p2', category_id: 'c1' }],
    categories: [{ id: 'c1', name: 'Naans' }],
    order_feedback: [
      { order_id: 'o1', rating: 5, comment: 'Hot and fresh', updated_at: '2026-11-15T12:00:00+00:00' },
      { order_id: 'o2', rating: 3, comment: null, updated_at: '2026-11-15T12:05:00+00:00' },
      { order_id: 'o7', rating: 1, comment: 'other day', updated_at: '2026-11-10T12:00:00+00:00' },
    ],
  },
};
check('a good backup passes the check', checkBackup(backup) === null);
check('wrong files are refused with a clear message', /does not look/.test(checkBackup({})) && /different version/.test(checkBackup({ version: 2, tables: { orders: [] } })) && /no orders/.test(checkBackup({ version: 1, tables: {} })));
const info = backupInfo(backup);
check('backup info shows when it was taken and the first/last order day', info.orders === 7 && info.firstDay === '2026-11-10' && info.lastDay === '2026-11-15' && info.takenAt === '2026-11-16T09:00:00+00:00', JSON.stringify(info));

// ---- the 15th (day)
const d = buildReport(backup, { period: 'day', date: '2026-11-15' });
const s = d.summary;
check('day: orders received counts everything placed that day (incl. 00:30), not the 23:59 one before', s.received === 5 && d.orders.length === 5 && d.orders.every((o) => o.orderNumber !== 'HBT-261114-008'), JSON.stringify(s));
check('day: completed / cancelled / open', s.completed === 3 && s.cancelled === 1 && s.inProgress === 1, JSON.stringify(s));
check('day: pickup vs delivery', s.pickup === 1 && s.delivery === 4);
check('day: gross counts sales only (cancelled left out)', s.gross === 1100 + 500 + 1000 + 700, String(s.gross));
check('day: collected = verified transfer + COD cash taken', s.bankVerified === 500 && s.codCollected === 1800 && s.collected === 2300, JSON.stringify(s));
check('day: outstanding COD and discounts', s.outstandingCod === 1000 && s.discounts === 100 && s.codOrders === 3);
check('day: average order and delivery fees', s.averageOrder === 825 && s.deliveryFees === 300, JSON.stringify(s));
check('day: by status and by payment method', d.byStatus.Completed === 3 && d.byStatus.Cancelled === 1 && d.byPayment.find((p) => p.method === 'cod').orders === 3 && d.byPayment.find((p) => p.method === 'cod').amount === 2800);
check('day: best sellers ignore cancelled orders and sort by quantity', eq(d.bestSellers.map((b) => [b.title, b.qty]), [['Nutella Naan', 3], ['Family Deal', 1]]), JSON.stringify(d.bestSellers));
check('day: categories (deals fall under Other)', eq(d.categories.map((c) => [c.title, c.revenue]), [['Naans', 1500], ['Other', 900]]), JSON.stringify(d.categories));
check('day: feedback only from that day\'s orders', d.feedback.count === 2 && d.feedback.average === 4 && eq(d.feedback.distribution, [0, 0, 1, 0, 1]) && d.feedback.comments.length === 1 && d.feedback.comments[0].orderNumber === 'HBT-261115-001');
check('day: busiest hours are in shop time', d.busiestHours[0].orders >= 1 && /^\d\d:00$/.test(d.busiestHours[0].hour), JSON.stringify(d.busiestHours));

// ---- week / month
const w = buildReport(backup, { period: 'week', date: '2026-11-12' }); // Mon 9 - Sun 15
check('week: covers Mon 9 to Sun 15 Nov, 7 daily rows', w.byDay.length === 7 && w.byDay[0].day === '2026-11-09' && w.summary.received === 7, `${w.byDay.length} ${w.summary.received}`);
check('week: daily rows add up to the totals', w.byDay.reduce((a, r) => a + r.sales, 0) === w.summary.gross && w.byDay.reduce((a, r) => a + r.orders, 0) === w.summary.received);
check('week: the 14th and the 10th show up on their own days', w.byDay.find((r) => r.day === '2026-11-14').orders === 1 && w.byDay.find((r) => r.day === '2026-11-10').orders === 1 && w.byDay.find((r) => r.day === '2026-11-12').orders === 0);
const m = buildReport(backup, { period: 'month', date: '2026-11-01' });
check('month: all 30 days, everything in the file', m.byDay.length === 30 && m.summary.received === 7 && m.summary.pendingPayments === 400, JSON.stringify(m.summary));
check('an empty day gives zeros, not an error', buildReport(backup, { period: 'day', date: '2026-01-01' }).summary.received === 0 && buildReport(backup, { period: 'day', date: '2026-01-01' }).summary.averageOrder === 0);
check('a bad date gives no report', buildReport(backup, { period: 'day', date: 'x' }) === null);
check('a backup from before feedback existed still works', buildReport({ version: 1, tables: { orders: backup.tables.orders } }, { period: 'day', date: '2026-11-15' }).feedback.count === 0);

// ---- CSV
const nasty = { version: 1, tables: { orders: [O('x1', 'HBT-1', '2026-11-15T07:00:00+00:00', { customer_name: '=HYPERLINK("http://evil")' }), O('x2', 'HBT-2', '2026-11-15T08:00:00+00:00', { customer_name: 'Smith, "Bob"' })] } };
const csv = ordersToCsv(buildReport(nasty, { period: 'day', date: '2026-11-15' }));
const lines = csv.split('\r\n');
check('CSV has a header and one line per order, no phone or email columns', lines.length === 3 && lines[0].startsWith('Order #,') && !/phone|email|address/i.test(lines[0]));
check('CSV neutralises spreadsheet formulas and escapes commas/quotes', csv.includes(`"'=HYPERLINK(""http://evil"")"`) && csv.includes('"Smith, ""Bob"""'), csv);
check('CSV shows Pakistan time', lines[2].includes('2026-11-15 12:00') || lines[1].includes('2026-11-15 12:00'), csv);

// ---- storage meter maths
check('usage percent against a limit in MB', usagePercent(400 * 1048576, 500) === 80 && usagePercent(null, 500) === null && usagePercent(5, 0) === null);
check('levels: below warning is 0, warning, urgent at 90, critical at 95', levelFor(79.9, 80) === 0 && levelFor(80, 80) === 1 && levelFor(90, 80) === 2 && levelFor(95, 80) === 3 && levelFor(100, 80) === 3);
check('a high warning percentage never alerts earlier than chosen', levelFor(92, 95) === 0 && levelFor(95, 95) === 3 && levelFor(60, 50) === 1 && levelFor(null, 80) === 0);
check('byte formatting', formatBytes(512) === '512 B' && formatBytes(2048) === '2.0 KB' && formatBytes(5 * 1048576) === '5.0 MB' && formatBytes(1536 * 1048576) === '1.50 GB');
const usage = { level: 2, database: { bytes: 460 * 1048576, limitMb: 500, percent: 92, level: 2 }, files: { totalBytes: 100 * 1048576, limitMb: 1024, percent: 9.8, level: 0 } };
const mail = buildAlertEmail({ usage, link: 'https://shop.example/admin/storage' });
check('warning email names the percentage, both meters, the steps and the link', /92%/.test(mail.subject) && mail.text.includes('460 MB of 500 MB') && mail.text.includes('Storage & Backups') && mail.text.includes('https://shop.example/admin/storage') && mail.html.includes('<a href="https://shop.example/admin/storage">'), mail.subject);
check('critical email is marked urgent', /^URGENT/.test(buildAlertEmail({ usage: { ...usage, level: 3 } }).subject));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
