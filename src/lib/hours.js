// Pure daily-window helper (no server-only imports, so it can be unit-tested). Shop time is Asia/Karachi.
const SHOP_TZ = 'Asia/Karachi';

const toMinutes = (hhmm) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || ''));
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};

/**
 * Is "now" (shop-local time) inside the daily window [start, end)? A window that passes midnight (end < start) works;
 * start === end means all day. If either time is missing or malformed, never block: return true.
 */
export function withinWindow(start, end, now = new Date()) {
  const a = toMinutes(start);
  const b = toMinutes(end);
  if (a === null || b === null || a === b) return true;
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: SHOP_TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now);
  const cur = Number(parts.find((p) => p.type === 'hour').value) * 60 + Number(parts.find((p) => p.type === 'minute').value);
  return a < b ? cur >= a && cur < b : cur >= a || cur < b;
}
