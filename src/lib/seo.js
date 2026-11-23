// One place for the facts search engines, AI assistants and customers all read about the shop, so the page copy, the
// structured data, llms.txt and the sitemap can never disagree. Hours, delivery rules, payment methods and prices are NOT
// here: they come from the live settings and menu (see seoContent.js), so changing them in the admin updates the SEO too.

export const SITE_NAME = 'Haq Bahu Naan Shop';

// The live address, used only if no environment variable gives one (see siteUrl).
const LIVE_URL = 'https://hbt-ns.vercel.app';

/** The public address of the site (used for canonical links, the sitemap and structured data). */
export function siteUrl() {
  // 1) An address set by hand (use this when the shop gets its own domain, e.g. https://www.example.pk).
  const explicit = process.env.NEXT_PUBLIC_SITE_URL;
  // (A localhost value, copied over from a development .env file, is ignored in production: it must never become canonical.)
  if (explicit && !(process.env.NODE_ENV === 'production' && /localhost|127\.0\.0\.1/.test(explicit))) return explicit.replace(/\/+$/, '');
  // 2) Vercel's production domain. (Not VERCEL_URL: that is the address of one single deployment, which changes every
  //    time and is not public, so it must never become the canonical address.)
  const prod = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (prod) return `https://${prod.replace(/^https?:\/\//, '').replace(/\/+$/, '')}`;
  // 3) Last resort for a production build that has neither: the live domain. Local development uses localhost.
  return process.env.NODE_ENV === 'production' ? LIVE_URL : 'http://localhost:3000';
}

// The shop's contact details, as printed in the site footer.
export const BUSINESS = {
  name: SITE_NAME,
  alternateNames: ['Haq Bahu Tandoor', 'Haq Bahu Naan'],
  streetAddress: '16-A, N Block, Model Town Extension',
  locality: 'Lahore',
  region: 'Punjab',
  country: 'PK',
  area: 'Model Town, Lahore',
  phones: ['03094130285', '03334381858'],
  mapsUrl: 'https://maps.app.goo.gl/5XFAv67ZhpQVPdje6',
};

/** 03094130285 -> +923094130285 */
export const intlPhone = (p) => `+92${String(p).replace(/\D/g, '').replace(/^0/, '')}`;

export const TITLE = 'Best Qeema Naan & Pizza Naan in Lahore | Haq Bahu Naan Shop';
export const DESCRIPTION = 'Haq Bahu Naan Shop, Model Town Lahore: fresh qeema naan, pizza naan, cheese naan, parathas & combo deals. Order online for delivery or pickup.';

// What people type when they look for this kind of shop. Used in the keywords tag, the structured data and llms.txt, and
// worked into the headings and answers on the page (a keywords list alone does not rank; the words must be on the page).
export const KEYWORDS = [
  'best qeema naan Lahore', 'qeema naan', 'beef qeema naan', 'chicken qeema naan', 'mutton qeema naan',
  'pizza naan', 'tandoori pizza naan', 'cheese naan', 'stuffed naan Lahore', 'naan shop Model Town Lahore',
  'top naan shop Lahore', 'naan near me', 'fresh tandoori naan', 'tandoori paratha', 'rogni naan', 'aloo naan', 'besaan naan',
  'online naan order Lahore', 'naan home delivery Lahore', 'Model Town food delivery', 'naan deals Lahore', 'combo deals Lahore',
  'Haq Bahu Naan Shop', 'Haq Bahu Tandoor',
];

export const OG_IMAGE = '/og-image.jpg';
