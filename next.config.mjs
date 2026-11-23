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
