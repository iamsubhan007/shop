'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Loader2, Printer, Search, X } from 'lucide-react';
import { api, rs, when, ago } from '@/components/admin/api';
import { ORDER_STATUSES, PAYMENT_LABELS, nextStatuses, roleCanTransition, statusColor } from '@/lib/orderStatus';

const sel = 'border border-zinc-300 rounded-lg px-2.5 py-2 text-sm bg-white';

export default function OrdersAdmin() {
  const [f, setF] = useState({ q: '', status: '', type: '', payment: '', from: '', to: '' });
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const [openId, setOpenId] = useState(null);
  const [fresh, setFresh] = useState(new Set());
  const seen = useRef(null);

  // The new-order alert links here with ?open=<order id>.
  const searchParams = useSearchParams();
  const openFromLink = searchParams.get('open');
  useEffect(() => { if (openFromLink) setOpenId(openFromLink); }, [openFromLink]);

  const load = useCallback(async () => {
    try {
      const q = new URLSearchParams({ ...Object.fromEntries(Object.entries(f).filter(([, v]) => v)), page });
      const d = await api(`/api/admin/orders?${q}`);
      setData(d);
      setErr('');
      const ids = new Set(d.orders.map((o) => o.id));
      if (seen.current) {
        const added = [...ids].filter((i) => !seen.current.has(i));
        if (added.length) setFresh((p) => new Set([...p, ...added]));
      }
      seen.current = ids;
    } catch (e) { setErr(e.message); }
  }, [f, page]);

  useEffect(() => { const t = setTimeout(load, f.q ? 300 : 0); return () => clearTimeout(t); }, [load, f.q]);
  useEffect(() => { const t = setInterval(load, 15000); return () => clearInterval(t); }, [load]);

  const set = (k, v) => { setPage(1); seen.current = null; setF((p) => ({ ...p, [k]: v })); };

  return (
    <div className="max-w-6xl mx-auto space-y-4">
      <h1 className="text-2xl font-black">Orders</h1>
      <div className="flex flex-wrap gap-2">
        <div className="relative"><Search size={14} className="absolute left-2.5 top-3 text-zinc-400" /><input value={f.q} onChange={(e) => set('q', e.target.value)} placeholder="Order #, name or phone" className={`${sel} pl-8`} aria-label="Search orders" /></div>
        <select className={sel} value={f.status} onChange={(e) => set('status', e.target.value)} aria-label="Status"><option value="">All statuses</option>{ORDER_STATUSES.map((s) => <option key={s}>{s}</option>)}</select>
        <select className={sel} value={f.type} onChange={(e) => set('type', e.target.value)} aria-label="Type"><option value="">Pickup & delivery</option><option value="pickup">Pickup</option><option value="delivery">Delivery</option></select>
        <select className={sel} value={f.payment} onChange={(e) => set('payment', e.target.value)} aria-label="Payment"><option value="">All payments</option>{Object.entries(PAYMENT_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        <input type="date" className={sel} value={f.from} onChange={(e) => set('from', e.target.value)} aria-label="From date" />
        <input type="date" className={sel} value={f.to} onChange={(e) => set('to', e.target.value)} aria-label="To date" />
      </div>
      {err && <p role="alert" className="text-red-700 text-sm">{err}</p>}
      {!data ? <Loader2 className="animate-spin text-zinc-400" /> : data.orders.length === 0 ? (
        <p className="text-sm text-zinc-500 bg-white rounded-2xl border p-8 text-center">No orders match. New orders will appear here automatically.</p>
      ) : (
        <ul className="space-y-2">
          {data.orders.map((o) => (
            <li key={o.id}>
              <button onClick={() => { setOpenId(o.id); setFresh((p) => { const n = new Set(p); n.delete(o.id); return n; }); }}
                className={`w-full text-left bg-white rounded-2xl border p-4 hover:border-red-400 ${fresh.has(o.id) ? 'border-amber-400 ring-2 ring-amber-300' : 'border-zinc-200'}`}>
                <div className="flex flex-wrap justify-between gap-2">
                  <span className="font-bold">{o.orderNumber}{fresh.has(o.id) && <span className="ml-2 text-[10px] bg-amber-400 text-black rounded px-1.5 py-0.5">NEW</span>}</span>
                  <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full ${statusColor(o.status)}`}>{o.status}</span>
                </div>
                <div className="text-xs text-zinc-500 mt-1">{o.customerName} · {o.customerPhone} · {o.orderType} · {PAYMENT_LABELS[o.paymentMethod]} ({o.paymentStatus.replace(/_/g, ' ')}) · {ago(o.createdAt)} ago</div>
                <div className="text-xs text-zinc-600 mt-1 line-clamp-1">{o.items.map((i) => `${i.quantity}× ${i.title}`).join(', ')}</div>
                <div className="flex justify-between mt-1 text-xs"><span className="font-black text-sm">{rs(o.totalAmount)}</span>{o.notification && o.notification !== 'sent' && <span className="text-amber-700">WhatsApp: {o.notification}</span>}</div>
              </button>
            </li>
          ))}
        </ul>
      )}
      {data && data.pages > 1 && (
        <div className="flex items-center gap-3 text-sm justify-center">
          <button disabled={page <= 1} onClick={() => setPage(page - 1)} className="px-3 py-1.5 border rounded-lg disabled:opacity-40">Previous</button>
          <span>Page {page} of {data.pages}</span>
          <button disabled={page >= data.pages} onClick={() => setPage(page + 1)} className="px-3 py-1.5 border rounded-lg disabled:opacity-40">Next</button>
        </div>
      )}
      {openId && <Detail id={openId} onClose={() => { setOpenId(null); load(); }} />}
    </div>
  );
}

function Detail({ id, onClose }) {
  const [o, setO] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const [copied, setCopied] = useState(false);

  const load = useCallback(() => api(`/api/admin/orders/${id}`).then((d) => setO(d.order)).catch((e) => setErr(e.message)), [id]);
  useEffect(() => { load(); }, [load]);

  const act = async (body, confirmMsg) => {
    if (confirmMsg && !confirm(confirmMsg)) return;
    setBusy(true); setErr('');
    try { await api(`/api/admin/orders/${id}`, { method: 'PATCH', body }); await load(); } catch (e) { setErr(e.message); }
    setBusy(false);
  };

  if (!o) return <div className="fixed inset-0 z-[70] bg-black/50 flex items-center justify-center"><Loader2 className="animate-spin text-white" /></div>;
  // Staff can accept and fulfil an order but never cancel or reject it (only the customer can cancel, before acceptance).
  const next = nextStatuses(o.status, o.orderType)
    .filter((s) => roleCanTransition('admin', o.status, s))
    .filter((s) => !(s === 'Confirmed' && o.paymentMethod !== 'cod' && o.paymentStatus !== 'verified'));
  const proof = o.paymentProofUrl;
  const phoneIntl = `92${o.customerPhone.replace(/^0/, '')}`;

  return (
    <div className="fixed inset-0 z-[70] bg-black/50 flex justify-end print:static print:bg-white" role="dialog" aria-modal="true" aria-label={`Order ${o.orderNumber}`}>
      <div className="w-full max-w-lg bg-white h-full overflow-y-auto p-5 space-y-4 print:max-w-none">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-black">{o.orderNumber}</h2>
          <div className="flex gap-2 print:hidden">
            <a href={`/api/admin/orders/${o.id}/receipt`} target="_blank" rel="noreferrer" aria-label="Download receipt PDF" className="p-2 border rounded-lg text-xs font-bold">PDF</a>
            <button onClick={() => window.print()} aria-label="Print" className="p-2 border rounded-lg"><Printer size={16} /></button>
            <button onClick={onClose} aria-label="Close" className="p-2 border rounded-lg"><X size={16} /></button>
          </div>
        </div>
        <div className="flex gap-2 items-center"><span className={`text-xs font-bold px-3 py-1 rounded-full ${statusColor(o.status)}`}>{o.status}</span><span className="text-xs text-zinc-500">{when(o.createdAt)}</span></div>
        {err && <p role="alert" className="text-sm text-red-700 bg-red-50 rounded-lg p-2.5">{err}</p>}

        <section className="text-sm space-y-0.5">
          <div className="font-bold">{o.customerName}</div>
          <div>{o.customerPhone} · {o.customerEmail}</div>
          <div className="flex gap-3 print:hidden"><a className="text-emerald-700 font-semibold" target="_blank" rel="noreferrer" href={`https://wa.me/${phoneIntl}?text=${encodeURIComponent(`Hello ${o.customerName}, this is Haq Bahu Tandoor about order ${o.orderNumber}.`)}`}>WhatsApp customer</a><a className="text-red-700 font-semibold" href={`tel:${o.customerPhone}`}>Call</a></div>
          {o.orderType === 'delivery' ? (
            <div className="pt-1">Deliver to: {o.deliveryAddress} <a className="text-red-700 underline" target="_blank" rel="noreferrer" href={`https://www.google.com/maps?q=${o.deliveryLat},${o.deliveryLng}`}>Map</a> ({Math.round(Number(o.distanceKm) * 1000)} m)</div>
          ) : <div className="pt-1">Customer will pick up</div>}
          {o.specialInstructions && <div className="bg-amber-50 border border-amber-200 rounded-lg p-2 mt-1">Note: {o.specialInstructions}</div>}
        </section>

        <section>
          <ul className="divide-y text-sm">{o.items.map((i) => <li key={i.id} className="py-1.5 flex justify-between"><span>{i.quantity} × {i.itemTitle}</span><span>{rs(i.subtotalPrice)}</span></li>)}</ul>
          <div className="text-sm border-t mt-1 pt-1 space-y-0.5">
            <div className="flex justify-between"><span>Subtotal</span><span>{rs(o.subtotal)}</span></div>
            {Number(o.discountAmount) > 0 && <div className="flex justify-between"><span>Discount</span><span>- {rs(o.discountAmount)}</span></div>}
            {Number(o.deliveryFee) > 0 && <div className="flex justify-between"><span>Delivery</span><span>{rs(o.deliveryFee)}</span></div>}
            <div className="flex justify-between font-black"><span>Total</span><span>{rs(o.totalAmount)}</span></div>
          </div>
        </section>

        <section className="text-sm bg-zinc-50 rounded-xl p-3 space-y-2">
          <div><strong>{PAYMENT_LABELS[o.paymentMethod]}</strong> — payment: <strong>{o.paymentStatus.replace(/_/g, ' ')}</strong></div>
          {o.paymentMethod === 'cod' && <div className="text-xs text-zinc-500">Cash is collected by the rider; it is marked collected when you complete the order.</div>}
          {o.payments.map((p) => (
            <div key={p.id} className="text-xs border-t pt-2">
              Ref: <strong>{p.transactionReference}</strong> · {p.status}{p.adminNotes ? ` · ${p.adminNotes}` : ''}
              {p.proofImageUrl && <a href={`/api/files/proof/${p.proofImageUrl}`} target="_blank" rel="noreferrer" className="block mt-1"><img src={`/api/files/proof/${p.proofImageUrl}`} alt="Payment proof" className="max-h-56 rounded-lg border" /></a>}
            </div>
          ))}
          {o.paymentStatus === 'submitted' && (
            <div className="flex gap-2 print:hidden">
              <button disabled={busy} onClick={() => act({ action: 'payment', decision: 'verify' }, 'Mark this payment as received and confirm the order?')} className="flex-1 bg-emerald-600 text-white font-bold py-2.5 rounded-xl">Payment received ✓</button>
              <button disabled={busy} onClick={() => { const n = prompt('Why is the payment rejected? (customer can resubmit)'); if (n) act({ action: 'payment', decision: 'reject', notes: n }); }} className="flex-1 bg-white border border-red-300 text-red-700 font-bold py-2.5 rounded-xl">Reject</button>
            </div>
          )}
        </section>

        {next.length > 0 && (
          <section className="print:hidden">
            <h3 className="text-xs font-bold text-zinc-500 mb-2">MOVE ORDER TO</h3>
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional)" className="w-full border rounded-lg px-3 py-2 text-sm mb-2" />
            <div className="flex flex-wrap gap-2">
              {next.map((s) => (
                <button key={s} disabled={busy} onClick={() => act({ action: 'status', status: s, note: note || undefined })}
                  className="px-4 py-2.5 rounded-xl text-sm font-bold bg-red-700 text-white">{s === 'Confirmed' ? 'Accept order' : s}</button>
              ))}
            </div>
            <p className="text-[11px] text-zinc-400 mt-2">Once an order is placed it cannot be cancelled by the shop. Only the customer can cancel it, before it is accepted.</p>
          </section>
        )}

        <section className="text-xs bg-zinc-50 rounded-xl p-3 print:hidden">
          {o.whatsappConfigured ? (
            <>
              <div className="font-bold mb-1">Owner WhatsApp notification: {o.notification?.status || 'none'}</div>
              {o.notification?.lastError && <div className="text-red-700 mb-1">{o.notification.lastError}</div>}
            </>
          ) : (
            <div className="text-zinc-500 mb-2">Automatic WhatsApp alerts are off. To pass this order on yourself, share it or copy the text.</div>
          )}
          <div className="flex flex-wrap gap-2">
            {o.whatsappConfigured && <button disabled={busy} onClick={() => act({ action: 'retry_notification' })} className="px-3 py-1.5 border rounded-lg bg-white">Retry sending</button>}
            <a href={`https://wa.me/?text=${encodeURIComponent(o.waText)}`} target="_blank" rel="noreferrer" className="px-3 py-1.5 border rounded-lg bg-emerald-600 text-white font-semibold">Share on WhatsApp</a>
            <button onClick={() => { navigator.clipboard.writeText(o.waText); setCopied(true); setTimeout(() => setCopied(false), 1500); }} className="px-3 py-1.5 border rounded-lg bg-white">{copied ? 'Copied ✓' : 'Copy order text'}</button>
          </div>
        </section>

        <section className="text-xs text-zinc-500">
          <div className="font-bold mb-1">History</div>
          {o.history.map((h) => <div key={h.id}>{when(h.createdAt)} — {h.toStatus}{h.note ? ` (${h.note})` : ''}</div>)}
        </section>
      </div>
    </div>
  );
}
