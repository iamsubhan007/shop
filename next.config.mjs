import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Pin the workspace root to this project. Without it, Next/Turbopack walks up and picks the nearest
// parent folder that has a lockfile (e.g. a stray ~/pnpm-lock.yaml) and then crashes with
// "Access is denied (os error 5)" while scanning the user's home directory.
const root = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  turbopack: { root },
  outputFileTracingRoot: root,
  poweredByHeader: false,
  // Menu PDF printing: these run on the server as they are, and the packed Chromium is shipped with the two routes
  // that print.
  serverExternalPackages: ['@sparticuz/chromium', 'playwright-core'],
  // Never part of a server function: the mobile app, local data, and files that are served or used elsewhere. (The storage
  // code builds paths from the project folder, which otherwise makes the packager sweep all of it in.)
  outputFileTracingExcludes: {
    '/*': ['./mobile/**', './.git/**', './.localdb/**', './storage/**', './public/**', './docs/**', './scripts/**', './drizzle/**', './supabase/**'],
  },
  // The printing library reads some of its own files by a computed path (browsers.json as it loads), which the
  // packager cannot see. So the whole library goes with every route that loads it, or the route crashes on the host.
  outputFileTracingIncludes: {
    '/api/menu/pdf': ['./node_modules/playwright-core/**/*', './node_modules/@sparticuz/chromium/bin/**'],
    '/api/admin/menu-pdf': ['./node_modules/playwright-core/**/*'],
    '/api/admin/menu-pdf/**': ['./node_modules/playwright-core/**/*'],
    '/api/admin/menu-pdf/preview': ['./node_modules/@sparticuz/chromium/bin/**'],
  },
  // The old hand-made menu file's address now gives the current published menu, so old links never serve old prices.
  async redirects() {
    return [{ source: '/Haq-Bahu-MENU.pdf', destination: '/api/menu/pdf', permanent: false }];
  },
  // Pictures are resized to the screen and sent as AVIF/WebP (Next's image optimizer), and the result is cached for a week.
  images: {
    formats: ['image/avif', 'image/webp'],
    minimumCacheTTL: 60 * 60 * 24 * 7,
    deviceSizes: [360, 414, 640, 768, 1024, 1280, 1536, 1920],
    imageSizes: [56, 96, 128, 256, 384],
  },
  // The page's own CSS (a few KB) goes inside the HTML instead of a separate file the browser must fetch before it can paint.
  experimental: { inlineCss: true },
  async headers() {
    return [
      {
        // Pictures and videos in /public keep their name when edited, so cache them for a day (and let stale copies be
        // served while a fresh one loads). Next's own hashed files under /_next are cached for a year by Next itself.
        source: '/:all*(png|jpg|jpeg|gif|webp|avif|svg|ico|mp4|pdf)',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=86400, stale-while-revalidate=604800' }],
      },
      {
        // Pictures uploaded through the admin have a unique name each time, so they can be cached for a year.
        source: '/api/files/product/:name',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }],
      },
    ];
  },
};

export default nextConfig;
