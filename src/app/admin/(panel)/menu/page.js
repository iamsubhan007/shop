'use client';

import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Loader2, Plus, Search, Trash2, X } from 'lucide-react';
import { api, rs } from '@/components/admin/api';
import { prepareImage } from '@/lib/compressImage';

const field = 'w-full border border-zinc-300 rounded-lg px-3 py-2 text-sm';

export default function MenuAdmin() {
  const [products, setProducts] = useState(null);
  const [cats, setCats] = useState([]);
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('');
  const [edit, setEdit] = useState(null); // product or {} for new
  const [catName, setCatName] = useState('');
  const [msg, setMsg] = useState({ type: '', text: '' });

  const load = useCallback(async () => {
    try {
      const [p, c] = await Promise.all([api('/api/admin/products'), api('/api/admin/categories')]);
      setProducts(p.products); setCats(c.categories);
    } catch (e) { setMsg({ type: 'err', text: e.message }); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const flash = (type, text) => { setMsg({ type, text }); setTimeout(() => setMsg({ type: '', text: '' }), 4000); };
  const patch = async (id, body, ok = 'Saved') => { try { await api(`/api/admin/products/${id}`, { method: 'PATCH', body }); flash('ok', ok); load(); } catch (e) { flash('err', e.message); } };
  const del = async (p) => { if (!confirm(`Delete "${p.name}"? Old orders keep their records.`)) return; try { await api(`/api/admin/products/${p.id}`, { method: 'DELETE' }); flash('ok', 'Deleted'); load(); } catch (e) { flash('err', e.message); } };
  const addCat = async () => { if (!catName.trim()) return; try { await api('/api/admin/categories', { method: 'POST', body: { name: catName } }); setCatName(''); load(); } catch (e) { flash('err', e.message); } };
  const catPatch = async (id, body) => { try { await api(`/api/admin/categories/${id}`, { method: 'PATCH', body }); load(); } catch (e) { flash('err', e.message); } };
  const catDel = async (c) => { if (!confirm(`Delete category "${c.name}"?`)) return; try { await api(`/api/admin/categories/${c.id}`, { method: 'DELETE' }); load(); } catch (e) { flash('err', e.message); } };

  if (!products) return <Loader2 className="animate-spin text-zinc-400" />;
  const shown = products.filter((p) => (!cat || p.categoryId === cat) && p.name.toLowerCase().includes(q.toLowerCase()));
  const low = products.filter((p) => p.trackStock && p.stockQty <= p.lowStockThreshold);

  return (
    <div className="max-w-6xl mx-auto space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-black">Menu & Stock</h1>
        <button onClick={() => setEdit({})} className="flex items-center gap-2 bg-red-700 text-white font-bold px-4 py-2.5 rounded-xl text-sm"><Plus size={16} /> Add product</button>
      </div>
      {msg.text && <p role={msg.type === 'err' ? 'alert' : 'status'} className={`text-sm rounded-lg p-3 ${msg.type === 'err' ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-800'}`}>{msg.text}</p>}
      {low.length > 0 && <div className="flex gap-2 text-sm bg-amber-50 border border-amber-200 rounded-xl p-3"><AlertTriangle size={16} className="text-amber-600 shrink-0 mt-0.5" /><span><strong>Low stock:</strong> {low.map((p) => `${p.name} (${p.stockQty})`).join(', ')}</span></div>}

      <section className="bg-white rounded-2xl border p-4">
        <h2 className="font-bold text-sm mb-3">Categories</h2>
        <ul className="flex flex-wrap gap-2 mb-3">
          {cats.map((c) => (
            <li key={c.id} className={`flex items-center gap-1.5 text-xs border rounded-full pl-3 pr-1.5 py-1 ${c.isPaused ? 'bg-amber-50 border-amber-300' : ''}`}>
              {c.name}
              <button onClick={() => catPatch(c.id, { isPaused: !c.isPaused })} className="underline text-zinc-500">{c.isPaused ? 'resume' : 'pause'}</button>
              <button onClick={() => catDel(c)} aria-label={`Delete ${c.name}`} className="p-1 text-red-600"><Trash2 size={12} /></button>
            </li>
          ))}
        </ul>
        <div className="flex gap-2"><input value={catName} onChange={(e) => setCatName(e.target.value)} placeholder="New category name" className={field + ' max-w-xs'} /><button onClick={addCat} className="px-4 py-2 border rounded-lg text-sm font-semibold">Add</button></div>
        <p className="text-[11px] text-zinc-400 mt-2">“Pause” hides a whole category from ordering temporarily.</p>
      </section>

      <div className="flex flex-wrap gap-2">
        <div className="relative"><Search size={14} className="absolute left-2.5 top-3 text-zinc-400" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search products" className={field + ' pl-8'} /></div>
        <select value={cat} onChange={(e) => setCat(e.target.value)} className={field + ' max-w-[220px]'}><option value="">All categories</option>{cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
      </div>

      <ul className="space-y-2">
        {shown.map((p) => (
          <li key={p.id} className="bg-white rounded-2xl border p-3 flex flex-wrap items-center gap-3">
            <div className="flex-1 min-w-[180px]">
              <div className="font-bold text-sm">{p.name}</div>
              <div className="text-xs text-zinc-500">{rs(p.price)}{p.compareAtPrice && <s className="ml-1">{rs(p.compareAtPrice)}</s>} · {cats.find((c) => c.id === p.categoryId)?.name || 'No category'}{p.trackStock && ` · stock ${p.stockQty}`}</div>
            </div>
            <label className="flex items-center gap-1.5 text-xs"><input type="checkbox" checked={p.isAvailable} onChange={(e) => patch(p.id, { isAvailable: e.target.checked }, e.target.checked ? 'Now available' : 'Now unavailable')} className="w-5 h-5 accent-emerald-600" /> Available</label>
            <label className="flex items-center gap-1.5 text-xs"><input type="checkbox" checked={p.isSoldOut} onChange={(e) => patch(p.id, { isSoldOut: e.target.checked }, e.target.checked ? 'Marked sold out' : 'Back in stock')} className="w-5 h-5 accent-red-600" /> Sold out</label>
            <button onClick={() => setEdit(p)} className="px-3 py-2 border rounded-lg text-xs font-semibold">Edit</button>
            <button onClick={() => del(p)} aria-label={`Delete ${p.name}`} className="p-2 text-red-600"><Trash2 size={16} /></button>
          </li>
        ))}
        {shown.length === 0 && <p className="text-sm text-zinc-500 bg-white border rounded-2xl p-8 text-center">No products found.</p>}
      </ul>

      {edit && <ProductForm product={edit} cats={cats} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); flash('ok', 'Saved'); load(); }} />}
    </div>
  );
}

function ProductForm({ product, cats, onClose, onSaved }) {
  const isNew = !product.id;
  const [f, setF] = useState({
    name: product.name || '', description: product.description || '', price: product.price ?? '', compareAtPrice: product.compareAtPrice ?? '',
    categoryId: product.categoryId || '', imageUrl: product.imageUrl || '', isFeatured: !!product.isFeatured,
    trackStock: !!product.trackStock, stockQty: product.stockQty ?? 0, lowStockThreshold: product.lowStockThreshold ?? 5,
    unavailableUntil: product.unavailableUntil ? new Date(product.unavailableUntil).toISOString().slice(0, 16) : '',
  });
  const [adj, setAdj] = useState({ delta: '', reason: '' });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));

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
    const body = {
      name: f.name, description: f.description || null, price: Number(f.price),
      compareAtPrice: f.compareAtPrice === '' ? null : Number(f.compareAtPrice),
      categoryId: f.categoryId || null, imageUrl: f.imageUrl || null, isFeatured: f.isFeatured,
      trackStock: f.trackStock, lowStockThreshold: Number(f.lowStockThreshold),
      unavailableUntil: f.unavailableUntil ? new Date(f.unavailableUntil).toISOString() : null,
      ...(isNew ? { stockQty: Number(f.stockQty) } : {}),
    };
    if (!isNew && adj.delta !== '' && Number(adj.delta) !== 0) body.stockAdjust = { delta: Number(adj.delta), reason: adj.reason };
    try {
      await api(isNew ? '/api/admin/products' : `/api/admin/products/${product.id}`, { method: isNew ? 'POST' : 'PATCH', body });
      onSaved();
    } catch (e2) { setErr(e2.message); setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-[70] bg-black/50 flex items-center justify-center p-3" role="dialog" aria-modal="true">
      <form onSubmit={save} className="bg-white rounded-2xl w-full max-w-lg max-h-[92vh] overflow-y-auto p-5 space-y-3">
        <div className="flex justify-between items-center"><h2 className="font-black text-lg">{isNew ? 'Add product' : 'Edit product'}</h2><button type="button" onClick={onClose} aria-label="Close"><X /></button></div>
        {err && <p role="alert" className="text-sm text-red-700 bg-red-50 rounded-lg p-2.5">{err}</p>}
        <label className="block text-xs font-semibold">Name<input required value={f.name} onChange={(e) => set('name', e.target.value)} className={field} /></label>
        <label className="block text-xs font-semibold">Description<textarea rows={2} value={f.description} onChange={(e) => set('description', e.target.value)} className={field} /></label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-xs font-semibold">Price (Rs.)<input required type="number" min="0" step="1" value={f.price} onChange={(e) => set('price', e.target.value)} className={field} /></label>
          <label className="block text-xs font-semibold">Old price (only if on discount)<input type="number" min="0" step="1" value={f.compareAtPrice} onChange={(e) => set('compareAtPrice', e.target.value)} className={field} /></label>
        </div>
        <label className="block text-xs font-semibold">Category<select value={f.categoryId} onChange={(e) => set('categoryId', e.target.value)} className={field}><option value="">None</option>{cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
        <div className="text-xs font-semibold">Photo
          <div className="flex items-center gap-3 mt-1">{f.imageUrl && <img src={f.imageUrl} alt="" className="w-16 h-16 rounded-lg object-cover border" />}<input type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} /></div>
        </div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.isFeatured} onChange={(e) => set('isFeatured', e.target.checked)} className="w-5 h-5" /> Show as popular / featured</label>
        <label className="block text-xs font-semibold">Temporarily unavailable until (turns back on by itself)<input type="datetime-local" value={f.unavailableUntil} onChange={(e) => set('unavailableUntil', e.target.value)} className={field} /></label>
        <fieldset className="border rounded-xl p-3 space-y-2">
          <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={f.trackStock} onChange={(e) => set('trackStock', e.target.checked)} className="w-5 h-5" /> Count stock for this item</label>
          {f.trackStock && (
            <div className="grid grid-cols-2 gap-3">
              {isNew ? <label className="text-xs font-semibold">Stock quantity<input type="number" min="0" value={f.stockQty} onChange={(e) => set('stockQty', e.target.value)} className={field} /></label>
                : <div className="text-xs font-semibold">Current stock<div className="py-2 text-base">{product.stockQty}</div></div>}
              <label className="text-xs font-semibold">Warn when stock is at or below<input type="number" min="0" value={f.lowStockThreshold} onChange={(e) => set('lowStockThreshold', e.target.value)} className={field} /></label>
              {!isNew && <>
                <label className="text-xs font-semibold">Add / remove stock (e.g. 20 or -3)<input type="number" value={adj.delta} onChange={(e) => setAdj({ ...adj, delta: e.target.value })} className={field} /></label>
                <label className="text-xs font-semibold">Reason<input value={adj.reason} onChange={(e) => setAdj({ ...adj, reason: e.target.value })} placeholder="e.g. new delivery" className={field} /></label>
              </>}
            </div>
          )}
          <p className="text-[11px] text-zinc-500">Stock is reserved when a customer places an order and returned if the order is cancelled.</p>
        </fieldset>
        <button disabled={busy} className="w-full bg-red-700 text-white font-bold py-3 rounded-xl disabled:opacity-60">{busy ? 'Saving…' : 'Save'}</button>
      </form>
    </div>
  );
}
