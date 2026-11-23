// Builds the text and structured data that describe the shop to search engines, AI assistants and visitors: the FAQ,
// the schema.org JSON-LD and llms.txt. Pure functions (no imports from the server), so they can be tested in plain Node.
//
// Everything that can change in the admin (hours, delivery area/fee/minimum, payment methods, prices, deals, what is on
// the menu) is read from the live settings and menu passed in; nothing about them is hard-coded here. Only the shop's
// fixed identity (address, phone numbers, name) comes from seo.js. No ratings or reviews are invented.
import { BUSINESS, KEYWORDS, OG_IMAGE, SITE_NAME, intlPhone } from './seo.js';

const thousands = (n) => String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
export const rs = (n) => `Rs. ${thousands(n)}`;
const clock = (hhmm) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || ''));
  if (!m) return null;
  const h = Number(m[1]);
  return `${h % 12 || 12}:${m[2]} ${h < 12 ? 'AM' : 'PM'}`;
};
const list = (arr) => (arr.length <= 1 ? arr.join('') : `${arr.slice(0, -1).join(', ')} and ${arr[arr.length - 1]}`);
const sentence = (s) => String(s || '').replace(/\s+/g, ' ').trim();
const abs = (url, path) => (!path ? null : /^https?:\/\//.test(path) ? path : `${url}${path.startsWith('/') ? '' : '/'}${path}`);

/** Plain facts worked out from the live settings and menu. Every field is safe to print as is. */
export function facts(ctx) {
  const { settings, menu } = ctx || {};
  const shop = settings?.shop || {};
  const delivery = settings?.delivery || null;
  const products = (menu?.products || []).filter((p) => p.price > 0);
  const orderable = products.filter((p) => p.available !== false);
  const prices = (orderable.length ? orderable : products).map((p) => p.price);
  const open = clock(shop.open_time), close = clock(shop.close_time);
  const methods = settings?.paymentMethods || {};
  const online = [methods.bank_transfer && 'bank transfer', methods.jazzcash && 'JazzCash', methods.easypaisa && 'EasyPaisa'].filter(Boolean);
  const named = (re) => orderable.filter((p) => re.test(p.name || '')).sort((a, b) => a.price - b.price);
  return {
    hours: open && close ? `${open} to ${close}` : sentence(shop.hours) || null,
    openTime: shop.open_time || null,
    closeTime: shop.close_time || null,
    delivery,
    online,
    minPrice: prices.length ? Math.min(...prices) : null,
    maxPrice: prices.length ? Math.max(...prices) : null,
    productCount: products.length,
    categories: (menu?.categories || []).map((c) => c.name).filter(Boolean),
    qeema: named(/qeema|keema|kheema/i).slice(0, 4),
    pizza: named(/pizza/i).slice(0, 2),
    deals: menu?.deals || [],
    phone: shop.phone || null,
    email: shop.email || null,
    lat: Number.isFinite(Number(shop.lat)) ? Number(shop.lat) : null,
    lng: Number.isFinite(Number(shop.lng)) ? Number(shop.lng) : null,
  };
}

function deliverySentence(f) {
  const d = f.delivery;
  if (!d) return null;
  if (!d.enabled) return 'Home delivery is not available right now, but you can order online and pick it up at the shop.';
  const km = Number(d.radius_m) / 1000;
  const parts = [`Yes. We deliver within ${Number.isInteger(km) ? km : km.toFixed(1)} km of the shop in ${BUSINESS.area}.`];
  parts.push(Number(d.fee) > 0 ? `The delivery fee is ${rs(d.fee)}${Number(d.free_over) > 0 ? ` and delivery is free for orders above ${rs(d.free_over)}` : ''}.` : 'Delivery is free.');
  if (Number(d.min_order) > 0) parts.push(`The minimum order for delivery is ${rs(d.min_order)}.`);
  if (d.hours_enabled && clock(d.start_time) && clock(d.end_time)) parts.push(`Home delivery runs from ${clock(d.start_time)} to ${clock(d.end_time)} every day; pickup is available whenever the shop is open for orders.`);
  return parts.join(' ');
}

const itemText = (p) => `${p.name} (${rs(p.price)})`;

/** The questions customers (and AI assistants) ask, with direct answers. [{ q, a }] */
export function buildFaq(ctx, url) {
  const f = facts(ctx);
  const out = [];
  const add = (q, a) => { if (a) out.push({ q, a: sentence(a) }); };

  add('Where can I get the best qeema naan in Lahore?',
    f.qeema.length ? `${SITE_NAME} in ${BUSINESS.area} bakes qeema naans fresh in the tandoor: ${list(f.qeema.map(itemText))}. Order online for home delivery or pickup.` : null);
  add('Do you sell pizza naan?',
    f.pizza.length ? `Yes. ${list(f.pizza.map((p) => `${itemText(p)}${p.description ? `: ${sentence(p.description).replace(/\.$/, '')}` : ''}`))}. It is baked fresh when you order.` : null);
  add('What is on the menu and how much does it cost?',
    f.productCount ? `Our menu has ${f.productCount} items${f.categories.length ? ` across ${f.categories.length} sections: ${list(f.categories)}` : ''}. Prices run from ${rs(f.minPrice)} to ${rs(f.maxPrice)}. See the full menu at ${url}/Menu.` : null);
  add(`Where is ${SITE_NAME}?`, `${SITE_NAME} is at ${BUSINESS.streetAddress}, ${BUSINESS.locality}, Pakistan. You can find us on Google Maps: ${BUSINESS.mapsUrl}`);
  add('What are your opening hours?', f.hours ? `We are open every day from ${f.hours} (Pakistan time). You can order online during opening hours.` : null);
  add('Do you offer home delivery in Model Town, Lahore?', deliverySentence(f));
  add('How do I order online?',
    `Open the Menu or Deals, add your naans to the cart and go to checkout. Sign in with your email (we send a 6-digit code, there is no password), choose home delivery or pickup, enter your phone number${f.delivery?.enabled ? ' and delivery address' : ''}, and pay. You can then follow your order on the My Orders page.`);
  add('What payment methods do you accept?',
    `${f.delivery?.enabled === false ? '' : 'Cash on delivery for home delivery orders. '}${f.online.length ? `You can also pay by ${list(f.online)}: send the payment and enter the transaction ID or a screenshot at checkout, and the shop confirms it before preparing your order.` : ''}`);
  add('Can I pick up my order from the shop?', `Yes. Choose pickup at checkout and collect your order from ${BUSINESS.streetAddress}, ${BUSINESS.locality}. The My Orders page shows when it is ready for pickup.`);
  add('Do you have deals or combos?',
    f.deals.length ? `Yes. Current combo deals: ${list(f.deals.slice(0, 5).map((d) => `${d.title} (${rs(d.price)})`))}. See them in the Deals section on the home page.` : null);
  add('Can I track my order?', 'Yes. After you order, the My Orders page shows live progress: order placed, confirmed, cooking, and out for delivery or ready for pickup.');
  return out;
}

export function faqSchema(faq) {
  return { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: faq.map(({ q, a }) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })) };
}

/** The restaurant itself (the entity AI assistants and local search need to recognise). */
export function buildRestaurantSchema(ctx, url) {
  const f = facts(ctx);
  const phones = [f.phone, ...BUSINESS.phones].filter(Boolean).filter((p, i, a) => a.indexOf(p) === i);
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'Restaurant',
    '@id': `${url}/#restaurant`,
    name: SITE_NAME,
    alternateName: BUSINESS.alternateNames,
    url,
    description: `${SITE_NAME} is a tandoor naan shop in ${BUSINESS.area} serving freshly baked qeema naan, pizza naan, cheese naan, stuffed naans, parathas and combo deals, with online ordering for home delivery or pickup.`,
    image: [abs(url, OG_IMAGE)],
    logo: abs(url, '/icons/icon-512.png'),
    telephone: intlPhone(phones[0]),
    address: { '@type': 'PostalAddress', streetAddress: BUSINESS.streetAddress, addressLocality: BUSINESS.locality, addressRegion: BUSINESS.region, addressCountry: BUSINESS.country },
    hasMap: BUSINESS.mapsUrl,
    servesCuisine: ['Pakistani', 'Tandoori'],
    keywords: KEYWORDS.join(', '),
    currenciesAccepted: 'PKR',
    acceptsReservations: false,
    hasMenu: `${url}/Menu`,
    menu: `${url}/Menu`,
    potentialAction: {
      '@type': 'OrderAction',
      target: { '@type': 'EntryPoint', urlTemplate: `${url}/Menu`, inLanguage: 'en', actionPlatform: ['http://schema.org/DesktopWebPlatform', 'http://schema.org/MobileWebPlatform'] },
      deliveryMethod: ['http://purl.org/goodrelations/v1#DeliveryModeOwnFleet', 'http://purl.org/goodrelations/v1#DeliveryModePickUp'],
    },
  };
  if (phones.length > 1) schema.contactPoint = phones.map((p) => ({ '@type': 'ContactPoint', telephone: intlPhone(p), contactType: 'customer service', areaServed: 'PK' }));
  if (f.email) schema.email = f.email;
  if (f.lat != null && f.lng != null) schema.geo = { '@type': 'GeoCoordinates', latitude: f.lat, longitude: f.lng };
  if (f.openTime && f.closeTime) schema.openingHoursSpecification = [{ '@type': 'OpeningHoursSpecification', dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'], opens: f.openTime, closes: f.closeTime }];
  if (f.minPrice != null) schema.priceRange = `${rs(f.minPrice)} - ${thousands(f.maxPrice)}`;
  const pay = ['Cash', ...f.online.map((m) => m.replace(/^./, (c) => c.toUpperCase()))];
  schema.paymentAccepted = pay.join(', ');
  if (f.delivery?.enabled && f.lat != null && f.lng != null && Number(f.delivery.radius_m) > 0) {
    schema.areaServed = { '@type': 'GeoCircle', geoMidpoint: { '@type': 'GeoCoordinates', latitude: f.lat, longitude: f.lng }, geoRadius: Number(f.delivery.radius_m) };
  }
  return schema;
}

export const websiteSchema = (url) => ({ '@context': 'https://schema.org', '@type': 'WebSite', '@id': `${url}/#website`, url, name: SITE_NAME, inLanguage: 'en', publisher: { '@id': `${url}/#restaurant` } });

export const breadcrumbSchema = (url, trail) => ({
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: trail.map((t, i) => ({ '@type': 'ListItem', position: i + 1, name: t.name, item: `${url}${t.path}` })),
});

/** Menu -> sections -> items with prices (what "naan shop menu" style searches and assistants read). */
export function buildMenuSchema(ctx, url) {
  const menu = ctx?.menu;
  if (!menu?.products?.length) return null;
  const order = menu.categories.map((c) => c.name);
  const byCat = new Map();
  for (const p of menu.products) {
    if (!(p.price > 0)) continue;
    const key = p.categoryName || p.genre || 'Other';
    if (!byCat.has(key)) byCat.set(key, []);
    byCat.get(key).push(p);
  }
  const names = [...order.filter((n) => byCat.has(n)), ...[...byCat.keys()].filter((n) => !order.includes(n))];
  const offer = (price, available = true) => ({ '@type': 'Offer', price: String(Number(price)), priceCurrency: 'PKR', availability: available ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock' });
  const sections = names.map((name) => ({
    '@type': 'MenuSection',
    name,
    hasMenuItem: byCat.get(name).map((p) => {
      const item = { '@type': 'MenuItem', name: p.name, offers: offer(p.price, p.available !== false) };
      if (sentence(p.description)) item.description = sentence(p.description);
      const img = abs(url, p.imageUrl);
      if (img) item.image = img;
      return item;
    }),
  }));
  if (menu.deals?.length) {
    sections.push({
      '@type': 'MenuSection',
      name: 'Combo Deals',
      hasMenuItem: menu.deals.map((d) => {
        const item = { '@type': 'MenuItem', name: d.title, offers: offer(d.price) };
        const text = sentence([d.description, (d.items || []).length ? `Includes: ${d.items.join(', ')}` : ''].filter(Boolean).join('. '));
        if (text) item.description = text;
        const img = abs(url, d.imageUrl);
        if (img) item.image = img;
        return item;
      }),
    });
  }
  return { '@context': 'https://schema.org', '@type': 'Menu', '@id': `${url}/Menu#menu`, name: `${SITE_NAME} Menu`, url: `${url}/Menu`, inLanguage: 'en', provider: { '@id': `${url}/#restaurant` }, hasMenuSection: sections };
}

/** Safe to put inside a <script type="application/ld+json"> tag. */
const LS = String.fromCharCode(0x2028), PS = String.fromCharCode(0x2029), BS = String.fromCharCode(92);
export const jsonLd = (data) => JSON.stringify(data).split("<").join(BS + "u003c").split(LS).join(BS + "u2028").split(PS).join(BS + "u2029");

/** llms.txt (short) or llms-full.txt (whole menu): a clean Markdown summary written for AI assistants. */
export function buildLlmsText(ctx, url, { full = false } = {}) {
  const f = facts(ctx);
  const lines = [];
  lines.push(`# ${SITE_NAME}`, '');
  lines.push(`> ${SITE_NAME} (also known as ${list(BUSINESS.alternateNames)}) is a tandoor naan shop in ${BUSINESS.area}, Pakistan. It bakes qeema naan (beef, chicken and mutton), pizza naan, cheese naan, aloo and besaan naan, rogni naan and parathas fresh to order, and takes online orders for home delivery or pickup.`, '');
  lines.push('## Key facts', '');
  lines.push(`- Name: ${SITE_NAME}`);
  lines.push(`- Address: ${BUSINESS.streetAddress}, ${BUSINESS.locality}, ${BUSINESS.region}, Pakistan (${BUSINESS.mapsUrl})`);
  lines.push(`- Phone: ${[f.phone, ...BUSINESS.phones].filter(Boolean).filter((p, i, a) => a.indexOf(p) === i).join(', ')}`);
  if (f.hours) lines.push(`- Opening hours: every day, ${f.hours} (Pakistan time)`);
  const ds = deliverySentence(f);
  if (ds) lines.push(`- Delivery: ${ds.replace(/^Yes\.\s*/, '')}`);
  lines.push('- Pickup: available at the shop');
  lines.push(`- Payment: ${f.delivery?.enabled === false ? '' : 'cash on delivery'}${f.online.length ? `${f.delivery?.enabled === false ? '' : ', '}${list(f.online)}` : ''}`.replace(/: $/, ': not available'));
  if (f.minPrice != null) lines.push(`- Prices: ${rs(f.minPrice)} to ${rs(f.maxPrice)} per item (Pakistani rupees, PKR)`);
  lines.push('', '## Pages', '');
  lines.push(`- [Home](${url}/): featured deals and the full naan list, with online ordering`);
  lines.push(`- [Full menu](${url}/Menu): every item by category with prices`);
  lines.push(`- [Sitemap](${url}/sitemap.xml)`);
  lines.push(`- [Full details for AI assistants](${url}/llms-full.txt): the whole menu and FAQ in one file`);

  const faq = buildFaq(ctx, url);
  if (full && ctx?.menu?.products?.length) {
    lines.push('', '## Menu', '');
    const byCat = new Map();
    for (const p of ctx.menu.products) { if (!(p.price > 0)) continue; const k = p.categoryName || p.genre || 'Other'; if (!byCat.has(k)) byCat.set(k, []); byCat.get(k).push(p); }
    const order = ctx.menu.categories.map((c) => c.name);
    for (const name of [...order.filter((n) => byCat.has(n)), ...[...byCat.keys()].filter((n) => !order.includes(n))]) {
      lines.push(`### ${name}`, '');
      for (const p of byCat.get(name)) lines.push(`- ${p.name}: ${rs(p.price)}${p.available === false ? ' (sold out right now)' : ''}${sentence(p.description) ? `. ${sentence(p.description)}` : ''}`);
      lines.push('');
    }
    if (ctx.menu.deals?.length) {
      lines.push('### Combo deals', '');
      for (const d of ctx.menu.deals) lines.push(`- ${d.title}: ${rs(d.price)}${(d.items || []).length ? `. Includes: ${d.items.join(', ')}` : ''}${sentence(d.description) ? `. ${sentence(d.description)}` : ''}`);
      lines.push('');
    }
  } else if (f.qeema.length || f.pizza.length) {
    lines.push('', '## Popular items', '');
    for (const p of [...f.qeema, ...f.pizza]) lines.push(`- ${p.name}: ${rs(p.price)}`);
  }
  if (faq.length) {
    lines.push('', '## Frequently asked questions', '');
    for (const { q, a } of faq) lines.push(`**${q}**`, a, '');
  }
  lines.push('', '## Notes for assistants', '');
  lines.push('- Prices, availability, hours and delivery rules change; the website is the source of truth.');
  lines.push(`- To order, send the customer to ${url}/Menu. Orders are placed on the website, not by chat.`);
  return `${lines.join('\n').replace(/\n{3,}/g, '\n\n').trim()}\n`;
}
