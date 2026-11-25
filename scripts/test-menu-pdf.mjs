// Menu PDF: the pure parts (what goes into the menu, the page, upload checks, shop time) and a real print with the
// local Chrome/Edge, read back with pdf.js. No database or server needed:  node scripts/test-menu-pdf.mjs [out.pdf]
import fs from 'node:fs';
import { chromium } from 'playwright-core';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { menuFileName, normalizeMenu } from '../src/lib/menuPdf/normalize.js';
import { buildMenuHtml, rupees } from '../src/lib/menuPdf/template.js';
import { checkPdf, MAX_PDF_BYTES, safeOriginalName } from '../src/lib/menuPdf/validate.js';
import { FONT_CSS } from '../src/lib/menuPdf/fonts.generated.js';
import { fromShopInput, shopDay, toShopInput } from '../src/lib/shopTime.js';

let pass = 0, fail = 0;
const check = (name, cond, extra = '') => { (cond ? pass++ : fail++); console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : '  ' + extra}`); };

// ---- shop time
check('shop input shows Pakistan time', toShopInput('2026-11-25T14:00:00.000Z') === '2026-11-25T19:00');
check('and saves it back unchanged (no drift)', fromShopInput('2026-11-25T19:00') === '2026-11-25T14:00:00.000Z');
check('empty stays empty', toShopInput(null) === '' && fromShopInput('') === null);
check('the day turns over at Pakistan midnight', shopDay(new Date('2026-11-25T19:30:00Z')) === '2026-11-26');

// ---- content
const cat = (id, name, paused = false) => ({ id, name, paused });
const product = (id, categoryId, name, price, more = {}) => ({ id, categoryId, name, price, description: '', compareAtPrice: null, available: true, ...more });
const menu = {
  categories: [cat('a', 'Beef Qeema Naan'), cat('b', 'Paused Section', true), cat('c', 'Empty Section'), cat('d', 'Sides')],
  products: [
    product('1', 'a', 'Beef Qeema Naan', 250, { description: 'Spiced mince', compareAtPrice: 300 }),
    product('2', 'a', 'Sold Out Naan', 260, { available: false }),
    product('3', 'b', 'Paused Naan', 270, { available: false }),
    product('4', 'd', 'Raita', 80, { compareAtPrice: 80 }),
    product('5', null, 'Loose Item', 10),
  ],
  deals: [
    { title: 'Plain Deal', price: 900, originalPrice: 1000, items: ['2x Naan'], isFeatured: false },
    { title: 'Star Deal', price: 500, originalPrice: 400, items: [], isFeatured: true, badge: 'Most Popular' },
  ],
};
const settings = { shop: { name: 'Haq Bahu Tandoor', alt_name: 'Haq Bahu Naan Shop', tagline: 'Fresh • Authentic', phone: '0300 1111111', whatsapp: '', address: 'N Block, Lahore', hours: '8 AM - 11 PM' } };
const data = normalizeMenu({ menu, settings, website: 'https://hbt-ns.vercel.app/', now: new Date('2026-11-25T10:00:00Z') });
check('only categories with orderable items, in the shop order', data.categories.map((c) => c.name).join('|') === 'Beef Qeema Naan|Sides|More', data.categories.map((c) => c.name).join('|'));
check('sold-out, paused and unavailable items are left out', !JSON.stringify(data).includes('Sold Out Naan') && !JSON.stringify(data).includes('Paused'));
check('an old price shows only when higher', data.categories[0].items[0].originalPrice === 300 && data.categories[1].items[0].originalPrice === null);
check('a deal never shows an "original" price that is lower', data.deals.find((d) => d.title === 'Star Deal').originalPrice === null && data.deals.find((d) => d.title === 'Plain Deal').originalPrice === 1000);
check('featured deals come first', data.deals[0].title === 'Star Deal');
check('website without the protocol, date in shop time', data.restaurant.website === 'hbt-ns.vercel.app' && data.generatedOn === '25 November 2026');
check('file name', menuFileName('Haq Bahu Tandoor', '2026-11-25') === 'Haq-Bahu-Tandoor-Menu-2026-11-25.pdf');

const html = buildMenuHtml(data, { fontCss: '' });
check('the page has no pictures', !/<img|background-image|url\(http/i.test(html));
const evil = buildMenuHtml(normalizeMenu({ menu: { categories: [cat('a', '<script>x</script>')], products: [product('1', 'a', '"><img src=x onerror=alert(1)>', 5)], deals: [] }, settings: { shop: { name: 'A "quoted" \\ </style> name' } }, website: '' }), {});
check('names are escaped', !evil.includes('<script>x') && !evil.includes('<img src=x') && !/<\/style> name/.test(evil));
const bare = buildMenuHtml(normalizeMenu({ menu: { categories: [], products: [], deals: [] }, settings: { shop: { name: 'Shop' } }, website: '' }), {});
check('missing phone, address and tagline are simply omitted', !bare.includes('undefined') && !bare.includes('<b>Phone</b>') && !bare.includes('class="address"') && !bare.includes('class="tagline"'));
check('an empty menu says so', bare.includes('Our menu is being updated'));
check('rupees', rupees(1250) === 'Rs. 1,250' && rupees(99.5) === 'Rs. 99.5');

// ---- upload checks
const bytes = (s) => new TextEncoder().encode(s);
check('a PDF is accepted', checkPdf(bytes('%PDF-1.7\n...\n%%EOF\n'), { name: 'menu.PDF', type: 'application/pdf' }) === null);
check('a renamed picture is refused', /not a PDF/.test(checkPdf(bytes('\x89PNG....%%EOF'), { name: 'menu.pdf' })));
check('a cut-off PDF is refused', /incomplete/.test(checkPdf(bytes('%PDF-1.7\n half'), { name: 'menu.pdf' })));
check('wrong extension and type are refused', /ends in \.pdf/.test(checkPdf(bytes('%PDF-%%EOF'), { name: 'menu.exe' })) && /Only PDF/.test(checkPdf(bytes('%PDF-%%EOF'), { name: 'a.pdf', type: 'text/html' })));
check('too large and empty are refused', /too large/.test(checkPdf({ length: MAX_PDF_BYTES + 1 })) && /empty/.test(checkPdf(bytes(''))));
check('file names are tidied', safeOriginalName('C:\\x\\my "menu".pdf') === 'my menu.pdf' && safeOriginalName('../../etc/passwd') === 'passwd.pdf');

// ---- a real print, long enough for several pages
const many = {
  categories: Array.from({ length: 12 }, (_, i) => cat(`c${i}`, `Category Number ${i + 1}`)),
  products: Array.from({ length: 12 * 9 }, (_, i) => product(`p${i}`, `c${Math.floor(i / 9)}`, `Special Cheese Makhan Rogni Naan ${i + 1}`, 100 + i, { description: i % 3 ? 'Freshly baked in our tandoor with butter, coriander and a long description that wraps onto a second line.' : '', compareAtPrice: i % 5 ? null : 500 + i })),
  deals: Array.from({ length: 5 }, (_, i) => ({ title: `Deal ${i + 1}`, price: 1000 + i, originalPrice: 1400, items: ['2x Pizza Naan', '1x Cola'], badge: 'Save more' })),
};
const long = normalizeMenu({ menu: many, settings, website: 'https://hbt-ns.vercel.app', now: new Date('2026-11-25T10:00:00Z') });

let browser;
for (const channel of ['chrome', 'msedge', 'chromium']) { try { browser = await chromium.launch({ channel }); break; } catch {} }
if (!browser) throw new Error('No local Chrome/Edge found');
const page = await browser.newPage();
await page.setContent(buildMenuHtml(long, { fontCss: FONT_CSS }), { waitUntil: 'load' });
await page.evaluate(() => document.fonts.ready.then(() => true));
const pdf = await page.pdf({ preferCSSPageSize: true, printBackground: true });
await browser.close();
if (process.argv[2]) fs.writeFileSync(process.argv[2], pdf);

const doc = await getDocument({ data: new Uint8Array(pdf), useSystemFonts: false }).promise;
const pages = [];
for (let i = 1; i <= doc.numPages; i++) {
  const p = await doc.getPage(i);
  const [, , w, h] = p.view;
  pages.push({ w, h, text: (await p.getTextContent()).items.map((x) => x.str).join(' ').replace(/\s+/g, ' ') });
}
const all = pages.map((p) => p.text).join(' ');
check('several A4 portrait pages', doc.numPages >= 3 && pages.every((p) => Math.abs(p.w - 595) < 2 && Math.abs(p.h - 842) < 2), `${doc.numPages} pages ${pages[0].w}x${pages[0].h}`);
check('page numbers and generation date on every page', pages.every((p, i) => p.text.includes(`Page ${i + 1} of ${doc.numPages}`) && p.text.includes('Generated 25 November 2026')), pages[0].text.slice(-200));
const missing = many.products.filter((p) => !all.includes(p.name));
check('every item is printed once', missing.length === 0 && all.split('Naan 108').length === 2, missing.slice(0, 3).map((p) => p.name).join());
// An entry is never split: its name and its price are on the same page.
const split = many.products.filter((p) => !pages.some((pg) => new RegExp(`${p.name}(?![0-9])`).test(pg.text) && pg.text.includes(rupees(p.price))));
check('no entry is split between pages', split.length === 0, split.slice(0, 3).map((p) => p.name).join());
// A category heading is never the last thing on a page.
const orphan = pages.filter((pg) => { const m = [...pg.text.matchAll(/Category Number \d+ \(9\)/g)].pop(); return m && !pg.text.slice(m.index).includes('Rs.'); });
check('no heading is left alone at the bottom of a page', orphan.length === 0);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
