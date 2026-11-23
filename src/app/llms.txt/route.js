import { getInitialSiteData } from '@/lib/server/siteData';
import { siteUrl } from '@/lib/seo';
import { buildLlmsText } from '@/lib/seoContent';

export const revalidate = 300;

// A short plain-Markdown summary of the shop for AI assistants (the llms.txt convention): who we are, where, when, how to
// order, what is on the menu. Built from the live menu and settings. The whole menu is in /llms-full.txt.
export async function GET() {
  const body = buildLlmsText(await getInitialSiteData(), siteUrl());
  return new Response(body, { headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=300, s-maxage=300, stale-while-revalidate=3600' } });
}
