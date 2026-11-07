import 'server-only';
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';

// Neutralise spreadsheet formula injection from customer-supplied text.
const safe = (v) => (typeof v === 'string' && /^[=+\-@\t\r]/.test(v) ? `'${v}` : v);

export function toCsv({ columns, rows }) {
  const esc = (v) => {
    const s = String(safe(v) ?? '');
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return '﻿' + [columns.map(([h]) => esc(h)).join(','), ...rows.map((r) => r.map(esc).join(','))].join('\r\n');
}

export async function toXlsx({ title, columns, rows }, subtitle) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Haq Bahu Tandoor';
  const ws = wb.addWorksheet(title.slice(0, 30));
  ws.addRow([`Haq Bahu Tandoor — ${title}`]).font = { bold: true, size: 14 };
  ws.addRow([subtitle]).font = { italic: true, color: { argb: 'FF666666' } };
  ws.addRow([]);
  const head = ws.addRow(columns.map(([h]) => h));
  head.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  head.eachCell((c) => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2B1D14' } }; });
  columns.forEach(([, w], i) => { ws.getColumn(i + 1).width = w; });
  for (const r of rows) ws.addRow(r.map(safe));
  ws.views = [{ state: 'frozen', ySplit: 4 }];
  return Buffer.from(await wb.xlsx.writeBuffer());
}

export function toPdf({ title, columns, rows }, subtitle) {
  return new Promise((resolve) => {
    const landscape = columns.length > 6;
    const doc = new PDFDocument({ size: 'A4', layout: landscape ? 'landscape' : 'portrait', margin: 30 });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    const W = doc.page.width - 60;
    const total = columns.reduce((s, [, w]) => s + w, 0);
    const widths = columns.map(([, w]) => (w / total) * W);
    const header = () => {
      doc.font('Helvetica-Bold').fontSize(14).fillColor('#2b1d14').text(`Haq Bahu Tandoor — ${title}`);
      doc.font('Helvetica').fontSize(8).fillColor('#666').text(subtitle).moveDown(0.5);
    };
    const rowDraw = (cells, bold) => {
      const y = doc.y;
      doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(7).fillColor(bold ? '#fff' : '#000');
      let h = 10;
      cells.forEach((c, i) => { h = Math.max(h, doc.heightOfString(String(c ?? ''), { width: widths[i] - 4 }) + 4); });
      if (y + h > doc.page.height - 40) { doc.addPage(); header(); return rowDraw(cells, bold); }
      if (bold) doc.rect(30, y, W, h).fill('#2b1d14');
      let x = 30;
      doc.fillColor(bold ? '#fff' : '#000');
      cells.forEach((c, i) => { doc.text(String(c ?? ''), x + 2, y + 2, { width: widths[i] - 4, lineBreak: true }); x += widths[i]; });
      doc.y = y + h;
      if (!bold) doc.moveTo(30, doc.y).lineTo(30 + W, doc.y).strokeColor('#ddd').lineWidth(0.3).stroke();
    };
    header();
    rowDraw(columns.map(([h]) => h), true);
    if (!rows.length) doc.fillColor('#666').fontSize(9).text('No records in this period.');
    for (const r of rows) rowDraw(r, false);
    doc.end();
  });
}

/** Single-day closing summary as a printable PDF. */
export function closingPdf(c) {
  return new Promise((resolve) => {
    const doc = new PDFDocument({ size: 'A4', margin: 40 });
    const chunks = [];
    doc.on('data', (x) => chunks.push(x));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    const rs = (n) => `Rs. ${Math.round(n).toLocaleString('en-PK')}`;
    doc.font('Helvetica-Bold').fontSize(18).fillColor('#2b1d14').text('Haq Bahu Tandoor');
    doc.fontSize(12).text(`Daily Closing Report — ${c.day}`).moveDown();
    const line = (k, v, bold) => { doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(10).fillColor('#000').text(k, 40, doc.y, { continued: true, width: 300 }).text(String(v), { align: 'right' }); };
    const sec = (t) => { doc.moveDown(0.6).font('Helvetica-Bold').fontSize(11).fillColor('#b4451f').text(t).moveDown(0.2); };
    sec('Orders');
    line('Total received', c.received); line('Completed', c.completed); line('Cancelled / rejected', c.cancelled);
    line('Pickup', c.pickup); line('Delivery', c.delivery); line('Cash on delivery (live)', c.cod_orders);
    sec('Money collected');
    line('Bank transfers (verified)', rs(c.bank_verified)); line('JazzCash (verified)', rs(c.jazzcash_verified)); line('EasyPaisa (verified)', rs(c.easypaisa_verified)); line('COD collected', rs(c.cod_collected));
    line('TOTAL COLLECTED', rs(c.collected), true);
    sec('Not collected');
    line('Pending / unverified payments', rs(c.pending_payments)); line('Outstanding COD (not yet delivered)', rs(c.outstanding_cod));
    sec('Other');
    line('Total discounts given', rs(c.discounts)); line('Gross order value (excl. cancelled)', rs(c.gross));
    sec('Best sellers');
    c.bestSellers.forEach((b) => line(b.title, `${b.qty} sold · ${rs(b.revenue)}`));
    if (c.closed) doc.moveDown().font('Helvetica-Oblique').fontSize(8).fillColor('#666').text(`Day closed ${new Date(c.closed.closedAt).toLocaleString('en-PK', { timeZone: 'Asia/Karachi' })}`);
    doc.end();
  });
}
