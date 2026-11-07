'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Loader2 } from 'lucide-react';
import { api, rs } from '@/components/admin/api';

const Card = ({ label, value, hint, tone = '' }) => (
  <div className="bg-white rounded-2xl border border-zinc-200 p-4">
    <div className="text-xs text-zinc-500">{label}</div>
    <div className={`text-2xl font-black mt-1 ${tone}`}>{value}</div>
    {hint && <div className="text-[11px] text-zinc-400 mt-1">{hint}</div>}
  </div>
);

function Bars({ data, label, value, fmt = (v) => v }) {
  const max = Math.max(1, ...data.map((d) => d[value]));
  if (!data.length) return <p className="text-xs text-zinc-400">No data for this period.</p>;
  return (
    <ul className="space-y-1.5">
      {data.map((d) => (
        <li key={d[label]} className="text-xs">
          <div className="flex justify-between"><span className="truncate pr-2">{d[label]}</span><span className="font-semibold">{fmt(d[value])}</span></div>
          <div className="h-2 bg-zinc-100 rounded-full overflow-hidden"><div className="h-full bg-red-600 rounded-full" style={{ width: `${(d[value] / max) * 100}%` }} /></div>
        </li>
      ))}
    </ul>
  );
}

export default function Dashboard() {
  const [range, setRange] = useState({ from: '', to: '' });
  const [s, setS] = useState(null);
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    try {
      const q = new URLSearchParams(Object.entries(range).filter(([, v]) => v)).toString();
      setS(await api(`/api/admin/stats?${q}`));
      setErr('');
    } catch (e) { setErr(e.message); }
  }, [range]);
  useEffect(() => { load(); }, [load]);

  if (err) return <p role="alert" className="text-red-700">{err}</p>;
  if (!s) return <Loader2 className="animate-spin text-zinc-400" />;
  const t = s.totals;
  const box = 'bg-white rounded-2xl border border-zinc-200 p-4';

  return (
    <div className="max-w-6xl mx-auto space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-2xl font-black">Dashboard</h1>
        <div className="flex items-end gap-2 text-xs">
          <label>From<input type="date" value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })} className="block border rounded-lg px-2 py-1.5" /></label>
          <label>To<input type="date" value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} className="block border rounded-lg px-2 py-1.5" /></label>
        </div>
      </div>
      <p className="text-xs text-zinc-500">Showing the selected period (default: last 30 days). Cancelled and unpaid orders are never counted as collected money.</p>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card label="Orders (period)" value={t.total} />
        <Card label="Orders today" value={t.today} />
        <Card label="Open / in progress" value={t.pending} tone="text-amber-600" />
        <Card label="Completed" value={t.completed} tone="text-emerald-700" />
        <Card label="Cancelled / rejected" value={t.cancelled} />
        <Card label="Money collected" value={rs(t.collected)} hint="Verified payments + COD collected" tone="text-emerald-700" />
        <Card label="Collected today" value={rs(t.collected_today)} />
        <Card label="Waiting to be collected" value={rs(t.pending_amount)} hint="Unverified payments + COD not yet delivered" tone="text-amber-600" />
        <Card label="Verified prepaid" value={rs(t.verified_prepaid)} />
        <Card label="COD collected" value={rs(t.cod_collected)} />
        <Card label="Gross order value" value={rs(t.gross)} hint="All non-cancelled orders" />
        <Card label="Average order" value={rs(t.avgOrder)} />
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <section className={box}><h2 className="font-bold text-sm mb-3">Daily money collected</h2><Bars data={s.daily.slice(-14)} label="day" value="revenue" fmt={rs} /></section>
        <section className={box}><h2 className="font-bold text-sm mb-3">Daily order volume</h2><Bars data={s.daily.slice(-14)} label="day" value="orders" /></section>
        <section className={box}><h2 className="font-bold text-sm mb-3">Orders by status</h2><Bars data={s.byStatus} label="status" value="n" /></section>
        <section className={box}><h2 className="font-bold text-sm mb-3">Payment methods</h2><Bars data={s.byPayment} label="method" value="n" /></section>
        <section className={`${box} lg:col-span-2`}><h2 className="font-bold text-sm mb-3">Best-selling items</h2><Bars data={s.topProducts} label="title" value="qty" fmt={(v) => `${v} sold`} /></section>
      </div>
      <Link href="/admin/orders" className="inline-block text-sm font-semibold text-red-700">Go to orders →</Link>
    </div>
  );
}
