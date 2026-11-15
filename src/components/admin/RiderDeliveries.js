'use client';

import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Loader2, MapPin, Navigation, RefreshCw } from 'lucide-react';
import { api, rs, ago, when } from '@/components/admin/api';
import { PAYMENT_LABELS } from '@/lib/orderStatus';

// The rider's whole app: orders that are out for delivery, with the address, a map link, the items and the bill,
// and one button to confirm the delivery (and the cash, for cash-on-delivery). There is deliberately no phone number
// or email anywhere here: the server never sends them to a rider.

export default function RiderDeliveries() {
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const [busyId, setBusyId] = useState(null);
  const [cash, setCash] = useState({}); // order id -> "I collected the cash" ticked
  const [msg, setMsg] = useState('');

  const load = useCallback(async () => {
    try { setData(await api('/api/rider/orders')); setErr(''); } catch (e) { setErr(e.message); }
  }, []);
  useEffect(() => { load(); const t = setInterval(load, 15000); return () => clearInterval(t); }, [load]);

  const deliver = async (o) => {
    const text = o.collectCash ? `Confirm: ${o.orderNumber} was delivered and you collected ${rs(o.amountToCollect)} in cash?` : `Confirm: ${o.orderNumber} was delivered?`;
    if (!window.confirm(text)) return;
    setBusyId(o.id); setErr(''); setMsg('');
    try {
      await api(`/api/rider/orders/${o.id}/deliver`, { method: 'POST', body: { delivered: true, paymentReceived: o.collectCash ? !!cash[o.id] : undefined } });
      setMsg(`${o.orderNumber} marked as delivered.`);
      await load();
    } catch (e) { setErr(e.message); }
    setBusyId(null);
  };

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-black">Deliveries</h1>
        <button onClick={load} className="flex items-center gap-1.5 text-xs font-semibold border rounded-lg px-3 py-2 bg-white"><RefreshCw size={14} /> Refresh</button>
      </div>
      {err && <p role="alert" className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">{err}</p>}
      {msg && <p role="status" className="text-sm text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg p-3">{msg}</p>}

      {!data ? <Loader2 className="animate-spin text-zinc-400" /> : (
        <>
          {data.active.length === 0 && <p className="text-sm text-zinc-500 bg-white rounded-2xl border p-8 text-center">No orders are out for delivery right now. New ones appear here automatically.</p>}
          {data.active.map((o) => (
            <article key={o.id} data-testid="rider-order" className="bg-white rounded-2xl border-2 border-zinc-200 p-4 space-y-3">
              <div className="flex justify-between items-start gap-2">
                <div>
                  <div className="font-black text-lg">{o.orderNumber}</div>
                  <div className="text-sm font-semibold">{o.customerName}</div>
                </div>
                <div className="text-xs text-zinc-500 text-right">Placed {ago(o.placedAt)} ago</div>
              </div>

              <div className="flex gap-2 items-start text-sm">
                <MapPin size={18} className="shrink-0 mt-0.5 text-red-700" />
                <div className="flex-1">
                  <div className="font-semibold">{o.address}</div>
                  {o.distanceM != null && <div className="text-xs text-zinc-500">{o.distanceM} m from the shop</div>}
                </div>
              </div>
              {o.lat != null && o.lng != null && (
                <a href={`https://www.google.com/maps/dir/?api=1&destination=${o.lat},${o.lng}`} target="_blank" rel="noreferrer" className="flex items-center justify-center gap-2 bg-zinc-900 text-white font-bold rounded-xl py-3 text-sm"><Navigation size={16} /> Open in Maps</a>
              )}
              {o.specialInstructions && <p className="text-sm bg-amber-50 border border-amber-200 rounded-lg p-2.5">Note: {o.specialInstructions}</p>}

              <div className="rounded-xl bg-zinc-50 p-3 text-sm">
                <ul className="divide-y">
                  {o.items.map((i) => (
                    <li key={i.id} className="py-1.5 flex justify-between gap-3">
                      <span>{i.quantity} × {i.title}{i.notes && <span className="block text-xs text-zinc-500">{i.notes}</span>}</span>
                      <span className="shrink-0">{rs(i.subtotal)}</span>
                    </li>
                  ))}
                </ul>
                <div className="border-t mt-1 pt-1 space-y-0.5">
                  <div className="flex justify-between"><span>Subtotal</span><span>{rs(o.subtotal)}</span></div>
                  {o.discountAmount > 0 && <div className="flex justify-between"><span>Discount</span><span>- {rs(o.discountAmount)}</span></div>}
                  {o.deliveryFee > 0 && <div className="flex justify-between"><span>Delivery</span><span>{rs(o.deliveryFee)}</span></div>}
                  <div className="flex justify-between font-black text-base"><span>Total bill</span><span>{rs(o.totalAmount)}</span></div>
                </div>
              </div>

              {o.collectCash ? (
                <div className="rounded-xl bg-red-50 border border-red-200 p-3 space-y-2">
                  <div className="font-black text-red-800">Collect {rs(o.amountToCollect)} in cash</div>
                  <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={!!cash[o.id]} onChange={(e) => setCash((p) => ({ ...p, [o.id]: e.target.checked }))} className="w-5 h-5 accent-red-700" /> I collected the cash</label>
                </div>
              ) : (
                <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-3 text-sm font-semibold text-emerald-800">Already paid ({PAYMENT_LABELS[o.paymentMethod] || o.paymentMethod}). Nothing to collect.</div>
              )}

              <button disabled={busyId === o.id || (o.collectCash && !cash[o.id])} onClick={() => deliver(o)}
                className="w-full flex items-center justify-center gap-2 bg-emerald-600 disabled:bg-zinc-300 text-white font-black rounded-xl py-4 text-base">
                {busyId === o.id ? <Loader2 className="animate-spin" size={18} /> : <CheckCircle2 size={18} />} Delivered{o.collectCash ? ' & cash received' : ''}
              </button>
            </article>
          ))}

          {data.recent.length > 0 && (
            <section className="pt-2">
              <h2 className="text-xs font-bold text-zinc-500 mb-2">DELIVERED BY YOU IN THE LAST 24 HOURS</h2>
              <ul className="bg-white rounded-2xl border divide-y text-sm">
                {data.recent.map((o) => (
                  <li key={o.id} className="p-3 flex justify-between gap-3">
                    <span><strong>{o.orderNumber}</strong> · {o.customerName}<span className="block text-xs text-zinc-500">{when(o.deliveredAt)}</span></span>
                    <span className="font-semibold shrink-0">{rs(o.totalAmount)}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}
