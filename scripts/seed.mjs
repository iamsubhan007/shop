// Idempotent seed: loads the EXISTING HBT menu/deals (from initialData.js) and default settings
// into an empty database, and creates the first owner account. Never deletes or overwrites data.
import postgres from 'postgres';
import { initialCategories, initialProducts, initialDeals } from '../src/lib/data/initialData.js';

const raw = process.env.DATABASE_URL?.replace(/^["']|["']$/g, '');
if (!raw) throw new Error('DATABASE_URL missing');
const sql = postgres(raw, { prepare: false });

const defaults = {
  shop: {
    name: 'Haq Bahu Tandoor',
    alt_name: 'Haq Bahu Naan Shop',
    address: 'Plot 16, N Block, Zahoor Market, Model Town Extension, Lahore, Pakistan',
    lat: 31.4766319,
    lng: 74.3147178,
    maps_url: 'https://maps.app.goo.gl/m9GaLfGHuJpuW4VQ7',
    phone: '03094130285',
    whatsapp: '923094130285',
    email: '',
    hours: '11:00 AM - 12:00 AM',
    social: { facebook: '', instagram: '' },
  },
  delivery: { enabled: true, radius_m: 1000, fee: 100, free_over: 0, min_order: 0 },
  pickup: { enabled: true },
  ordering: { open: true, notice: '', reopen_at: null },
  // Payment accounts are NOT seeded: the owner enters real details in Admin > Settings.
  payment: {
    bank: { enabled: false, bank_name: '', account_title: '', account_number: '', iban: '' },
    jazzcash: { enabled: false, number: '', title: '' },
    easypaisa: { enabled: false, number: '', title: '' },
    instructions: '',
  },
  loyalty: { enabled: false, points_per_100: 0 },
};

async function main() {
  for (const [key, value] of Object.entries(defaults)) {
    await sql`insert into shop_settings (key, value) values (${key}, ${sql.json(value)}) on conflict (key) do nothing`;
  }

  const [{ count }] = await sql`select count(*)::int as count from products`;
  if (count === 0) {
    const catIds = {};
    for (const c of initialCategories) {
      const [row] = await sql`insert into categories (name, slug, sort_order) values (${c.name}, ${c.slug}, ${c.sort_order}) returning id`;
      catIds[c.id] = row.id;
    }
    let order = 0;
    for (const p of initialProducts) {
      await sql`insert into products (category_id, name, description, price, is_available, is_featured, image_url, additional_images, genre, sort_order)
        values (${catIds[p.category_id] ?? null}, ${p.name}, ${p.description ?? null}, ${p.price}, ${p.is_available !== false}, ${!!p.is_featured}, ${p.image_url ?? null}, ${p.additional_images ?? null}, ${p.genre ?? null}, ${order++})`;
    }
    for (const d of initialDeals) {
      await sql`insert into deals (title, description, price, image_url, items, badge, is_active)
        values (${d.title}, ${d.description ?? null}, ${d.price}, ${d.image_url ?? null}, ${d.items ?? null}, ${d.badge ?? null}, ${d.is_active !== false})`;
    }
    console.log(`Seeded ${initialCategories.length} categories, ${initialProducts.length} products, ${initialDeals.length} deals`);
  } else console.log('Menu already present; skipped');

  // The owner signs in with an emailed code (SMTP); no password is stored anywhere.
  const email = process.env.OWNER_EMAIL?.toLowerCase().trim();
  if (email) {
    await sql`insert into profiles (email, full_name, role) values (${email}, 'Owner', 'owner') on conflict (email) do update set role = 'owner', is_active = true`;
    console.log('Owner account ensured:', email);
  } else console.log('OWNER_EMAIL not set: no owner account created');
  await sql.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
