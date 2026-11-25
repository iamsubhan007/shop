// The printed menu as one HTML page, styled like the website (charcoal header, crimson accents, amber deal prices,
// bordered white cards). Text and prices only. Pure, so it can be unit-tested; every value is escaped.

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export const rupees = (n) => `Rs. ${Number(n).toLocaleString('en-US', { maximumFractionDigits: 2 })}`;

/** A string inside a CSS content: "..." rule. */
const cssString = (v) => String(v ?? '').replace(/[\\"]/g, '\\$&').replace(/[\r\n<>]+/g, ' ');

// The website's logo mark: the flame in a red rounded square.
const FLAME = 'M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z';
const logo = (size) => `<span class="logo" style="width:${size}px;height:${size}px"><svg viewBox="0 0 24 24" width="${Math.round(size * 0.66)}" height="${Math.round(size * 0.66)}" fill="#fff" stroke="#fff" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="${FLAME}"/></svg></span>`;

const chunk = (list, n) => list.reduce((rows, x, i) => (i % n ? rows[rows.length - 1].push(x) : rows.push([x]), rows), []);

const price = (value, was) => `<span class="price">${was ? `<s>${esc(rupees(was))}</s> ` : ''}${esc(rupees(value))}</span>`;

const itemCell = (i) => `
  <div class="item">
    <div class="line"><span class="name" dir="auto">${esc(i.name)}</span><span class="dots"></span>${price(i.price, i.originalPrice)}</div>
    ${i.description ? `<div class="desc" dir="auto">${esc(i.description)}</div>` : ''}
  </div>`;

const dealCell = (d) => `
  <div class="deal">
    <div class="deal-top">
      <span class="deal-title" dir="auto">${esc(d.title)}</span>
      ${d.badge ? `<span class="badge" dir="auto">${esc(d.badge)}</span>` : ''}
    </div>
    ${d.items.length ? `<ul>${d.items.map((x) => `<li dir="auto">${esc(x)}</li>`).join('')}</ul>` : ''}
    ${d.description ? `<div class="desc" dir="auto">${esc(d.description)}</div>` : ''}
    <div class="deal-price"><span class="amount">${esc(rupees(d.price))}</span>${d.originalPrice ? `<s>${esc(rupees(d.originalPrice))}</s>` : ''}</div>
  </div>`;

const row = (cells, cls) => `<div class="row ${cls}">${cells.join('')}${cells.length === 1 ? '<div></div>' : ''}</div>`;

/** A heading is kept on the same page as its first row, so a category never starts at the very bottom of a page. */
const section = (heading, rows) => `<section><div class="keep">${heading}${rows[0] || ''}</div>${rows.slice(1).join('')}</section>`;

export function buildMenuHtml(data, { fontCss = '' } = {}) {
  const r = data.restaurant;
  const contact = [r.phone && `Phone ${r.phone}`, r.website].filter(Boolean);

  const deals = data.deals.length
    ? section(
        `<div class="kicker">VALUE PACKS</div><h2><i></i>Crazy Deals &amp; Combos</h2>`,
        chunk(data.deals.map(dealCell), 2).map((c) => row(c, 'deals')),
      )
    : '';

  const categories = data.categories
    .map((c) => section(`<h2><i></i><span dir="auto">${esc(c.name)}</span> <small>(${c.items.length})</small></h2>`, chunk(c.items.map(itemCell), 2).map((x) => row(x, 'items'))))
    .join('');

  const empty = !data.deals.length && !data.categories.length ? '<p class="empty">Our menu is being updated. Please check back soon.</p>' : '';

  const details = [
    r.phone && ['Phone', r.phone],
    r.whatsapp && r.whatsapp !== r.phone && ['WhatsApp', r.whatsapp],
    r.website && ['Order online', r.website],
    r.address && ['Address', r.address],
    r.hours && ['Opening hours', r.hours],
  ].filter(Boolean);

  const footerLeft = [r.name, `Generated ${data.generatedOn}`].join('  ·  ');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${esc(r.name)} — Menu</title>
<style>
${fontCss}
@page {
  size: A4 portrait;
  margin: 12mm 12mm 16mm;
  background: #faf8f5;
  @bottom-left { content: "${cssString(footerLeft)}"; font: 400 8pt 'MenuSans', 'MenuUrdu', sans-serif; color: #71717a; }
  @bottom-right { content: "Page " counter(page) " of " counter(pages); font: 500 8pt 'MenuSans', sans-serif; color: #71717a; }
}
* { box-sizing: border-box; margin: 0; padding: 0; }
html { -webkit-print-color-adjust: exact; print-color-adjust: exact; background: #faf8f5; }
body { font-family: 'MenuSans', 'MenuUrdu', sans-serif; color: #110f0d; font-size: 10pt; line-height: 1.35; }
.keep, .row, .deal, .item, .contact { break-inside: avoid; page-break-inside: avoid; }

header { background: #09090b; color: #fff; border-radius: 14px; padding: 16px 18px; display: flex; gap: 14px; align-items: center; border-bottom: 4px solid #b91c1c; }
.logo { display: inline-flex; align-items: center; justify-content: center; background: #dc2626; border-radius: 12px; flex: none; }
.brand { flex: 1; min-width: 0; }
.brand h1 { font-size: 21pt; font-weight: 900; line-height: 1.1; letter-spacing: -0.2px; overflow-wrap: anywhere; }
.tagline { color: #f87171; font-size: 8.5pt; font-weight: 700; letter-spacing: 1.6px; text-transform: uppercase; margin-top: 3px; }
.alt { color: #d4d4d8; font-size: 9pt; margin-top: 2px; }
.contact-top { text-align: right; color: #d4d4d8; font-size: 9pt; line-height: 1.6; flex: none; max-width: 42%; overflow-wrap: anywhere; }
.address { color: #52525b; font-size: 9pt; margin: 7px 2px 0; overflow-wrap: anywhere; }

section { margin-top: 15px; }
.kicker { color: #b91c1c; font-size: 8pt; font-weight: 900; letter-spacing: 1.8px; }
h2 { display: flex; align-items: center; gap: 8px; font-size: 14pt; font-weight: 700; color: #18181b; padding-bottom: 5px; border-bottom: 1px solid #e4e4e7; margin-bottom: 7px; overflow-wrap: anywhere; }
h2 i { width: 5px; height: 18px; border-radius: 99px; background: #b91c1c; flex: none; }
h2 small { color: #a1a1aa; font-size: 9pt; font-weight: 500; }

.row { display: grid; grid-template-columns: 1fr 1fr; column-gap: 18px; }
.row.items { padding: 4px 8px; border-bottom: 1px solid #ece9e4; background: #fff; }
.item { min-width: 0; }
.line { display: flex; align-items: baseline; gap: 5px; }
.name { font-weight: 700; font-size: 10pt; min-width: 0; overflow-wrap: anywhere; }
.dots { flex: 1; min-width: 12px; border-bottom: 1.5px dotted #d4d4d8; transform: translateY(-2px); }
.price { flex: none; font-weight: 900; color: #b91c1c; white-space: nowrap; }
.price s { font-weight: 400; color: #a1a1aa; font-size: 8.5pt; }
.desc { color: #71717a; font-size: 8.4pt; line-height: 1.35; margin-top: 1px; overflow-wrap: anywhere; }

.row.deals { column-gap: 10px; margin-bottom: 10px; align-items: stretch; }
.deal { background: #fff; border: 1px solid #e4e4e7; border-radius: 12px; padding: 11px 12px; display: flex; flex-direction: column; gap: 5px; min-width: 0; }
.deal-top { display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; }
.deal-title { font-weight: 700; font-size: 11.5pt; min-width: 0; overflow-wrap: anywhere; }
.badge { flex: none; max-width: 45%; background: #b91c1c; color: #fff; border-radius: 99px; font-size: 7.5pt; font-weight: 700; padding: 2px 8px; overflow-wrap: anywhere; }
.deal ul { list-style: none; font-size: 8.8pt; color: #3f3f46; }
.deal li { padding-left: 13px; position: relative; overflow-wrap: anywhere; }
.deal li::before { content: ""; position: absolute; left: 1px; top: 0.35em; width: 3px; height: 6px; border: solid #059669; border-width: 0 1.5px 1.5px 0; transform: rotate(45deg); }
.deal-price { margin-top: auto; align-self: flex-start; background: #09090b; border-radius: 8px; padding: 4px 10px; display: flex; align-items: baseline; gap: 7px; }
.deal-price .amount { color: #fcd34d; font-weight: 900; font-size: 11.5pt; white-space: nowrap; }
.deal-price s { color: #a1a1aa; font-size: 8.5pt; white-space: nowrap; }

.empty { margin-top: 40px; text-align: center; color: #71717a; font-size: 12pt; }
.contact { margin-top: 18px; background: #09090b; color: #d4d4d8; border-radius: 12px; padding: 12px 16px; display: grid; grid-template-columns: 1fr 1fr; gap: 7px 18px; font-size: 9pt; }
.contact b { display: block; color: #f87171; font-size: 7.5pt; letter-spacing: 1.2px; text-transform: uppercase; }
.contact div { overflow-wrap: anywhere; }
</style>
</head>
<body>
  <header>
    ${logo(46)}
    <div class="brand">
      <h1 dir="auto">${esc(r.name)}</h1>
      ${r.tagline ? `<div class="tagline" dir="auto">${esc(r.tagline)}</div>` : ''}
      ${r.altName ? `<div class="alt" dir="auto">${esc(r.altName)}</div>` : ''}
    </div>
    ${contact.length ? `<div class="contact-top">${contact.map((x) => `<div>${esc(x)}</div>`).join('')}</div>` : ''}
  </header>
  ${r.address ? `<p class="address" dir="auto">${esc(r.address)}</p>` : ''}
  ${deals}
  ${categories}
  ${empty}
  ${details.length ? `<div class="contact">${details.map(([k, v]) => `<div><b>${esc(k)}</b><span dir="auto">${esc(v)}</span></div>`).join('')}</div>` : ''}
</body>
</html>`;
}
