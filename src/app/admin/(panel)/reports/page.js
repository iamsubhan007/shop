'use client';

import { useCallback, useEffect, useState } from 'react';
import { Download, Loader2, Printer } from 'lucide-react';
import { api, rs, when } from '@/components/admin/api';

const todayPk = () => new Date(Date.now() + 5 * 3600 * 1000).toISOString().slice(0, 10);
const box = 'bg-white rounded-2xl border border-zinc-200 p-4';
const inp = 'border border-zinc-300 rounded-lg px-2.5 py-2 text-sm bg-white';

function List({ rows, a, b, fmtB = (v) => v }) {
  if (!rows?.length) return <p className="text-xs text-zinc-400">No sales in this period.</p>;
  return <ul className="text-sm divide-y">{rows.map((r, i) => <li key={i} className="py-1.5 flex justify-between gap-3"><span className="truncate">{r[a]}</span><span className="font-semibold whitespace-nowrap">{fmtB(r[b])}</span></li>)}</ul>;
}

export default function Reports() {
  const [day, setDay] = useState(todayPk());
  const [closing, setClosing] = useState(null);
  const [range, setRange] = useState({ from: '', to: '' });
  const [an, setAn] = useState(null);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  const q = new URLSearchParams(Object.entries(range).filter(([, v]) => v)).toString();
  const loadClosing = useCallback(() => api(`/api/admin/closing?date=${day}`).then((d) => setClosing(d.report)).catch((e) => setMsg(e.message)), [day]);
  const loadAn = useCallback(() => api(`/api/admin/analytics?${q}`).then(setAn).catch((e) => setMsg(e.message)), [q]);
  useEffect(() => { loadClosing(); }, [loadClosing]);
  useEffect(() => { loadAn(); }, [loadAn]);

  const closeDay = async () => {
    if (!confirm(`Close ${day}? This saves a summary. Orders are not locked or changed.`)) return;
    setBusy(true);
    try { await api('/api/admin/closing', { method: 'POST', body: { date: day } }); setMsg('Day closed and summary saved ✓'); loadClosing(); } catch (e) { setMsg(e.message); }
    setBusy(false);
  };

  const exp = (type, format) => { window.location.href = `/api/admin/export?type=${type}&format=${format}${q ? `&${q}` : ''}`; };
  const c = closing;
  const Row = ({ k, v, bold }) => <div className={`flex justify-between py-1 text-sm ${bold ? 'font-black border-t mt-1 pt-2' : ''}`}><span>{k}</span><span>{v}</span></div>;

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <h1 className="text-2xl font-black">Reports</h1>
      {msg && <p role="status" className="text-sm bg-zinc-100 rounded-lg p-3">{msg}</p>}

      <section className={box}>
        <div className="flex flex-wrap items-end justify-between gap-3 mb-3">
          <h2 className="font-black">Daily closing report</h2>
          <div className="flex flex-wrap items-end gap-2 print:hidden">
            <input type="date" value={day} onChange={(e) => setDay(e.target.value)} className={inp} aria-label="Report date" />
            <a href={`/api/admin/closing?date=${day}&format=pdf`} className="flex items-center gap-1.5 px-3 py-2 border rounded-lg text-sm font-semibold"><Download size={14} /> PDF</a>
            <button onClick={() => window.print()} className="flex items-center gap-1.5 px-3 py-2 border rounded-lg text-sm font-semibold"><Printer size={14} /> Print</button>
            <button onClick={closeDay} disabled={busy} className="px-3 py-2 bg-red-700 text-white rounded-lg text-sm font-bold disabled:opacity-60">Close this day</button>
          </div>
        </div>
        {!c ? <Loader2 className="animate-spin text-zinc-400" /> : (
          <div className="grid md:grid-cols-2 gap-x-8">
            <div>
              <h3 className="text-xs font-bold text-zinc-500 mb-1">ORDERS</h3>
              <Row k="Received" v={c.received} /><Row k="Completed" v={c.completed} /><Row k="Cancelled / rejected" v={c.cancelled} />
              <Row k="Pickup" v={c.pickup} /><Row k="Delivery" v={c.delivery} /><Row k="Cash on delivery (live)" v={c.cod_orders} />
            </div>
            <div>
              <h3 className="text-xs font-bold text-zinc-500 mb-1">MONEY COLLECTED</h3>
              <Row k="Bank transfers (verified)" v={rs(c.bank_verified)} /><Row k="JazzCash (verified)" v={rs(c.jazzcash_verified)} /><Row k="EasyPaisa (verified)" v={rs(c.easypaisa_verified)} /><Row k="COD collected" v={rs(c.cod_collected)} />
              <Row k="Total collected" v={rs(c.collected)} bold />
              <h3 className="text-xs font-bold text-zinc-500 mt-3 mb-1">NOT COLLECTED</h3>
              <Row k="Pending / unverified payments" v={rs(c.pending_payments)} /><Row k="Outstanding COD" v={rs(c.outstanding_cod)} />
              <Row k="Discounts given" v={rs(c.discounts)} />
            </div>
            <div className="md:col-span-2 mt-3"><h3 className="text-xs font-bold text-zinc-500 mb-1">BEST SELLERS</h3><List rows={c.bestSellers} a="title" b="qty" fmtB={(v) => `${v} sold`} /></div>
            {c.closed && <p className="md:col-span-2 text-xs text-emerald-700 mt-2">Closed on {when(c.closed.closedAt)}. You can still view and change orders; run closing again to refresh the summary.</p>}
          </div>
        )}
      </section>

      <section className={box}>
        <div className="flex flex-wrap items-end justify-between gap-3 mb-3 print:hidden">
          <h2 className="font-black">Product sales & comparison</h2>
          <div className="flex gap-2 text-xs">
            <label>From<input type="date" value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })} className={`block ${inp}`} /></label>
            <label>To<input type="date" value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} className={`block ${inp}`} /></label>
          </div>
        </div>
        {!an ? <Loader2 className="animate-spin text-zinc-400" /> : (
          <div className="space-y-5">
            <p className="text-sm">This period: <strong>{an.comparison.current.qty}</strong> items, <strong>{rs(an.comparison.current.revenue)}</strong> · Previous period: {an.comparison.previous.qty} items, {rs(an.comparison.previous.revenue)}
              {an.comparison.previous.revenue > 0 && <span className={an.comparison.current.revenue >= an.comparison.previous.revenue ? 'text-emerald-700' : 'text-red-700'}> ({Math.round(((an.comparison.current.revenue - an.comparison.previous.revenue) / an.comparison.previous.revenue) * 100)}%)</span>}</p>
            <div className="grid md:grid-cols-2 gap-6">
              <div><h3 className="text-xs font-bold text-zinc-500 mb-1">MOST ORDERED</h3><List rows={an.mostOrdered} a="title" b="qty" fmtB={(v) => `${v}`} /></div>
              <div><h3 className="text-xs font-bold text-zinc-500 mb-1">LEAST ORDERED (that sold)</h3><List rows={an.leastOrdered} a="title" b="qty" fmtB={(v) => `${v}`} /></div>
              <div><h3 className="text-xs font-bold text-zinc-500 mb-1">REVENUE BY PRODUCT</h3><List rows={an.revenueByProduct} a="title" b="revenue" fmtB={rs} /></div>
              <div><h3 className="text-xs font-bold text-zinc-500 mb-1">CATEGORY PERFORMANCE</h3><List rows={an.categories} a="category" b="revenue" fmtB={rs} /></div>
            </div>
            <div><h3 className="text-xs font-bold text-zinc-500 mb-1">TOP ITEMS: THIS vs PREVIOUS PERIOD (quantity)</h3>
              <ul className="text-sm divide-y">{an.comparison.perProduct.map((p) => <li key={p.title} className="py-1.5 flex justify-between"><span>{p.title}</span><span>{p.qty} <span className="text-zinc-400">vs {p.previousQty}</span></span></li>)}</ul></div>
          </div>
        )}
      </section>

      <section className={`${box} print:hidden`}>
        <h2 className="font-black mb-1">Download data</h2>
        <p className="text-xs text-zinc-500 mb-3">Uses the From/To dates above (default: last 30 days). These files contain customer details — keep them private.</p>
        <div className="space-y-2">
          {[['orders', 'All orders'], ['customers', 'Customers'], ['revenue', 'Revenue by day'], ['payments', 'Payments'], ['products', 'Product sales']].map(([t, l]) => (
            <div key={t} className="flex flex-wrap items-center gap-2"><span className="w-36 text-sm font-semibold">{l}</span>
              {['xlsx', 'csv', 'pdf'].map((f) => <button key={f} onClick={() => exp(t, f)} className="px-3 py-1.5 border rounded-lg text-xs font-bold uppercase hover:bg-zinc-50">{f === 'xlsx' ? 'Excel' : f}</button>)}</div>
          ))}
        </div>
      </section>
    </div>
  );
}
