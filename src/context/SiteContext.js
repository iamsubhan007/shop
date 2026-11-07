'use client';

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';

const SiteContext = createContext(null);

// Map API shape to the field names the existing card components already use.
const mapProduct = (p) => ({
  ...p,
  image_url: p.imageUrl,
  additional_images: p.additionalImages,
  category_name: p.categoryName,
  is_available: p.available,
  is_featured: p.isFeatured,
  sold_out: p.soldOut,
  compare_at_price: p.compareAtPrice,
});
const mapDeal = (d) => ({ ...d, image_url: d.imageUrl, original_price: d.originalPrice, is_deal: true });

export function SiteProvider({ children }) {
  const [menu, setMenu] = useState({ categories: [], products: [], deals: [] });
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const [m, s] = await Promise.all([fetch('/api/menu', { cache: 'no-store' }), fetch('/api/settings', { cache: 'no-store' })]);
      if (!m.ok || !s.ok) throw new Error('load failed');
      const mj = await m.json();
      setMenu({ categories: mj.categories, products: mj.products.map(mapProduct), deals: mj.deals.map(mapDeal) });
      setSettings(await s.json());
      setError(false);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return <SiteContext.Provider value={{ ...menu, settings, loading, error, refresh }}>{children}</SiteContext.Provider>;
}

export function useSite() {
  const ctx = useContext(SiteContext);
  if (!ctx) throw new Error('useSite must be used within SiteProvider');
  return ctx;
}
