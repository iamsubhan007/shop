// The shop keeps Pakistan time (UTC+5, no daylight saving). Admin date-and-time fields mean shop time, whatever the
// time zone of the computer they are typed on. Pure functions: safe in the browser, on the server and in tests.

const OFFSET_MS = 5 * 3600 * 1000;

/** A stored instant -> the value of an <input type="datetime-local"> in shop time ('' when empty or invalid). */
export function toShopInput(value) {
  if (!value) return '';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '' : new Date(d.getTime() + OFFSET_MS).toISOString().slice(0, 16);
}

/** The value of a datetime-local field (shop time) -> ISO instant, or null when empty. */
export function fromShopInput(value) {
  if (!value) return null;
  const d = new Date(`${value.slice(0, 16)}:00+05:00`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** '2026-11-25' in shop time. */
export const shopDay = (now = new Date()) => new Date(now.getTime() + OFFSET_MS).toISOString().slice(0, 10);

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** '25 November 2026' in shop time. */
export function shopDateText(now = new Date()) {
  const d = new Date(now.getTime() + OFFSET_MS);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}
