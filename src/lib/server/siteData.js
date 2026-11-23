import 'server-only';
import { unstable_cache } from 'next/cache';
import { getMenuData } from './menuData';
import { deliveryState, getSettings, orderingState, publicSettings } from './settings';

/** What /api/menu and /api/settings return together; this is the first paint of every customer page. */
async function load() {
  const [menu, s] = await Promise.all([getMenuData(), getSettings()]);
  return { menu, settings: { ...publicSettings(s), orderingState: orderingState(s), deliveryState: deliveryState(s) } };
}

// Cached for a minute so a burst of visitors does not become a burst of database queries. The browser still asks for
// fresh data right after it loads (SiteContext), so a price or availability change shows up within moments for people
// who are on the page; this only decides what the very first HTML contains.
const cached = unstable_cache(load, ['site-initial-data'], { revalidate: 60, tags: ['site-data'] });

/**
 * Menu + public settings for server rendering, or null if the database cannot be reached (the page then falls back to
 * loading everything in the browser, exactly as before). Never throws.
 */
export async function getInitialSiteData() {
  try {
    return await cached();
  } catch (e) {
    console.error('site data unavailable for server render:', e.message);
    return null;
  }
}
