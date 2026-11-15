'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { Download, Loader2, RefreshCw, Trash2 } from 'lucide-react';
import { api, when } from '@/components/admin/api';
import BackupReportViewer from '@/components/admin/BackupReportViewer';
import { formatBytes, formatMb } from '@/lib/storageMath';

const box = 'bg-white rounded-2xl border border-zinc-200 p-4 print:hidden';
const BAR = ['bg-emerald-500', 'bg-amber-500', 'bg-orange-600', 'bg-red-600'];
const TEXT = ['text-emerald-700', 'text-amber-700', 'text-orange-700', 'text-red-700'];

function Meter({ title, used, limitMb, percent, level, note, children }) {
  const known = percent != null;
  return (
    <div data-testid={`meter-${title.split(' ')[0].toLowerCase()}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-bold text-sm">{title}</h3>
        <span className={`text-sm font-black ${known ? TEXT[level] : 'text-zinc-400'}`}>{known ? `${percent}%` : 'not measurable here'}</span>
      </div>
      <div className="h-3 rounded-full bg-zinc-100 overflow-hidden mt-1" role="progressbar" aria-valuenow={known ? Math.min(100, percent) : 0} aria-valuemin={0} aria-valuemax={100} aria-label={`${title} used`}>
        <div className={`h-full ${known ? BAR[level] : 'bg-zinc-300'}`} style={{ width: `${known ? Math.min(100, percent) : 0}%` }} />
      </div>
      <p className="text-xs text-zinc-500 mt-1">{known ? `${formatBytes(used)} of ${formatMb(limitMb)}` : 'Storage is not set up on this server.'}{note && ` · ${note}`}</p>
      {children}
    </div>
  );
}

export default function StoragePanel() {
  const [usage, setUsage] = useState(null);
  const [backups, setBackups] = useState(null);
  const [stats, setStats] = useState(null);
  const [days, setDays] = useState('0');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState('');

  const loadUsage = useCallback((fresh) => api(`/api/admin/storage${fresh ? '?fresh=1' : ''}`).then((d) => setUsage(d.usage)).catch((e) => setMsg(e.message)), []);
  const loadBackups = useCallback(() => api('/api/admin/backups').then((d) => setBackups(d.backups)).catch((e) => setMsg(e.message)), []);
  const loadStats = useCallback(() => api(`/api/admin/storage/proofs?days=${days}`).then(setStats).catch((e) => setMsg(e.message)), [days]);
  useEffect(() => { loadUsage(true); loadBackups(); }, [loadUsage, loadBackups]);
  useEffect(() => { loadStats(); }, [loadStats]);

  const refresh = async () => { setBusy('refresh'); await Promise.all([loadUsage(true), loadStats()]); setBusy(''); };
  const backupNow = async () => {
    setBusy('backup'); setMsg('');
    try { await api('/api/admin/backups', { method: 'POST' }); setMsg('Backup completed ✓ You can download it below.'); await Promise.all([loadBackups(), loadUsage(true)]); } catch (e) { setMsg(e.message); }
    setBusy('');
  };
  const deleteShots = async () => {
    const n = stats?.removable || 0;
    if (!n) return;
    const older = Number(days) > 0 ? ` placed more than ${days} days ago` : '';
    if (!confirm(`Permanently delete the payment screenshots of ${n} order${n === 1 ? '' : 's'}${older}?\n\nThe orders and their payment records stay; only the pictures are removed. This cannot be undone, and screenshots are not part of backups.`)) return;
    setBusy('shots'); setMsg('');
    let cleaned = 0;
    try {
      for (let i = 0; i < 50; i++) {
        const r = await api('/api/admin/storage/proofs', { method: 'POST', body: { days: Number(days) } });
        cleaned += r.cleaned;
        setMsg(`Deleting… ${cleaned} done${r.remaining ? `, ${r.remaining} to go` : ''}`);
        if (!r.remaining || !r.cleaned) break;
      }
      setMsg(`Deleted the payment screenshots of ${cleaned} order${cleaned === 1 ? '' : 's'} ✓`);
    } catch (e) { setMsg(`${e.message}${cleaned ? ` (${cleaned} were deleted before the problem)` : ''}`); }
    await Promise.all([loadUsage(true), loadStats()]);
    setBusy('');
  };

  const ok = backups?.find((b) => b.status === 'success' && b.available);
  const level = usage?.level || 0;

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="print:hidden">
        <h1 className="text-2xl font-black">Storage & Backups</h1>
        <p className="text-xs text-zinc-500">Owner and admin. Keep an eye on how full the hosting plan is, keep backups on your own phone or computer, and free space when needed.</p>
      </div>
      {msg && <p role="status" className="text-sm bg-zinc-100 rounded-lg p-3 print:hidden">{msg}</p>}

      <section className={box} aria-label="Storage used">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <h2 className="font-black">How full is the plan?</h2>
          <button onClick={refresh} disabled={!!busy} className="flex items-center gap-1.5 text-xs font-semibold border rounded-lg px-3 py-1.5 disabled:opacity-60"><RefreshCw size={13} className={busy === 'refresh' ? 'animate-spin' : ''} /> Check again</button>
        </div>
        {!usage ? <Loader2 className="animate-spin text-zinc-400" /> : (
          <div className="space-y-5">
            <Meter title="Database (orders, customers, menu)" used={usage.database.bytes} limitMb={usage.database.limitMb} percent={usage.database.percent} level={usage.database.level} />
            <Meter title="Files (payment screenshots, pictures, backups)" used={usage.files.totalBytes} limitMb={usage.files.limitMb} percent={usage.files.percent} level={usage.files.level}
              note={usage.files.partial ? 'counts this app’s files only' : ''}>
              {usage.files.folders?.length > 0 && (
                <ul className="mt-2 text-xs text-zinc-600 grid sm:grid-cols-2 gap-x-6">
                  {usage.files.folders.map((f) => <li key={f.key} className="flex justify-between"><span>{f.label}</span><span>{f.count} · {formatBytes(f.bytes)}</span></li>)}
                </ul>
              )}
            </Meter>
            {level >= 1 && (
              <p role="alert" className={`text-sm rounded-lg p-3 border ${level >= 3 ? 'bg-red-50 border-red-200 text-red-800' : 'bg-amber-50 border-amber-200 text-amber-900'}`}>
                {level >= 3 ? 'Almost full! ' : 'Getting full. '}Download a backup now, then delete payment screenshots below{usage.database.level >= 1 ? ' and very old finished orders (Orders page)' : ''}. If a limit is reached, new orders or photo uploads can start to fail.
              </p>
            )}
            <p className="text-xs text-zinc-500">
              {usage.alerts ? `You and the other owner/admin get an email when usage passes ${usage.warnPercent}% (and again at 90% and 95%).` : 'Warning emails are switched off.'}{' '}
              Limits and the warning percentage are in <Link href="/admin/settings" className="underline">Shop Settings</Link> (Storage limits &amp; alerts). Checked {when(usage.checkedAt)}.
            </p>
          </div>
        )}
      </section>

      <section className={box} aria-label="Backups">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
          <h2 className="font-black">Backups</h2>
          <div className="flex gap-2">
            {ok && <a href={`/api/admin/backups/${ok.id}`} className="flex items-center gap-1.5 bg-zinc-900 text-white font-bold px-3.5 py-2.5 rounded-xl text-sm"><Download size={14} /> Download latest</a>}
            <button onClick={backupNow} disabled={!!busy} className="bg-red-700 text-white font-bold px-4 py-2.5 rounded-xl text-sm disabled:opacity-60">{busy === 'backup' ? 'Backing up…' : 'Back up now'}</button>
          </div>
        </div>
        <p className="text-xs text-zinc-500 mb-3">
          Backups are saved in the shop&apos;s file storage (the latest few, set in Shop Settings). Download one to your phone or computer to keep your own copy,
          then open it later in &ldquo;Report from a saved backup&rdquo; below to look at any day, week or month.
        </p>
        {!backups ? <Loader2 className="animate-spin text-zinc-400" /> : (
          <ul className="divide-y text-sm">
            {backups.slice(0, 15).map((b) => (
              <li key={b.id} className="py-2 flex flex-wrap items-center justify-between gap-2">
                <span>{when(b.createdAt)} · <span className="text-zinc-500">{b.trigger}</span> · {b.status === 'success' ? <span className="text-emerald-700">success{b.sizeBytes ? ` (${formatBytes(b.sizeBytes)})` : ''}</span> : <span className="text-red-700">failed: {b.error}</span>}</span>
                {b.status === 'success' && (b.available
                  ? <a href={`/api/admin/backups/${b.id}`} className="flex items-center gap-1 text-xs font-semibold border rounded-lg px-3 py-1.5"><Download size={13} /> Download</a>
                  : <span className="text-xs text-zinc-400">older copy removed</span>)}
              </li>
            ))}
            {!backups.length && <li className="py-3 text-xs text-zinc-400">No backups yet. Press &ldquo;Back up now&rdquo;.</li>}
          </ul>
        )}
      </section>

      <BackupReportViewer />

      <section className={box} aria-label="Payment screenshots">
        <h2 className="font-black mb-1">Payment screenshots</h2>
        <p className="text-xs text-zinc-500 mb-3">
          Customers upload these to prove a payment. Once a payment is checked (or the order is finished) the picture is no longer needed and only takes up space.
          Deleting keeps the order and its payment record; only the picture goes. Screenshots waiting for your payment check are never deleted. You can also delete a single screenshot inside an order.
        </p>
        {!stats ? <Loader2 className="animate-spin text-zinc-400" /> : (
          <div className="space-y-3">
            <p className="text-sm" data-testid="proof-stats"><strong>{stats.removable}</strong> order{stats.removable === 1 ? '' : 's'} with a screenshot that can be deleted{Number(days) > 0 ? ` (placed more than ${days} days ago)` : ''}
              {stats.waitingForReview > 0 && <span className="text-zinc-500"> · {stats.waitingForReview} waiting for payment check (kept)</span>}.</p>
            <div className="flex flex-wrap items-center gap-2">
              <label className="text-sm">Orders placed
                <select value={days} onChange={(e) => setDays(e.target.value)} className="ml-2 border border-zinc-300 rounded-lg px-2.5 py-2 text-sm bg-white" aria-label="Age of orders">
                  <option value="0">at any time</option><option value="7">more than 7 days ago</option><option value="30">more than 30 days ago</option><option value="90">more than 90 days ago</option>
                </select></label>
              <button onClick={deleteShots} disabled={!!busy || !stats.removable} className="flex items-center gap-1.5 bg-white border border-red-300 text-red-700 font-bold px-4 py-2.5 rounded-xl text-sm disabled:opacity-50"><Trash2 size={14} /> {busy === 'shots' ? 'Deleting…' : `Delete ${stats.removable} screenshot${stats.removable === 1 ? '' : 's'}`}</button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
