'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2, Plus, Trash2, X } from 'lucide-react';
import { api, rs } from '@/components/admin/api';
import { prepareImage } from '@/lib/compressImage';

const field = 'w-full border border-zinc-300 rounded-lg px-3 py-2 text-sm';
const local = (d) => (d ? new Date(d).toISOString().slice(0, 16) : '');

export default function DealsAdmin() {
  const [deals, setDeals] = useState(null);
  const [products, setProducts] = useState([]);
  const [edit, setEdit] = useState(null);
  const [msg, setMsg] = useState('');

  const load = useCallback(async () => {
    try { const [d, p] = await Promise.all([api('/api/admin/deals'), api('/api/admin/products')]); setDeals(d.deals); setProducts(p.products); } catch (e) { setMsg(e.message); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const patch = async (id, body) => { try { await api(`/api/admin/deals/${id}`, { method: 'PATCH', body }); load(); } catch (e) { setMsg(e.message); } };
  const del = async (d) => { if (!confirm(`Delete deal "${d.title}"?`)) return; try { await api(`/api/admin/deals/${d.id}`, { method: 'DELETE' }); load(); } catch (e) { setMsg(e.message); } };

  if (!deals) return <Loader2 className="animate-spin text-zinc-400" />;
  return (
    <div className="max-w-4xl mx-auto space-y-4">
      <div className="flex justify-between items-center"><h1 className="text-2xl font-black">Deals</h1><button onClick={() => setEdit({})} className="flex items-center gap-2 bg-red-700 text-white font-bold px-4 py-2.5 rounded-xl text-sm"><Plus size={16} /> Add deal</button></div>
      {msg && <p role="alert" className="text-sm text-red-700 bg-red-50 rounded-lg p-3">{msg}</p>}
      <ul className="space-y-2">
        {deals.map((d) => (
          <li key={d.id} className="bg-white rounded-2xl border p-3 flex flex-wrap items-center gap-3">
            <div className="flex-1 min-w-[200px]"><div className="font-bold text-sm">{d.title} {d.isFeatured && <span className="text-[10px] bg-amber-200 rounded px-1.5">FEATURED</span>}</div>
              <div className="text-xs text-zinc-500">{rs(d.price)}{d.originalPrice && <s className="ml-1">{rs(d.originalPrice)}</s>} · {(d.items || []).join(', ') || 'no items listed'}{d.endsAt && ` · ends ${new Date(d.endsAt).toLocaleDateString('en-PK')}`}</div></div>
            <label className="flex items-center gap-1.5 text-xs"><input type="checkbox" checked={!!d.isActive} onChange={(e) => patch(d.id, { isActive: e.target.checked })} className="w-5 h-5 accent-emerald-600" /> Active</label>
            <button onClick={() => setEdit(d)} className="px-3 py-2 border rounded-lg text-xs font-semibold">Edit</button>
            <button onClick={() => del(d)} aria-label={`Delete ${d.title}`} className="p-2 text-red-600"><Trash2 size={16} /></button>
          </li>
        ))}
        {!deals.length && <p className="text-sm text-zinc-500 bg-white border rounded-2xl p-8 text-center">No deals yet.</p>}
      </ul>
      {edit && <DealForm deal={edit} products={products} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); load(); }} />}
    </div>
  );
}

function DealForm({ deal, products, onClose, onSaved }) {
  const isNew = !deal.id;
  const [f, setF] = useState({ title: deal.title || '', description: deal.description || '', price: deal.price ?? '', badge: deal.badge || '', imageUrl: deal.imageUrl || '', isFeatured: !!deal.isFeatured, isActive: deal.isActive ?? true, startsAt: local(deal.startsAt), endsAt: local(deal.endsAt) });
  const [parts, setParts] = useState(deal.parts || []);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));
  const value = parts.reduce((s, p) => s + (Number(products.find((x) => x.id === p.productId)?.price) || 0) * p.quantity, 0);

  const upload = async (file) => {
    try {
      const fd = new FormData(); fd.append('file', await prepareImage(file));
      const res = await fetch('/api/admin/upload', { method: 'POST', body: fd });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) return setErr(j.error || (res.status === 413 ? 'That image is too large. Please choose a smaller one.' : 'Upload failed. Please try again.'));
      set('imageUrl', j.url);
    } catch { setErr('Upload failed. Check the connection and try again.'); }
  };

  const save = async (e) => {
    e.preventDefault(); setBusy(true); setErr('');
    const body = { title: f.title, description: f.description || null, price: Number(f.price), badge: f.badge || null, imageUrl: f.imageUrl || null, isFeatured: f.isFeatured, isActive: f.isActive,
      startsAt: f.startsAt ? new Date(f.startsAt).toISOString() : null, endsAt: f.endsAt ? new Date(f.endsAt).toISOString() : null, items: parts.filter((p) => p.productId) };
    try { await api(isNew ? '/api/admin/deals' : `/api/admin/deals/${deal.id}`, { method: isNew ? 'POST' : 'PATCH', body }); onSaved(); } catch (e2) { setErr(e2.message); setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-[70] bg-black/50 flex items-center justify-center p-3" role="dialog" aria-modal="true">
      <form onSubmit={save} className="bg-white rounded-2xl w-full max-w-lg max-h-[92vh] overflow-y-auto p-5 space-y-3">
        <div className="flex justify-between"><h2 className="font-black text-lg">{isNew ? 'Add deal' : 'Edit deal'}</h2><button type="button" onClick={onClose} aria-label="Close"><X /></button></div>
        {err && <p role="alert" className="text-sm text-red-700 bg-red-50 rounded-lg p-2.5">{err}</p>}
        <label className="block text-xs font-semibold">Deal name<input required value={f.title} onChange={(e) => set('title', e.target.value)} className={field} /></label>
        <label className="block text-xs font-semibold">Description<textarea rows={2} value={f.description} onChange={(e) => set('description', e.target.value)} className={field} /></label>
        <fieldset className="border rounded-xl p-3 space-y-2"><legend className="text-xs font-bold px-1">What is included</legend>
          {parts.map((p, i) => (
            <div key={i} className="flex gap-2">
              <select value={p.productId} onChange={(e) => setParts(parts.map((x, k) => (k === i ? { ...x, productId: e.target.value } : x)))} className={field}><option value="">Choose item…</option>{products.map((x) => <option key={x.id} value={x.id}>{x.name} ({rs(x.price)})</option>)}</select>
              <input type="number" min="1" value={p.quantity} onChange={(e) => setParts(parts.map((x, k) => (k === i ? { ...x, quantity: Number(e.target.value) } : x)))} className={field + ' w-20'} aria-label="Quantity" />
              <button type="button" onClick={() => setParts(parts.filter((_, k) => k !== i))} aria-label="Remove" className="text-red-600"><X size={16} /></button>
            </div>
          ))}
          <button type="button" onClick={() => setParts([...parts, { productId: '', quantity: 1 }])} className="text-xs font-semibold underline">+ Add item</button>
          {parts.length > 0 && <p className="text-xs text-zinc-500">Value if bought separately: <strong>{rs(value)}</strong>{f.price && value > 0 && <> · customer saves <strong>{rs(Math.max(0, value - Number(f.price)))}</strong></>}</p>}
        </fieldset>
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-xs font-semibold">Deal price (Rs.)<input required type="number" min="1" value={f.price} onChange={(e) => set('price', e.target.value)} className={field} /></label>
          <label className="block text-xs font-semibold">Badge (optional)<input value={f.badge} onChange={(e) => set('badge', e.target.value)} className={field} maxLength={30} /></label>
          <label className="block text-xs font-semibold">Starts<input type="datetime-local" value={f.startsAt} onChange={(e) => set('startsAt', e.target.value)} className={field} /></label>
          <label className="block text-xs font-semibold">Ends<input type="datetime-local" value={f.endsAt} onChange={(e) => set('endsAt', e.target.value)} className={field} /></label>
        </div>
        <div className="text-xs font-semibold">Picture<div className="flex items-center gap-3 mt-1">{f.imageUrl && <img src={f.imageUrl} alt="" className="w-16 h-16 rounded-lg object-cover border" />}<input type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} /></div></div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.isFeatured} onChange={(e) => set('isFeatured', e.target.checked)} className="w-5 h-5" /> Featured</label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.isActive} onChange={(e) => set('isActive', e.target.checked)} className="w-5 h-5" /> Active</label>
        <button disabled={busy} className="w-full bg-red-700 text-white font-bold py-3 rounded-xl disabled:opacity-60">{busy ? 'Saving…' : 'Save'}</button>
      </form>
    </div>
  );
}
