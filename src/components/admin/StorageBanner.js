'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { formatBytes, formatMb } from '@/lib/storageMath';

// Shown to the owner and admin on every admin screen while the hosting plan is getting full (see storageUsage.js).
// Checking is cheap (cached on the server for a minute) and also triggers the warning email when a new level is reached.
// "Hide" is remembered for the rest of the day, and comes back sooner if the level gets worse.
const KEY = 'hbt_storage_banner_hidden';
const today = () => new Date(Date.now() + 5 * 3600 * 1000).toISOString().slice(0, 10);
const COLORS = ['', 'bg-amber-100 text-amber-900 border-amber-300', 'bg-orange-100 text-orange-900 border-orange-300', 'bg-red-100 text-red-900 border-red-300'];

export default function StorageBanner() {
  const path = usePathname();
  const [usage, setUsage] = useState(null);
  const [hidden, setHidden] = useState('');

  useEffect(() => {
    try { setHidden(localStorage.getItem(KEY) || ''); } catch {}
    let live = true;
    const load = async () => {
      try {
        const r = await fetch('/api/admin/storage', { cache: 'no-store' }); // plain fetch: an error here must never sign anyone out
        if (!r.ok) return;
        const d = await r.json();
        if (live) setUsage(d.usage);
      } catch {}
    };
    load();
    const t = setInterval(load, 15 * 60 * 1000);
    return () => { live = false; clearInterval(t); };
  }, []);

  if (!usage || usage.level < 1 || path.startsWith('/admin/storage')) return null;
  const stamp = `${usage.level}|${today()}`;
  if (hidden === stamp) return null;
  const worst = [['Database', usage.database], ['Files', usage.files]].filter(([, m]) => m.percent != null).sort((a, b) => b[1].percent - a[1].percent)[0];
  const [name, m] = worst;
  const hide = () => { setHidden(stamp); try { localStorage.setItem(KEY, stamp); } catch {} };

  return (
    <div role="alert" data-testid="storage-banner" className={`flex items-center gap-3 border-b px-4 py-2.5 text-sm print:hidden ${COLORS[usage.level]}`}>
      <AlertTriangle size={18} className="shrink-0" />
      <span className="flex-1">
        <strong>{usage.level >= 3 ? 'Storage almost full' : 'Storage getting full'}:</strong> {name} is at {m.percent}%
        ({formatBytes(name === 'Database' ? m.bytes : m.totalBytes)} of {formatMb(m.limitMb)}). Download a backup and free some space.{' '}
        <Link href="/admin/storage" className="font-bold underline">Open Storage &amp; Backups</Link>
      </span>
      <button onClick={hide} aria-label="Hide for today" className="p-1 rounded hover:bg-black/10"><X size={16} /></button>
    </div>
  );
}
