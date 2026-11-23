import { getInitialSiteData } from '@/lib/server/siteData';
import { BUSINESS, OG_IMAGE, SITE_NAME, siteUrl } from '@/lib/seo';
import { breadcrumbSchema, buildMenuSchema, jsonLd } from '@/lib/seoContent';

const TITLE = 'Menu: Qeema Naan, Pizza Naan & Parathas';
const DESCRIPTION = `Full ${SITE_NAME} menu with prices: beef, chicken and mutton qeema naan, tandoori pizza naan, cheese, aloo and besaan naans, rogni naans, parathas, sides and combo deals. Order online in ${BUSINESS.area}.`;

export const metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: '/Menu' },
  openGraph: {
    type: 'website', siteName: SITE_NAME, locale: 'en_PK', url: '/Menu', title: `${TITLE} | ${SITE_NAME}`, description: DESCRIPTION,
    images: [{ url: OG_IMAGE, width: 1200, height: 630, alt: `${SITE_NAME} menu` }],
  },
  twitter: { card: 'summary_large_image', title: `${TITLE} | ${SITE_NAME}`, description: DESCRIPTION, images: [OG_IMAGE] },
};

// The menu page itself is interactive; this wrapper adds the menu as structured data (every item with its price) and the
// breadcrumb, built from the live menu.
export default async function MenuLayout({ children }) {
  const ctx = await getInitialSiteData();
  const url = siteUrl();
  const graph = [breadcrumbSchema(url, [{ name: 'Home', path: '/' }, { name: 'Menu', path: '/Menu' }]), buildMenuSchema(ctx, url)].filter(Boolean);
  return (
    <>
      {children}
      {graph.map((data, i) => (
        <script key={i} type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(data) }} />
      ))}
    </>
  );
}
