import { getInitialSiteData } from '@/lib/server/siteData';
import { siteUrl } from '@/lib/seo';
import { buildLlmsText } from '@/lib/seoContent';

export const revalidate = 300;

// llms.txt plus the complete menu with prices and descriptions, and the FAQ.
export async function GET() {
  const body = buildLlmsText(await getInitialSiteData(), siteUrl(), { full: true });
  return new Response(body, { headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=300, s-maxage=300, stale-while-revalidate=3600' } });
}
