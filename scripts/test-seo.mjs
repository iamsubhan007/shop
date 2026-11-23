// Unit test for src/lib/seo.js and src/lib/seoContent.js (pure code, no server or database needed).
// Usage: node scripts/test-seo.mjs
import { BUSINESS, DESCRIPTION, KEYWORDS, TITLE, intlPhone, siteUrl } from '../src/lib/seo.js';
import { breadcrumbSchema, buildFaq, buildLlmsText, buildMenuSchema, buildRestaurantSchema, facts, faqSchema, jsonLd, rs, websiteSchema } from '../src/lib/seoContent.js';

let pass = 0, fail = 0;
const check = (n, c, x = '') => { c ? pass++ : fail++; console.log(`${c ? 'PASS' : 'FAIL'}  ${n}${c ? '' : '  ' + x}`); };
const URL0 = 'https://shop.example';

const P = (name, price, extra = {}) => ({ id: name, name, price, available: true, categoryName: 'Chicken Naan', description: '', imageUrl: null, ...extra });
const menu = {
  categories: [{ name: 'Special Items' }, { name: 'Chicken Naan' }, { name: 'Beef Qeema Naan' }],
  products: [
    P('Special Chicken Cheese Naan', 670, { categoryName: 'Special Items', imageUrl: '/special.jpg', description: 'Loaded with cheese.' }),
    P('Chicken Qeema Naan', 250, { description: 'Spiced chicken qeema.' }),
    P('Beef Qeema Naan', 250, { categoryName: 'Beef Qeema Naan' }),
    P('Special Mutton Qeema Naan', 800, { categoryName: 'Special Items', available: false }),
    P('Tandoori Pizza Naan', 500, { categoryName: 'Special Items', imageUrl: '/api/files/product/a.png', description: 'Freshly baked fusion naan stuffed with cheese, chicken and olives.' }),
    P('Kulcha', 50, { categoryName: 'Other Items' }),
  ],
  deals: [{ id: 'd1', title: 'Family Combo', price: 1050, description: 'Great for four', items: ['2 x Chicken Naan', '1 x Raita'], imageUrl: '/deal1.png' }],
};
const settings = {
  shop: { open_time: '08:00', close_time: '23:00', hours: '8:00 AM - 11:00 PM', lat: 31.4766, lng: 74.3147, phone: '', email: 'hello@shop.example' },
  delivery: { enabled: true, radius_m: 1000, fee: 100, free_over: 2500, min_order: 500, hours_enabled: false, start_time: '11:00', end_time: '23:00' },
  paymentMethods: { bank_transfer: true, jazzcash: false, easypaisa: true },
};
const ctx = { menu, settings };

// ---- constants
check('title and description lead with the target words and fit search results', /Qeema Naan/.test(TITLE) && /Pizza Naan/.test(TITLE) && TITLE.length <= 65 && DESCRIPTION.length <= 160, `${TITLE.length}/${DESCRIPTION.length}`);
check('keywords cover qeema naan, pizza naan, naan shop, Model Town, delivery and the brand', ['qeema naan', 'pizza naan', 'naan shop', 'Model Town', 'delivery', 'Haq Bahu'].every((w) => KEYWORDS.some((k) => k.toLowerCase().includes(w.toLowerCase()))));
check('no claim that is not verified (no "organic")', !KEYWORDS.join(' ').toLowerCase().includes('organic') && !TITLE.toLowerCase().includes('organic') && !DESCRIPTION.toLowerCase().includes('organic'));
check('phone numbers are turned into +92 form', intlPhone('03094130285') === '+923094130285' && intlPhone('0333 438 1858') === '+923334381858');
const keep = { ...process.env };
delete process.env.NEXT_PUBLIC_SITE_URL; delete process.env.VERCEL_PROJECT_PRODUCTION_URL; delete process.env.VERCEL_URL;
check('site URL: falls back to localhost', siteUrl() === 'http://localhost:3000');
process.env.VERCEL_URL = 'abc-123.vercel.app'; check('site URL: a one-off deployment URL is never used', siteUrl() === 'http://localhost:3000');
process.env.NODE_ENV = 'production'; check('site URL: a production build with no setting falls back to the live domain', siteUrl() === 'https://hbt-ns.vercel.app'); process.env.NODE_ENV = keep.NODE_ENV;
process.env.VERCEL_PROJECT_PRODUCTION_URL = 'hbt.example.com'; check('site URL: Vercel production domain is used when set', siteUrl() === 'https://hbt.example.com');
process.env.NEXT_PUBLIC_SITE_URL = 'https://www.haqbahu.pk/'; check('site URL: an explicit setting wins and loses its trailing slash', siteUrl() === 'https://www.haqbahu.pk');
process.env.NEXT_PUBLIC_SITE_URL = 'http://localhost:3000'; process.env.NODE_ENV = 'production';
check('site URL: a localhost setting is ignored in production', siteUrl() === 'https://hbt.example.com', siteUrl());
process.env.NODE_ENV = keep.NODE_ENV;
check('site URL: ...but is fine in development', siteUrl() === 'http://localhost:3000');
for (const k of ['NEXT_PUBLIC_SITE_URL', 'VERCEL_PROJECT_PRODUCTION_URL', 'VERCEL_URL']) { if (keep[k] === undefined) delete process.env[k]; else process.env[k] = keep[k]; }

// ---- facts and FAQ
const f = facts(ctx);
check('facts: hours, price range (sold-out items do not set it) and qeema/pizza items', f.hours === '8:00 AM to 11:00 PM' && f.minPrice === 50 && f.maxPrice === 670 && f.qeema.length === 2 && f.pizza.length === 1, JSON.stringify([f.hours, f.minPrice, f.maxPrice, f.qeema.length]));
const faq = buildFaq(ctx, URL0);
const ans = (re) => faq.find((x) => re.test(x.q))?.a || '';
check('FAQ: about 10 questions with real answers', faq.length >= 9 && faq.every((x) => x.q.endsWith('?') && x.a.length > 20), String(faq.length));
check('FAQ qeema answer names the in-stock qeema naans with prices, and not the sold-out one', /Chicken Qeema Naan \(Rs\. 250\)/.test(ans(/qeema/i)) && !/Mutton/.test(ans(/qeema/i)));
check('FAQ pizza answer quotes the real description and price', /Tandoori Pizza Naan \(Rs\. 500\)/.test(ans(/pizza/i)) && /fusion naan stuffed with cheese, chicken and olives/.test(ans(/pizza/i)));
check('FAQ hours answer uses the settings', /8:00 AM to 11:00 PM/.test(ans(/opening hours/i)));
check('FAQ delivery answer uses radius, fee, free-over and minimum from the settings', /within 1 km/.test(ans(/delivery/i)) && /Rs\. 100/.test(ans(/delivery/i)) && /above Rs\. 2,500/.test(ans(/delivery/i)) && /minimum order.*Rs\. 500/.test(ans(/delivery/i)), ans(/delivery/i));
check('FAQ payment answer lists only the enabled online methods', /bank transfer and EasyPaisa/.test(ans(/payment/i)) && !/JazzCash/.test(ans(/payment/i)), ans(/payment/i));
check('FAQ deals answer lists live deals', /Family Combo \(Rs\. 1,050\)/.test(ans(/deals/i)));
check('FAQ menu answer counts items and links the menu page', /6 items/.test(ans(/menu/i)) && /Rs\. 50 to Rs\. 670/.test(ans(/menu/i)) && ans(/menu/i).includes(`${URL0}/Menu`));
check('FAQ location answer has the address and map link', ans(/Where is/).includes(BUSINESS.streetAddress) && ans(/Where is/).includes(BUSINESS.mapsUrl));
const windowed = buildFaq({ menu, settings: { ...settings, delivery: { ...settings.delivery, hours_enabled: true, start_time: '11:00', end_time: '22:30', fee: 0, free_over: 0, min_order: 0 } } }, URL0);
check('FAQ delivery answer: free delivery and a delivery window when set', /Delivery is free/.test(windowed.find((x) => /delivery/i.test(x.q)).a) && /11:00 AM to 10:30 PM/.test(windowed.find((x) => /delivery/i.test(x.q)).a));
const off = buildFaq({ menu, settings: { ...settings, delivery: { ...settings.delivery, enabled: false } } }, URL0);
check('FAQ when delivery is off: says so, and the payment answer drops cash on delivery', /not available right now/.test(off.find((x) => /delivery/i.test(x.q)).a) && !/Cash on delivery/.test(off.find((x) => /payment/i.test(x.q)).a));
const bare = buildFaq(null, URL0);
check('FAQ without any data still works (no menu, no settings) and never prints undefined/null/NaN', bare.length >= 3 && bare.every((x) => !/undefined|null|NaN/.test(x.q + x.a)), JSON.stringify(bare.map((x) => x.q)));
check('FAQ never makes the unverified "organic" claim', !JSON.stringify([faq, off, bare]).toLowerCase().includes('organic'));

// ---- structured data
const r = buildRestaurantSchema(ctx, URL0);
check('Restaurant schema: identity, address, phone, map, menu link', r['@type'] === 'Restaurant' && r.name === 'Haq Bahu Naan Shop' && r.address.streetAddress === BUSINESS.streetAddress && r.telephone === '+923094130285' && r.hasMap === BUSINESS.mapsUrl && r.hasMenu === `${URL0}/Menu` && r['@id'] === `${URL0}/#restaurant`);
check('Restaurant schema: geo, daily opening hours, price range, payment, email', r.geo.latitude === 31.4766 && r.openingHoursSpecification[0].dayOfWeek.length === 7 && r.openingHoursSpecification[0].opens === '08:00' && r.priceRange === 'Rs. 50 - 670' && r.paymentAccepted === 'Cash, Bank transfer, EasyPaisa' && r.email === 'hello@shop.example', JSON.stringify([r.priceRange, r.paymentAccepted]));
check('Restaurant schema: delivery area as a circle around the shop, and both phone numbers', r.areaServed.geoRadius === 1000 && r.areaServed['@type'] === 'GeoCircle' && r.contactPoint.length === 2);
check('Restaurant schema: carries the search keywords and the order action', r.keywords.includes('best qeema naan Lahore') && r.potentialAction['@type'] === 'OrderAction');
check('Restaurant schema: no invented reviews or ratings', !('aggregateRating' in r) && !('review' in r));
const r2 = buildRestaurantSchema({ menu, settings: { ...settings, delivery: { ...settings.delivery, enabled: false } } }, URL0);
check('Restaurant schema: no delivery area when delivery is off', !('areaServed' in r2));
const r3 = buildRestaurantSchema(null, URL0);
check('Restaurant schema without data still has name, address and phone', r3.name && r3.address && r3.telephone && !('openingHoursSpecification' in r3) && !('priceRange' in r3));
const m = buildMenuSchema(ctx, URL0);
const secNames = m.hasMenuSection.map((s) => s.name);
check('Menu schema: sections follow the admin category order, extras after, then deals', secNames.join('|') === 'Special Items|Chicken Naan|Beef Qeema Naan|Other Items|Combo Deals', secNames.join('|'));
const item = (n) => m.hasMenuSection.flatMap((s) => s.hasMenuItem).find((i) => i.name === n);
check('Menu schema: price as text in PKR, availability, absolute image URLs', item('Chicken Qeema Naan').offers.price === '250' && item('Chicken Qeema Naan').offers.priceCurrency === 'PKR' && item('Special Mutton Qeema Naan').offers.availability.endsWith('OutOfStock') && item('Special Chicken Cheese Naan').image === `${URL0}/special.jpg` && item('Tandoori Pizza Naan').image === `${URL0}/api/files/product/a.png` && !('image' in item('Kulcha')));
check('Menu schema: deal includes its contents', /Includes: 2 x Chicken Naan, 1 x Raita/.test(item('Family Combo').description) && item('Family Combo').offers.price === '1050');
check('Menu schema is empty-safe', buildMenuSchema(null, URL0) === null && buildMenuSchema({ menu: { categories: [], products: [], deals: [] } }, URL0) === null);
check('Breadcrumb and WebSite schemas', breadcrumbSchema(URL0, [{ name: 'Home', path: '/' }, { name: 'Menu', path: '/Menu' }]).itemListElement[1].item === `${URL0}/Menu` && websiteSchema(URL0).url === URL0 && !('potentialAction' in websiteSchema(URL0)));
check('FAQ schema repeats exactly the visible questions and answers', faqSchema(faq).mainEntity.length === faq.length && faqSchema(faq).mainEntity.every((q, i) => q.name === faq[i].q && q.acceptedAnswer.text === faq[i].a));
const evil = jsonLd({ a: '</script><script>alert(1)</script>', b: 'x y' });
check('JSON-LD is safe inside a script tag (no </script>, still valid JSON)', !evil.includes('</script') && !evil.includes('<') && JSON.parse(evil).a.startsWith('</script>'));
for (const [n, d] of [['restaurant', r], ['menu', m], ['faq', faqSchema(faq)]]) check(`${n} schema serialises and has no undefined/NaN`, !/undefined|NaN/.test(JSON.stringify(d)));

// ---- llms.txt
const llms = buildLlmsText(ctx, URL0);
const full = buildLlmsText(ctx, URL0, { full: true });
check('llms.txt: title, summary line, facts, pages, FAQ', llms.startsWith('# Haq Bahu Naan Shop\n\n> ') && /## Key facts/.test(llms) && /Opening hours: every day, 8:00 AM to 11:00 PM/.test(llms) && llms.includes(`[Full menu](${URL0}/Menu)`) && /## Frequently asked questions/.test(llms));
check('llms.txt: popular qeema/pizza items with prices, but not the whole menu', /Chicken Qeema Naan: Rs\. 250/.test(llms) && /Tandoori Pizza Naan: Rs\. 500/.test(llms) && !/Kulcha/.test(llms));
check('llms-full.txt: every item by category with price, sold-out marked, deals included', /### Special Items/.test(full) && /- Kulcha: Rs\. 50/.test(full) && /Special Mutton Qeema Naan: Rs\. 800 \(sold out right now\)/.test(full) && /Family Combo: Rs\. 1,050\. Includes: 2 x Chicken Naan, 1 x Raita/.test(full));
check('llms files have no undefined/null/NaN and end with one newline', !/undefined|null|NaN/.test(llms + full) && llms.endsWith('\n') && !llms.endsWith('\n\n'));
check('llms.txt without data is still a valid short document', /^# Haq Bahu Naan Shop/.test(buildLlmsText(null, URL0)) && !/undefined|NaN/.test(buildLlmsText(null, URL0)));
check('money formatting uses thousands separators', rs(1050) === 'Rs. 1,050' && rs(0) === 'Rs. 0' && rs('2500') === 'Rs. 2,500');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
