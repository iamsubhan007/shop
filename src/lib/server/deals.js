import 'server-only';
import { inArray } from 'drizzle-orm';
import { z } from 'zod';
import { db, schema } from '@/db';

const { products } = schema;

export const dealSchema = z.object({
  title: z.string().trim().min(2).max(100),
  description: z.string().trim().max(500).nullish(),
  price: z.coerce.number().min(1).max(1000000),
  imageUrl: z.string().max(300).nullish(),
  badge: z.string().trim().max(30).nullish(),
  startsAt: z.string().datetime().nullish(),
  endsAt: z.string().datetime().nullish(),
  isActive: z.boolean().optional(),
  isFeatured: z.boolean().optional(),
  items: z.array(z.object({ productId: z.string().uuid(), quantity: z.coerce.number().int().min(1).max(50) })).max(20).optional(),
});

/** Computes the value of the included products and checks the deal price makes sense. */
export async function priceDeal(items, price) {
  if (!items?.length) return { originalPrice: null, labels: null };
  const rows = await db.select().from(products).where(inArray(products.id, items.map((i) => i.productId)));
  const map = new Map(rows.map((r) => [r.id, r]));
  let original = 0;
  const labels = [];
  for (const it of items) {
    const p = map.get(it.productId);
    if (!p || p.deletedAt) return { error: 'One of the included products no longer exists.' };
    original += Number(p.price) * it.quantity;
    labels.push(`${it.quantity}x ${p.name}`);
  }
  if (price > original) return { error: `Deal price (Rs. ${price}) is higher than buying the items separately (Rs. ${original}).` };
  return { originalPrice: original, labels };
}
