import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireStaff } from '@/lib/server/guard';
import { getSettings, setSetting } from '@/lib/server/settings';
import { audit } from '@/lib/server/audit';

export const dynamic = 'force-dynamic';

const str = (n) => z.string().trim().max(n).default('');
const num = z.coerce.number().min(0).max(1e7);

const validators = {
  shop: z.object({
    name: str(80), alt_name: str(80).optional(), address: str(300), lat: z.coerce.number().min(-90).max(90), lng: z.coerce.number().min(-180).max(180),
    maps_url: str(300), phone: str(30), whatsapp: z.string().trim().regex(/^\d{10,15}$/, 'WhatsApp number must be digits with country code, e.g. 923001234567'),
    email: str(120), hours: str(80),
    open_time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Opening time must be HH:MM').default('08:00'),
    close_time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Closing time must be HH:MM').default('23:00'), social: z.object({ facebook: str(200), instagram: str(200) }).optional(),
  }),
  delivery: z.object({ enabled: z.boolean(), radius_m: z.coerce.number().min(100).max(20000), fee: num, free_over: num, min_order: num }),
  pickup: z.object({ enabled: z.boolean() }),
  ordering: z.object({ open: z.boolean(), notice: str(300), reopen_at: z.string().datetime().nullable().optional() }),
  payment: z.object({
    bank: z.object({ enabled: z.boolean(), bank_name: str(80), account_title: str(80), account_number: str(40), iban: str(40) }),
    jazzcash: z.object({ enabled: z.boolean(), number: str(20), title: str(80) }),
    easypaisa: z.object({ enabled: z.boolean(), number: str(20), title: str(80) }),
    instructions: str(600),
  }),
  loyalty: z.object({ enabled: z.boolean(), points_per_100: num }),
  backup: z.object({ enabled: z.boolean(), every_hours: z.coerce.number().int().min(1).max(720), keep: z.coerce.number().int().min(1).max(365) }),
};

export async function GET(request) {
  const g = await requireStaff(request);
  if (g.error) return g.error;
  return NextResponse.json({ settings: await getSettings() });
}

export async function PUT(request) {
  const g = await requireStaff(request);
  if (g.error) return g.error;
  const body = await request.json().catch(() => null);
  const key = body?.key;
  if (!validators[key]) return NextResponse.json({ error: 'Unknown setting.' }, { status: 400 });
  // Payment accounts and shop location are sensitive: owner only.
  if (['payment', 'shop'].includes(key) && g.staff.role !== 'owner') return NextResponse.json({ error: 'Only the owner can change this.' }, { status: 403 });
  const parsed = validators[key].safeParse(body.value);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || 'Please check the values.' }, { status: 400 });
  const before = await setSetting(key, parsed.data);
  await audit(g.staff, `settings.${key}`, 'settings', key, key === 'payment' ? '(hidden)' : before, key === 'payment' ? '(updated)' : parsed.data);
  return NextResponse.json({ success: true });
}
