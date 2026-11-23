// Builds public/og-image.jpg (1200x630), the picture shown when the site is shared on WhatsApp, Facebook, X, LinkedIn, etc.
// Uses the banner photo plus the shop name and tagline. Usage: node scripts/make-og-image.mjs
import sharp from 'sharp';

const W = 1200, H = 630;
const banner = await sharp('public/bannerHBT1.png').resize({ width: W, height: 380, fit: 'cover' }).toBuffer();
const text = Buffer.from(`<svg width="${W}" height="${H - 380}" xmlns="http://www.w3.org/2000/svg">
  <rect width="100%" height="100%" fill="#0a0a0a"/>
  <text x="60" y="78" font-family="Arial, Helvetica, sans-serif" font-size="58" font-weight="700" fill="#ffffff">Haq Bahu Naan Shop</text>
  <text x="60" y="140" font-family="Arial, Helvetica, sans-serif" font-size="34" font-weight="700" fill="#f87171">Best Qeema Naan &amp; Pizza Naan in Lahore</text>
  <text x="60" y="190" font-family="Arial, Helvetica, sans-serif" font-size="26" fill="#d4d4d8">Model Town, Lahore  |  Order online for delivery or pickup</text>
</svg>`);
await sharp({ create: { width: W, height: H, channels: 3, background: '#0a0a0a' } })
  .composite([{ input: banner, top: 0, left: 0 }, { input: text, top: 380, left: 0 }])
  .jpeg({ quality: 80, mozjpeg: true })
  .toFile('public/og-image.jpg');
const m = await sharp('public/og-image.jpg').metadata();
console.log('public/og-image.jpg', m.width + 'x' + m.height);
