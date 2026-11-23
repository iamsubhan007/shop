import { siteUrl } from '@/lib/seo';

// Only the public pages. (Orders, checkout and the admin area are private and not listed.)
export default function sitemap() {
  const url = siteUrl();
  return [
    { url: `${url}/`, changeFrequency: 'daily', priority: 1 },
    { url: `${url}/Menu`, changeFrequency: 'daily', priority: 0.9 },
  ];
}
