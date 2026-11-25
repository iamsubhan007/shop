// Turns the live menu (exactly what the website and the app receive from getMenuData) plus the shop settings into the
// content of the printed menu. Pure: no database, no browser. Nothing here invents or recalculates a price.
import { shopDateText, shopDay } from '../shopTime.js';

const text = (v) => String(v ?? '').replace(/\s+/g, ' ').trim();

/** An original price is only shown when it really is higher than the selling price. */
const original = (was, price) => (was != null && Number(was) > Number(price) ? Number(was) : null);

const item = (p) => ({
  name: text(p.name),
  description: text(p.description),
  price: Number(p.price),
  originalPrice: original(p.compareAtPrice, p.price),
});

export function normalizeMenu({ menu, settings, website, now = new Date() }) {
  const shop = settings?.shop || {};
  const name = text(shop.name) || text(shop.alt_name) || 'Menu';
  const altName = text(shop.alt_name);

  // Only what can be ordered now: hidden categories never reach getMenuData, and paused, sold-out, unavailable and
  // out-of-stock items arrive with available = false.
  const available = (menu?.products || []).filter((p) => p.available);
  const listed = (menu?.categories || []).filter((c) => !c.paused);
  const categories = listed
    .map((c) => ({ name: text(c.name), items: available.filter((p) => p.categoryId === c.id).map(item) }))
    .filter((c) => c.items.length);
  const known = new Set((menu?.categories || []).map((c) => c.id));
  const loose = available.filter((p) => !known.has(p.categoryId)).map(item);
  if (loose.length) categories.push({ name: 'More', items: loose });

  // getMenuData has already dropped inactive, deleted, not-yet-started and expired deals.
  const deals = [...(menu?.deals || [])]
    .sort((a, b) => Number(!!b.isFeatured) - Number(!!a.isFeatured))
    .map((d) => ({
      title: text(d.title),
      description: text(d.description),
      badge: text(d.badge),
      items: (d.items || []).map(text).filter(Boolean),
      price: Number(d.price),
      originalPrice: original(d.originalPrice, d.price),
    }));

  return {
    restaurant: {
      name,
      altName: altName && altName !== name ? altName : '',
      tagline: text(shop.tagline),
      phone: text(shop.phone),
      whatsapp: text(shop.whatsapp),
      address: text(shop.address),
      hours: text(shop.hours),
      website: text(website).replace(/^https?:\/\//, '').replace(/\/+$/, ''),
    },
    deals,
    categories,
    generatedOn: shopDateText(now),
    day: shopDay(now),
  };
}

/** 'Haq-Bahu-Tandoor-Menu-2026-11-25.pdf' */
export function menuFileName(restaurantName, day) {
  const slug = String(restaurantName || '').normalize('NFKD').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'Restaurant';
  return `${slug}-Menu-${day}.pdf`;
}
