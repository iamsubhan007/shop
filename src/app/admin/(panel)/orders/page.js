'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Loader2, Pencil, Printer, Search, Trash2, X } from 'lucide-react';
import { api, rs, when, ago } from '@/components/admin/api';
import { ORDER_STATUSES, PAYMENT_LABELS, TERMINAL, nextStatuses, roleCanTransition, statusColor } from '@/lib/orderStatus';

const sel = 'border border-zinc-300 rounded-lg px-2.5 py-2 text-sm bg-white';

export default function OrdersAdmin() {
  const [f, setF] = useState({ q: '', status: '', type: '', payment: '', from: '', to: '' });
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const [openId, setOpenId] = useState(null);
  const [fresh, setFresh] = useState(new Set());
  const [selected, setSelected] = useState(new Set()); // finished orders ticked for deletion
  const [bulkMsg, setBulkMsg] = useState('');
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

  // Owner/admin can permanently delete finished (completed / cancelled / rejected) orders.
  const finished = (data?.orders || []).filter((o) => TERMINAL.includes(o.status));
  const toggle = (id) => setSelected((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const deleteSelected = async () => {
    const ids = [...selected];
    if (!ids.length || !confirm(`Permanently delete ${ids.length} finished order${ids.length === 1 ? '' : 's'}? This cannot be undone. Their payment screenshots are removed too.`)) return;
    setBulkMsg(''); setErr('');
    try {
      const r = await api('/api/admin/orders/delete', { method: 'POST', body: { ids } });
      setSelected(new Set()); setBulkMsg(`${r.deleted} order${r.deleted === 1 ? '' : 's'} deleted.`); await load();
    } catch (e) { setErr(e.message); }
  };

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
      ) : (<>
        {bulkMsg && <p role="status" className="text-sm text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg p-2.5">{bulkMsg}</p>}
        {finished.length > 0 && (
          <div className="flex flex-wrap items-center gap-3 text-xs">
            <button onClick={() => setSelected(new Set(finished.map((o) => o.id)))} className="underline text-zinc-600">Select all finished orders on this page</button>
            {selected.size > 0 && (<>
              <button onClick={() => setSelected(new Set())} className="underline text-zinc-500">Clear</button>
              <button onClick={deleteSelected} className="bg-red-700 text-white font-bold rounded-lg px-3 py-2 flex items-center gap-1.5"><Trash2 size={14} /> Delete {selected.size} selected</button>
            </>)}
          </div>
        )}
        <ul className="space-y-2">
          {data.orders.map((o) => (
            <li key={o.id} className="flex items-stretch gap-2">
              {TERMINAL.includes(o.status) && (
                <label className="flex items-center px-1" title="Select for deletion"><input type="checkbox" checked={selected.has(o.id)} onChange={() => toggle(o.id)} aria-label={`Select ${o.orderNumber} for deletion`} className="w-5 h-5 accent-red-700" /></label>
              )}
              <button onClick={() => { setOpenId(o.id); setFresh((p) => { const n = new Set(p); n.delete(o.id); return n; }); }}
                className={`flex-1 min-w-0 text-left bg-white rounded-2xl border p-4 hover:border-red-400 ${fresh.has(o.id) ? 'border-amber-400 ring-2 ring-amber-300' : 'border-zinc-200'}`}>
                <div className="flex flex-wrap justify-between gap-2">
                  <span className="font-bold">{o.orderNumber}{fresh.has(o.id) && <span className="ml-2 text-[10px] bg-amber-400 text-black rounded px-1.5 py-0.5">NEW</span>}</span>
                  <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full ${statusColor(o.status)}`}>{o.status}</span>
                </div>
                <div className="text-xs text-zinc-500 mt-1">{o.customerName} · {o.customerPhone} · {o.orderType} · {PAYMENT_LABELS[o.paymentMethod]} ({o.paymentStatus.replace(/_/g, ' ')}) · {ago(o.createdAt)} ago</div>
                <div className="text-xs text-zinc-600 mt-1 line-clamp-1">{o.items.map((i) => `${i.quantity}× ${i.title}`).join(', ')}</div>
                <div className="flex justify-between mt-1 text-xs"><span className="font-black text-sm">{rs(o.totalAmount)}{o.feedbackRating != null && <span className="ml-2 text-amber-600 font-semibold" title="Customer rating">★ {o.feedbackRating}/5</span>}</span>{o.notification && o.notification !== 'sent' && <span className="text-amber-700">WhatsApp: {o.notification}</span>}</div>
              </button>
            </li>
          ))}
        </ul>
      </>)}
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
  const [editing, setEditing] = useState(false);
  const [qty, setQty] = useState({}); // item id -> new quantity while editing (0 removes the item)
  const [adds, setAdds] = useState([]); // products being added: { productId, name, quantity }
  const [products, setProducts] = useState(null);
  const [pick, setPick] = useState('');
  const [pickQty, setPickQty] = useState(1);
  const [editNote, setEditNote] = useState('');
  const [info, setInfo] = useState('');
  const [etaMin, setEtaMin] = useState('');
  const [discType, setDiscType] = useState('amount');
  const [discVal, setDiscVal] = useState('');
  const [discNote, setDiscNote] = useState('');

  const load = useCallback(() => api(`/api/admin/orders/${id}`).then((d) => setO(d.order)).catch((e) => setErr(e.message)), [id]);
  useEffect(() => { load(); }, [load]);

  const act = async (body, confirmMsg) => {
    if (confirmMsg && !confirm(confirmMsg)) return;
    setBusy(true); setErr('');
    try { await api(`/api/admin/orders/${id}`, { method: 'PATCH', body }); await load(); } catch (e) { setErr(e.message); }
    setBusy(false);
  };

  // ---- owner/admin tools: edit the items on an order, delete a finished order
  const startEdit = async () => {
    setErr(''); setInfo(''); setQty(Object.fromEntries(o.items.map((i) => [i.id, i.quantity]))); setAdds([]); setEditNote(''); setEditing(true);
    if (!products) { try { setProducts((await api('/api/admin/products')).products); } catch (e) { setErr(e.message); } }
  };
  const addPick = () => {
    const p = products?.find((x) => x.id === pick);
    if (!p) return;
    setAdds((a) => [...a, { productId: p.id, name: p.name, quantity: Math.max(1, Math.min(50, Number(pickQty) || 1)) }]);
    setPick(''); setPickQty(1);
  };
  const saveEdit = async () => {
    const changes = o.items.filter((i) => Number(qty[i.id]) !== i.quantity).map((i) => ({ itemId: i.id, quantity: Math.max(0, Number(qty[i.id]) || 0) }));
    if (!changes.length && !adds.length) { setEditing(false); return; }
    setBusy(true); setErr('');
    try {
      const r = await api(`/api/admin/orders/${id}`, { method: 'PATCH', body: { action: 'items', changes, add: adds.map((a) => ({ productId: a.productId, quantity: a.quantity })), note: editNote || undefined } });
      setInfo(`Order updated. New total ${rs(r.totalAmount)}.${r.paymentNote ? ` ${r.paymentNote}` : ''}`);
      setEditing(false); await load();
    } catch (e) { setErr(e.message); }
    setBusy(false);
  };
  // ---- owner/admin: a countdown for the customer, and a discount on this order
  const etaLeft = (d) => { const m = Math.ceil((new Date(d).getTime() - Date.now()) / 60000); return m > 0 ? `${m} min left` : 'time is up'; };
  const setEta = async (minutes) => {
    setBusy(true); setErr(''); setInfo('');
    try { await api(`/api/admin/orders/${id}`, { method: 'PATCH', body: { action: 'eta', minutes } }); setInfo(minutes == null ? 'Timer cleared.' : `Timer set: ${minutes} min. The customer can see the time left.`); setEtaMin(''); await load(); } catch (e) { setErr(e.message); }
    setBusy(false);
  };
  const applyDiscount = async (clear = false) => {
    const value = clear ? 0 : Number(discVal);
    if (!clear && !(value > 0)) return setErr('Enter a discount greater than 0.');
    setBusy(true); setErr(''); setInfo('');
    try {
      const r = await api(`/api/admin/orders/${id}`, { method: 'PATCH', body: { action: 'discount', type: discType, value, note: discNote || undefined } });
      setInfo(`${clear ? 'Discount removed' : 'Discount saved'}. New total ${rs(r.totalAmount)}.${r.paymentNote ? ` ${r.paymentNote}` : ''}`);
      setDiscVal(''); setDiscNote(''); await load();
    } catch (e) { setErr(e.message); }
    setBusy(false);
  };
  const del = async () => {
    if (!confirm(`Permanently delete ${o.orderNumber}? This cannot be undone. Its payment screenshot is removed too.`)) return;
    setBusy(true); setErr('');
    try { await api('/api/admin/orders/delete', { method: 'POST', body: { ids: [id] } }); onClose(); } catch (e) { setErr(e.message); setBusy(false); }
  };

  if (!o) return <div className="fixed inset-0 z-[70] bg-black/50 flex items-center justify-center"><Loader2 className="animate-spin text-white" /></div>;
  // Owner/admin can accept and fulfil an order, cancel it (with a reason), or force it to Completed from any step.
  // Kitchen and riders never see these buttons; the server refuses them too. Nobody on staff rejects orders.
  const live = !TERMINAL.includes(o.status);
  const base = nextStatuses(o.status, o.orderType)
    .filter((s) => roleCanTransition('admin', o.status, s))
    .filter((s) => !(s === 'Confirmed' && o.paymentMethod !== 'cod' && o.paymentStatus !== 'verified'));
  const extra = live ? ['Completed', 'Cancelled'].filter((s) => !base.includes(s) && !(s === 'Completed' && o.paymentMethod !== 'cod' && o.paymentStatus !== 'verified')) : [];
  const next = [...base, ...extra];
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
        {info && <p role="status" className="text-sm bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg p-2.5">{info}</p>}

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
          {!editing ? (<>
            <ul className="divide-y text-sm">{o.items.map((i) => <li key={i.id} className="py-1.5 flex justify-between"><span>{i.quantity} × {i.itemTitle}</span><span>{rs(i.subtotalPrice)}</span></li>)}</ul>
            <div className="text-sm border-t mt-1 pt-1 space-y-0.5">
              <div className="flex justify-between"><span>Subtotal</span><span>{rs(o.subtotal)}</span></div>
              {Number(o.discountAmount) > 0 && <div className="flex justify-between"><span>Discount</span><span>- {rs(o.discountAmount)}</span></div>}
              {Number(o.deliveryFee) > 0 && <div className="flex justify-between"><span>Delivery</span><span>{rs(o.deliveryFee)}</span></div>}
              <div className="flex justify-between font-black"><span>Total</span><span>{rs(o.totalAmount)}</span></div>
            </div>
            {live && <button onClick={startEdit} className="print:hidden mt-2 flex items-center gap-1.5 text-xs font-bold border rounded-lg px-3 py-2 bg-white"><Pencil size={13} /> Edit items</button>}
          </>) : (
            <div className="space-y-2 print:hidden" data-testid="edit-items">
              <h3 className="text-xs font-bold text-zinc-500">EDIT ITEMS (set a quantity to 0 to remove an item)</h3>
              {o.items.map((i) => (
                <div key={i.id} className="flex items-center gap-2 text-sm">
                  <span className="flex-1">{i.itemTitle} <span className="text-xs text-zinc-400">{rs(i.unitPrice)} each</span></span>
                  <input type="number" min="0" max="50" value={qty[i.id] ?? i.quantity} onChange={(e) => setQty((p) => ({ ...p, [i.id]: e.target.value }))} aria-label={`Quantity of ${i.itemTitle}`} className="w-16 border rounded-lg px-2 py-1.5 text-sm" />
                </div>
              ))}
              {adds.map((a, k) => (
                <div key={k} className="flex items-center gap-2 text-sm bg-emerald-50 rounded-lg px-2 py-1.5"><span className="flex-1">+ {a.quantity} × {a.name}</span><button onClick={() => setAdds(adds.filter((_, j) => j !== k))} className="text-xs underline">remove</button></div>
              ))}
              <div className="flex gap-2">
                <select value={pick} onChange={(e) => setPick(e.target.value)} aria-label="Add an item" className="flex-1 min-w-0 border rounded-lg px-2 py-2 text-sm"><option value="">Add an item…</option>{products?.map((p) => <option key={p.id} value={p.id}>{p.name} — {rs(p.price)}</option>)}</select>
                <input type="number" min="1" max="50" value={pickQty} onChange={(e) => setPickQty(e.target.value)} aria-label="Quantity to add" className="w-16 border rounded-lg px-2 py-2 text-sm" />
                <button onClick={addPick} className="border rounded-lg px-3 text-sm font-bold bg-white">Add</button>
              </div>
              <input value={editNote} onChange={(e) => setEditNote(e.target.value)} placeholder="Reason (optional)" className="w-full border rounded-lg px-3 py-2 text-sm" />
              <div className="flex gap-2">
                <button disabled={busy} onClick={saveEdit} className="bg-red-700 text-white font-bold rounded-xl px-4 py-2.5 text-sm">Save changes</button>
                <button onClick={() => setEditing(false)} className="border rounded-xl px-4 py-2.5 text-sm font-semibold bg-white">Cancel</button>
              </div>
              <p className="text-[11px] text-zinc-400">The total is recalculated. The delivery fee and any coupon discount stay as they were. Stock is adjusted for items that track it.</p>
            </div>
          )}
        </section>

        {o.feedback && (
          <section data-testid="order-feedback" className="rounded-xl bg-amber-50 border border-amber-200 p-3 text-sm">
            <div className="font-bold">Customer feedback: <span className="text-amber-600">{'★'.repeat(o.feedback.rating)}{'☆'.repeat(5 - o.feedback.rating)}</span> <span className="text-xs font-normal text-zinc-500">({o.feedback.rating}/5)</span></div>
            {o.feedback.comment && <p className="mt-1 text-zinc-700">{o.feedback.comment}</p>}
          </section>
        )}

        {live && (
          <section className="print:hidden space-y-4" data-testid="timer-discount">
            <div>
              <h3 className="text-xs font-bold text-zinc-500 mb-2">TIMER FOR THE CUSTOMER {o.etaAt && <span className="font-normal">(now: {etaLeft(o.etaAt)})</span>}</h3>
              <div className="flex flex-wrap gap-2 items-center">
                {[10, 15, 20, 30, 45, 60].map((m) => <button key={m} disabled={busy} onClick={() => setEta(m)} className="px-3 py-2 rounded-lg border text-sm font-semibold bg-white">{m} min</button>)}
                <input type="number" min="1" max="480" value={etaMin} onChange={(e) => setEtaMin(e.target.value)} placeholder="min" aria-label="Custom minutes" className="w-20 border rounded-lg px-2 py-2 text-sm" />
                <button disabled={busy || !etaMin} onClick={() => setEta(Number(etaMin))} className="px-3 py-2 rounded-lg border text-sm font-bold bg-white disabled:opacity-50">Set</button>
                {o.etaAt && <button disabled={busy} onClick={() => setEta(null)} className="px-2 py-2 text-sm underline text-zinc-500">Clear</button>}
              </div>
            </div>
            <div>
              <h3 className="text-xs font-bold text-zinc-500 mb-2">DISCOUNT ON THIS ORDER {Number(o.manualDiscount) > 0 && <span className="font-normal">(admin discount now: {rs(o.manualDiscount)})</span>}</h3>
              <div className="flex flex-wrap gap-2 items-center">
                <select value={discType} onChange={(e) => setDiscType(e.target.value)} aria-label="Discount type" className="border rounded-lg px-2 py-2 text-sm bg-white"><option value="amount">Rs.</option><option value="percent">%</option></select>
                <input type="number" min="0" value={discVal} onChange={(e) => setDiscVal(e.target.value)} placeholder={discType === 'percent' ? 'percent' : 'amount'} aria-label="Discount value" className="w-24 border rounded-lg px-2 py-2 text-sm" />
                <input value={discNote} onChange={(e) => setDiscNote(e.target.value)} placeholder="Reason (optional)" className="flex-1 min-w-[8rem] border rounded-lg px-3 py-2 text-sm" />
                <button disabled={busy} onClick={() => applyDiscount(false)} className="px-4 py-2 rounded-lg bg-red-700 text-white text-sm font-bold">Apply</button>
                {Number(o.manualDiscount) > 0 && <button disabled={busy} onClick={() => applyDiscount(true)} className="px-2 py-2 text-sm underline text-zinc-500">Remove</button>}
              </div>
              <p className="text-[11px] text-zinc-400 mt-1">Works before or after the order is confirmed, for pickup and delivery. It comes off the items (not the delivery fee) and shows on the customer&apos;s bill. Applying a new one replaces the previous admin discount.</p>
            </div>
          </section>
        )}

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
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (required to cancel)" className="w-full border rounded-lg px-3 py-2 text-sm mb-2" />
            <div className="flex flex-wrap gap-2">
              {next.map((s) => {
                const cancel = s === 'Cancelled';
                const forced = s === 'Completed' && !['Ready for Pickup', 'Out for Delivery'].includes(o.status);
                return (
                  <button key={s} disabled={busy}
                    onClick={() => {
                      if (cancel && !note.trim()) return setErr('Please write a reason in the note box before cancelling.');
                      act({ action: 'status', status: s, note: note || undefined }, cancel ? 'Really cancel this order? Stock is put back.' : forced ? `Mark this order as completed even though it is "${o.status}"?` : null);
                    }}
                    className={`px-4 py-2.5 rounded-xl text-sm font-bold ${cancel ? 'bg-white border border-red-300 text-red-700' : 'bg-red-700 text-white'}`}>
                    {s === 'Confirmed' ? 'Accept order' : cancel ? 'Cancel order' : forced ? 'Mark completed' : s}
                  </button>
                );
              })}
            </div>
            <p className="text-[11px] text-zinc-400 mt-2">Only the owner and admin can cancel an order or complete it out of turn. The customer can also cancel until it is accepted.</p>
          </section>
        )}

        {!live && (
          <section className="print:hidden">
            <button disabled={busy} onClick={del} className="flex items-center gap-2 text-red-700 border border-red-300 rounded-xl px-4 py-2.5 text-sm font-bold bg-white"><Trash2 size={15} /> Delete this order</button>
            <p className="text-[11px] text-zinc-400 mt-1">Finished orders only. This cannot be undone.</p>
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
