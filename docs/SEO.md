# SEO, AI search (AIO / GEO / AEO) and page speed

What is set up, where it lives, and what still has to be done outside the code.

## What the site sends to search engines and AI assistants
| What | Where | Notes |
|---|---|---|
| Title, description, keywords, social-share tags, `robots` rules | `src/app/layout.js`, `src/app/Menu/layout.js` | Title and description start with the words people search (qeema naan, pizza naan, Lahore). Facts and wording are in `src/lib/seo.js`. |
| Canonical address per page | `alternates.canonical` in `src/app/page.js` and `src/app/Menu/layout.js` | `/Menu` is the real menu URL; `/menu` redirects to it (`src/proxy.js`). |
| Social-share picture | `public/og-image.jpg` (1200x630) | Rebuild with `node scripts/make-og-image.mjs` after changing the banner. |
| Structured data (JSON-LD) | `src/components/HomeSeo.js`, `src/app/Menu/layout.js`, built in `src/lib/seoContent.js` | Restaurant (address, phones, map, hours, delivery area, payment, price range), WebSite, FAQPage, Menu with every item and price, BreadcrumbList. Hours, delivery rules, payments, prices and deals come from the live settings and menu. No ratings or reviews are invented. |
| Plain-text answers on the page | "About" text and FAQ at the bottom of the home page (`HomeSeo.js`) | Direct answers to the questions people ask ("best qeema naan in Lahore", "do you sell pizza naan", delivery, hours, payment). The FAQ schema repeats exactly the visible text. |
| `robots.txt`, `sitemap.xml` | `src/app/robots.js`, `src/app/sitemap.js` | Public pages open to all crawlers including AI search/answer bots; admin, API, checkout, orders, sign-in and chat are closed. To block one AI company, add its name to `BLOCKED` in `robots.js`. |
| `llms.txt`, `llms-full.txt` | `src/app/llms.txt/route.js`, `src/app/llms-full.txt/route.js` | Short and complete Markdown summaries (facts, menu with prices, FAQ) for AI assistants. Refreshed every 5 minutes. |
| Private pages | `layout.js` in `checkout`, `orders`, `auth`, `Chat`, `Chatbot-UI`, `admin/login` | `noindex`. |

## The site address
`siteUrl()` in `src/lib/seo.js` picks the address used in canonical links, the sitemap and structured data:
1. `NEXT_PUBLIC_SITE_URL` if set (set it to your own domain once you have one, e.g. `https://www.example.pk`; a localhost value is ignored in production),
2. otherwise Vercel's production domain (`VERCEL_PROJECT_PRODUCTION_URL`),
3. otherwise `https://hbt-ns.vercel.app`.

## Page speed changes
- The menu and settings are rendered into the first HTML (cached for a minute) instead of being fetched after the page loads. That removes the empty-page layout shift and lets the browser find the main pictures immediately.
- Pictures use `next/image`: right size per screen, AVIF/WebP, lazy loading; the banner and first deal load with priority. The banner went from 1.25 MB to about 10 KB on phones.
- The page CSS is inlined (no render-blocking file), the unused monospace font is gone, the product pop-up and cart drawer load only when opened, and the data refresh waits a few seconds so it does not compete with the pictures.
- Static pictures in `/public` are cached for a day.

## Still to do outside the code (these matter most for "near me" rankings)
- **Google Business Profile**: claim and complete it (same name, address and phone as the site), add photos, hours, the menu link, and ask happy customers for reviews. Do the same on Bing Places.
- **Search Console and Bing Webmaster Tools**: add the site, submit `/sitemap.xml`.
- **Real social profiles**: the footer Facebook/Instagram icons link to `#`. Put the real addresses there, then add them as `sameAs` in `buildRestaurantSchema` (`src/lib/seoContent.js`).
- **Backlinks and mentions**: Lahore food blogs, directories, local groups. Keep the shop name, address and phone identical everywhere.
- Only claim what is true (for example "organic" only if the ingredients really are organic). Superlatives such as "best" are marketing wording; search engines rank on relevance, reviews, links and speed.

## Tests
`node scripts/test-seo.mjs` checks the text, FAQ, structured data and llms.txt builders.
