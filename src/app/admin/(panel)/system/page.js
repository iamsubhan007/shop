'use client';

import { useCallback, useEffect, useState } from 'react';
import { Download, Loader2 } from 'lucide-react';
import { api, when } from '@/components/admin/api';

const ACTIONS = {
  'order.status': 'Order status changed', 'payment.verify': 'Payment verified', 'payment.reject': 'Payment rejected', 'product.create': 'Product added', 'product.price': 'Price changed',
  'product.availability': 'Availability changed', 'product.delete': 'Product deleted', 'inventory.adjust': 'Stock adjusted', 'deal.create': 'Deal added', 'deal.update': 'Deal changed', 'deal.delete': 'Deal deleted',
  'coupon.create': 'Coupon added', 'coupon.toggle': 'Coupon switched', 'day.close': 'Day closed', 'backup.run': 'Backup taken', 'backup.download': 'Backup downloaded', export: 'Data exported', 'staff.login': 'Staff signed in',
};

export default function SystemAdmin() {
  const [backups, setBackups] = useState(null);
  const [logs, setLogs] = useState(null);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  const loadBackups = useCallback(() => api('/api/admin/backups').then((d) => setBackups(d.backups)).catch((e) => setMsg(e.message)), []);
  const loadLogs = useCallback(() => api(`/api/admin/audit?page=${page}`).then((d) => { setLogs(d.logs); setPages(d.pages); }).catch((e) => setMsg(e.message)), [page]);
  useEffect(() => { loadBackups(); }, [loadBackups]);
  useEffect(() => { loadLogs(); }, [loadLogs]);

  const backupNow = async () => {
    setBusy(true); setMsg('');
    try { await api('/api/admin/backups', { method: 'POST' }); setMsg('Backup completed ✓'); loadBackups(); loadLogs(); } catch (e) { setMsg(e.message); }
    setBusy(false);
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <h1 className="text-2xl font-black">Backups & Activity</h1>
      <p className="text-xs text-zinc-500">Owner only. The live database stays on the server; backups are copies you can download.</p>
      {msg && <p role="status" className="text-sm bg-zinc-100 rounded-lg p-3">{msg}</p>}

      <section className="bg-white rounded-2xl border p-4">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3"><h2 className="font-black">Backups</h2>
          <button onClick={backupNow} disabled={busy} className="bg-red-700 text-white font-bold px-4 py-2.5 rounded-xl text-sm disabled:opacity-60">{busy ? 'Backing up…' : 'Back up now'}</button></div>
        <p className="text-xs text-zinc-500 mb-3">Automatic backups follow the schedule in Shop Settings. See docs/BACKUP.md for restoring and for the optional PC sync tool.</p>
        {!backups ? <Loader2 className="animate-spin text-zinc-400" /> : (
          <ul className="divide-y text-sm">
            {backups.map((b) => (
              <li key={b.id} className="py-2 flex flex-wrap items-center justify-between gap-2">
                <span>{when(b.createdAt)} · <span className="text-zinc-500">{b.trigger}</span> · {b.status === 'success' ? <span className="text-emerald-700">success{b.sizeBytes ? ` (${Math.round(b.sizeBytes / 1024)} KB)` : ''}</span> : <span className="text-red-700">failed: {b.error}</span>}</span>
                {b.status === 'success' && <a href={`/api/admin/backups/${b.id}`} className="flex items-center gap-1 text-xs font-semibold border rounded-lg px-3 py-1.5"><Download size={13} /> Download</a>}
              </li>
            ))}
            {!backups.length && <li className="py-3 text-xs text-zinc-400">No backups yet.</li>}
          </ul>
        )}
      </section>

      <section className="bg-white rounded-2xl border p-4">
        <h2 className="font-black mb-3">Who did what</h2>
        {!logs ? <Loader2 className="animate-spin text-zinc-400" /> : (
          <ul className="divide-y text-sm">
            {logs.map((l) => (
              <li key={l.id} className="py-2">
                <div className="flex flex-wrap justify-between gap-2"><strong>{ACTIONS[l.action] || l.action}</strong><span className="text-xs text-zinc-500">{when(l.createdAt)}</span></div>
                <div className="text-xs text-zinc-500">{l.actorEmail || 'system'}{l.entityId && ` · ${l.entity}: ${String(l.entityId).slice(0, 24)}`}</div>
                {(l.before || l.after) && <div className="text-[11px] text-zinc-400 break-all">{l.before ? `before ${JSON.stringify(l.before)} ` : ''}{l.after ? `→ ${JSON.stringify(l.after)}` : ''}</div>}
              </li>
            ))}
            {!logs.length && <li className="py-3 text-xs text-zinc-400">Nothing recorded yet.</li>}
          </ul>
        )}
        {pages > 1 && <div className="flex justify-center gap-3 text-sm mt-3"><button disabled={page <= 1} onClick={() => setPage(page - 1)} className="px-3 py-1.5 border rounded-lg disabled:opacity-40">Newer</button><span>Page {page}/{pages}</span><button disabled={page >= pages} onClick={() => setPage(page + 1)} className="px-3 py-1.5 border rounded-lg disabled:opacity-40">Older</button></div>}
      </section>
    </div>
  );
}
