import 'server-only';
import { eq } from 'drizzle-orm';
import { db, schema } from '@/db';
import { withinWindow } from '@/lib/hours';

const { shopSettings } = schema;

/** Safe defaults only used if a key is missing from the database (never for payment accounts). */
export const SETTING_DEFAULTS = {
  shop: { name: 'Haq Bahu Tandoor', address: '', lat: 31.4766319, lng: 74.3147178, maps_url: '', phone: '', whatsapp: '', email: '', hours: '8:00 AM - 11:00 PM', open_time: '08:00', close_time: '23:00', social: {} },
  // hours_enabled: off by default, so existing shops keep delivering whenever they are open. When on, delivery orders
  // are only accepted between start_time and end_time (shop-local time, may pass midnight).
  delivery: { enabled: true, radius_m: 1000, fee: 0, free_over: 0, min_order: 0, hours_enabled: false, start_time: '11:00', end_time: '23:00' },
  pickup: { enabled: true },
  ordering: { open: true, notice: '', reopen_at: null },
  payment: {
    bank: { enabled: false },
    jazzcash: { enabled: false },
    easypaisa: { enabled: false },
    instructions: '',
  },
  loyalty: { enabled: false, points_per_100: 0 },
  backup: { enabled: true, every_hours: 24, keep: 14 },
  // Hosting-plan limits (Supabase free plan: 500 MB database, 1 GB files). Owner and admin are warned from warn_percent.
  storage: { db_limit_mb: 500, files_limit_mb: 1024, warn_percent: 80, alerts: true },
  // Bookkeeping for the storage warning emails, not a setting: the highest level warned about and when.
  storage_alert: { level: 0, sent_at: null },
};

export async function getSettings() {
  const rows = await db.select().from(shopSettings);
  const out = {};
  for (const [k, v] of Object.entries(SETTING_DEFAULTS)) out[k] = v;
  for (const r of rows) out[r.key] = { ...(SETTING_DEFAULTS[r.key] || {}), ...r.value };
  return out;
}

export async function setSetting(key, value) {
  if (!(key in SETTING_DEFAULTS)) throw new Error('Unknown setting');
  const [before] = await db.select().from(shopSettings).where(eq(shopSettings.key, key));
  await db
    .insert(shopSettings)
    .values({ key, value, updatedAt: new Date() })
    .onConflictDoUpdate({ target: shopSettings.key, set: { value, updatedAt: new Date() } });
  return before?.value ?? null;
}

/** Public subset: never includes payment account numbers unless asked via publicPayment(). */
export function publicSettings(s) {
  return {
    shop: s.shop,
    delivery: { enabled: s.delivery.enabled, radius_m: s.delivery.radius_m, fee: s.delivery.fee, free_over: s.delivery.free_over, min_order: s.delivery.min_order, hours_enabled: !!s.delivery.hours_enabled, start_time: s.delivery.start_time, end_time: s.delivery.end_time },
    pickup: s.pickup,
    ordering: s.ordering,
    loyalty: { enabled: s.loyalty.enabled },
    paymentMethods: {
      bank_transfer: !!s.payment.bank?.enabled,
      jazzcash: !!s.payment.jazzcash?.enabled,
      easypaisa: !!s.payment.easypaisa?.enabled,
    },
  };
}

/** Payment account details, shown only at checkout/payment step for enabled methods. */
export function paymentInstructions(s) {
  const p = s.payment;
  return {
    instructions: p.instructions || '',
    bank_transfer: p.bank?.enabled ? p.bank : null,
    jazzcash: p.jazzcash?.enabled ? p.jazzcash : null,
    easypaisa: p.easypaisa?.enabled ? p.easypaisa : null,
  };
}

export const SHOP_TZ = 'Asia/Karachi';

const toMinutes = (hhmm, fallback) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || ''));
  return m ? Number(m[1]) * 60 + Number(m[2]) : fallback;
};
export function formatClock(hhmm) {
  const mins = toMinutes(hhmm, 0);
  const h = Math.floor(mins / 60) % 24;
  return `${h % 12 || 12}:${String(mins % 60).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}

/** Are we inside the daily opening window (shop-local time)? Supports windows that pass midnight. */
export function withinOpeningHours(shop, now = new Date()) {
  const open = toMinutes(shop?.open_time, 8 * 60);
  const close = toMinutes(shop?.close_time, 23 * 60);
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: SHOP_TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now);
  const cur = Number(parts.find((p) => p.type === 'hour').value) * 60 + Number(parts.find((p) => p.type === 'minute').value);
  if (open === close) return true;
  return open < close ? cur >= open && cur < close : cur >= open || cur < close;
}

/**
 * Can customers choose home delivery right now? Off if the owner/admin switched delivery off, or if delivery hours
 * are set and it is outside them. Pickup is unaffected.
 */
export function deliveryState(s, now = new Date()) {
  const d = s.delivery || {};
  if (d.enabled === false) return { available: false, reason: 'disabled', notice: 'Home delivery is currently unavailable. Please choose pickup.' };
  if (d.hours_enabled && !withinWindow(d.start_time, d.end_time, now)) {
    return { available: false, reason: 'hours', notice: `Home delivery is available ${formatClock(d.start_time)} - ${formatClock(d.end_time)} daily. You can still order for pickup.` };
  }
  return { available: true, reason: null, notice: '' };
}

/** Is ordering open right now (daily hours + maintenance flag + optional reopening time)? */
export function orderingState(s, now = new Date()) {
  const o = s.ordering || {};
  let open = o.open !== false;
  if (!open && o.reopen_at && new Date(o.reopen_at).getTime() <= now.getTime()) open = true;
  if (!open) return { open, notice: o.notice || '', reopenAt: o.reopen_at || null, reason: 'maintenance' };
  if (!withinOpeningHours(s.shop, now)) {
    return {
      open: false,
      reason: 'hours',
      notice: `We are closed right now. Opening hours: ${formatClock(s.shop?.open_time)} - ${formatClock(s.shop?.close_time)} daily.`,
      reopenAt: null,
    };
  }
  return { open: true, notice: o.notice || '', reopenAt: null, reason: null };
}
