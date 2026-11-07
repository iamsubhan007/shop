import { NextResponse } from 'next/server';
import { and, asc, eq, isNull } from 'drizzle-orm';
import { db, schema } from '@/db';
import { productOrderable } from '@/lib/server/orders';

const { categories, products, deals } = schema;

export const dynamic = 'force-dynamic';

export async function GET() {
  const now = new Date();
  const cats = await db.select().from(categories).where(eq(categories.isActive, true)).orderBy(asc(categories.sortOrder));
  const rows = await db
    .select({ p: products, catActive: categories.isActive, catPaused: categories.isPaused, catName: categories.name, catSlug: categories.slug })
    .from(products)
    .leftJoin(categories, eq(categories.id, products.categoryId))
    .where(isNull(products.deletedAt))
    .orderBy(asc(products.sortOrder), asc(products.name));
  const dealRows = await db.select().from(deals).where(and(eq(deals.isActive, true), isNull(deals.deletedAt)));

  const items = rows
    .filter((r) => r.catActive !== false)
    .map(({ p, catPaused, catName, catSlug }) => {
      const orderable = productOrderable({ ...p, categoryPaused: catPaused }, now);
      const lowStock = p.trackStock && p.stockQty > 0 && p.stockQty <= p.lowStockThreshold;
      return {
        id: p.id,
        name: p.name,
        description: p.description,
        price: Number(p.price),
        compareAtPrice: p.compareAtPrice ? Number(p.compareAtPrice) : null,
        imageUrl: p.imageUrl,
        additionalImages: p.additionalImages || [],
        categoryId: p.categoryId,
        categoryName: catName,
        categorySlug: catSlug,
        genre: p.genre,
        isFeatured: !!p.isFeatured,
        available: orderable && (!p.trackStock || p.stockQty > 0),
        soldOut: !!p.isSoldOut || (p.trackStock && p.stockQty <= 0),
        lowStock,
      };
    });

  const liveDeals = dealRows
    .filter((d) => (!d.startsAt || d.startsAt <= now) && (!d.endsAt || d.endsAt >= now))
    .map((d) => ({
      id: d.id,
      title: d.title,
      description: d.description,
      price: Number(d.price),
      originalPrice: d.originalPrice ? Number(d.originalPrice) : null,
      imageUrl: d.imageUrl,
      items: d.items || [],
      badge: d.badge,
      isFeatured: d.isFeatured,
    }));

  return NextResponse.json({
    categories: cats.map((c) => ({ id: c.id, name: c.name, slug: c.slug, paused: c.isPaused })),
    products: items,
    deals: liveDeals,
  });
}
