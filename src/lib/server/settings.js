import 'server-only';
import { eq } from 'drizzle-orm';
import { db, schema } from '@/db';

const { shopSettings } = schema;

/** Safe defaults only used if a key is missing from the database (never for payment accounts). */
export const SETTING_DEFAULTS = {
  shop: { name: 'Haq Bahu Tandoor', address: '', lat: 31.4766319, lng: 74.3147178, maps_url: '', phone: '', whatsapp: '', email: '', hours: '', social: {} },
  delivery: { enabled: true, radius_m: 1000, fee: 0, free_over: 0, min_order: 0 },
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
    delivery: { enabled: s.delivery.enabled, radius_m: s.delivery.radius_m, fee: s.delivery.fee, free_over: s.delivery.free_over, min_order: s.delivery.min_order },
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

/** Is ordering open right now (maintenance flag + optional reopening time)? */
export function orderingState(s) {
  const o = s.ordering || {};
  let open = o.open !== false;
  if (!open && o.reopen_at && new Date(o.reopen_at).getTime() <= Date.now()) open = true;
  return { open, notice: o.notice || '', reopenAt: o.reopen_at || null };
}
