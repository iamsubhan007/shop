// Generates the portal/notification icons into public/icons (no dependencies): node scripts/make-icons.mjs
// A white "H" on the brand red (#b91c1c). Replace the PNGs with real artwork any time; nothing else depends on this script.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const RED = [185, 28, 28];
const WHITE = [255, 255, 255];

// Is the point (u, v) in 0..1 inside the letter H?
const inH = (u, v) => {
  const stem = (u >= 0.27 && u <= 0.40) || (u >= 0.60 && u <= 0.73);
  const bar = u >= 0.40 && u <= 0.60 && v >= 0.455 && v <= 0.545;
  return v >= 0.24 && v <= 0.76 && (stem || bar);
};

function png(size, pixel) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0; // filter: none
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = pixel((x + 0.5) / size, (y + 0.5) / size);
      raw.set([r, g, b, a], y * (size * 4 + 1) + 1 + x * 4);
    }
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(zlib.crc32(body) >>> 0);
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6; // 8-bit RGBA
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

const out = path.join(process.cwd(), 'public', 'icons');
fs.mkdirSync(out, { recursive: true });
const solid = (u, v) => [...(inH(u, v) ? WHITE : RED), 255]; // full-bleed square: safe for "maskable" crops too
const badge = (u, v) => (inH(u, v) ? [255, 255, 255, 255] : [0, 0, 0, 0]); // Android status-bar icon: white on transparent
for (const [file, size, px] of [['icon-192.png', 192, solid], ['icon-512.png', 512, solid], ['apple-touch-icon.png', 180, solid], ['badge-96.png', 96, badge]]) {
  fs.writeFileSync(path.join(out, file), png(size, px));
  console.log('wrote', path.join('public', 'icons', file));
}
