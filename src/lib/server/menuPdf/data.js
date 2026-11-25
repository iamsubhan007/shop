import 'server-only';
import { getMenuData } from '@/lib/server/menuData';
import { getSettings } from '@/lib/server/settings';
import { siteUrl } from '@/lib/seo';
import { normalizeMenu } from '@/lib/menuPdf/normalize';

/**
 * The printed menu's content, read from the database now (no cache). It starts from getMenuData, the same function that
 * feeds the website and the mobile app, so the three can never show different items or prices.
 */
export async function getPrintableMenu(now = new Date()) {
  const [menu, settings] = await Promise.all([getMenuData(), getSettings()]);
  return normalizeMenu({ menu, settings, website: siteUrl(), now });
}
