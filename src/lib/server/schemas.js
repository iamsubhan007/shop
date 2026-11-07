import { z } from 'zod';

export const productSchema = z.object({
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(600).nullish(),
  price: z.coerce.number().min(0).max(1000000),
  compareAtPrice: z.coerce.number().min(0).max(1000000).nullish(),
  categoryId: z.string().uuid().nullish(),
  imageUrl: z.string().max(300).nullish(),
  isAvailable: z.boolean().optional(),
  isFeatured: z.boolean().optional(),
  isSoldOut: z.boolean().optional(),
  unavailableUntil: z.string().datetime().nullish(),
  trackStock: z.boolean().optional(),
  stockQty: z.coerce.number().int().min(0).max(100000).optional(),
  lowStockThreshold: z.coerce.number().int().min(0).max(100000).optional(),
  sortOrder: z.coerce.number().int().optional(),
});

