// Pure helpers for the storage meter and its warning emails (no imports, so they run in the browser and in plain Node).

export const MB = 1024 * 1024;

/** "85.2" style percentage of a limit given in MB, or null when either side is unknown. */
export function usagePercent(bytes, limitMb) {
  if (bytes == null || !Number.isFinite(Number(bytes)) || !(Number(limitMb) > 0)) return null;
  return Math.round((Number(bytes) / (Number(limitMb) * MB)) * 1000) / 10;
}

/**
 * 0 = fine, 1 = warning (from the owner's chosen percentage), 2 = urgent (90%+), 3 = critical (95%+).
 * The thresholds never go below the chosen warning percentage.
 */
export function levelFor(percent, warnPercent = 80) {
  if (percent == null || !Number.isFinite(percent)) return 0;
  const warn = Math.min(95, Math.max(50, Number(warnPercent) || 80));
  if (percent >= Math.max(warn, 95)) return 3;
  if (percent >= Math.max(warn, 90)) return 2;
  if (percent >= warn) return 1;
  return 0;
}

export function formatBytes(b) {
  const n = Number(b);
  if (!Number.isFinite(n)) return '—';
  if (n < 1024) return `${n} B`;
  if (n < MB) return `${(n / 1024).toFixed(n < 10240 ? 1 : 0)} KB`;
  if (n < 1024 * MB) return `${(n / MB).toFixed(n < 10 * MB ? 1 : 0)} MB`;
  return `${(n / (1024 * MB)).toFixed(2)} GB`;
}

export const formatMb = (mb) => (mb >= 1024 && mb % 1024 === 0 ? `${mb / 1024} GB` : `${mb} MB`);

/** What the warning email says. `usage` is the object from measureUsage(); `link` is the Storage & Backups page, if known. */
export function buildAlertEmail({ usage, link }) {
  const rows = [];
  if (usage.database?.percent != null) rows.push({ name: 'Database (orders, customers, menu)', used: formatBytes(usage.database.bytes), limit: formatMb(usage.database.limitMb), percent: usage.database.percent, level: usage.database.level });
  if (usage.files?.percent != null) rows.push({ name: 'Files (payment screenshots, pictures, backups)', used: formatBytes(usage.files.totalBytes), limit: formatMb(usage.files.limitMb), percent: usage.files.percent, level: usage.files.level });
  const top = Math.max(...rows.map((r) => r.percent), 0);
  const pct = Math.round(top);
  const subject = usage.level >= 3 ? `URGENT: shop storage is ${pct}% full`
    : usage.level === 2 ? `Shop storage is ${pct}% full - please act now`
    : `Shop storage is ${pct}% full - action needed soon`;
  const lines = rows.map((r) => `- ${r.name}: ${r.used} of ${r.limit} (${r.percent}%)`);
  const todo = [
    'Open Admin > Storage & Backups and download a backup to your phone or computer (you can open it later there to see reports).',
    'Delete payment screenshots of finished orders from the same page (they are only needed until a payment is checked).',
    'If the database is the one filling up, delete very old finished orders from Orders after downloading the backup.',
    'Or move the shop to a bigger hosting plan.',
  ];
  const warn = usage.level >= 3
    ? 'When the database is completely full the host can stop it accepting new data, so new orders could fail to save. When file storage is full, new photo uploads fail.'
    : 'If a limit is reached, new orders or new photo uploads can start to fail.';
  const text = [
    `Your shop's hosting storage is getting full.`,
    '',
    ...lines,
    '',
    warn,
    '',
    'What to do:',
    ...todo.map((t, i) => `${i + 1}. ${t}`),
    ...(link ? ['', `Open: ${link}`] : []),
    '',
    'You get this message again only if usage grows to the next warning level, or as a weekly reminder while it stays high.',
  ].join('\n');
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const html = `<div style="font-family:Arial,sans-serif;max-width:560px;color:#18181b">
<h2 style="margin:0 0 8px">Your shop's storage is getting full</h2>
<ul style="padding-left:18px">${rows.map((r) => `<li><strong>${esc(r.name)}</strong>: ${esc(r.used)} of ${esc(r.limit)} (${r.percent}%)</li>`).join('')}</ul>
<p>${esc(warn)}</p>
<p style="margin-bottom:4px"><strong>What to do</strong></p>
<ol style="padding-left:18px;margin-top:0">${todo.map((t) => `<li>${esc(t)}</li>`).join('')}</ol>
${link ? `<p><a href="${esc(link)}">Open Storage &amp; Backups</a></p>` : ''}
<p style="color:#71717a;font-size:12px">You get this message again only if usage grows to the next warning level, or as a weekly reminder while it stays high.</p></div>`;
  return { subject, text, html };
}
