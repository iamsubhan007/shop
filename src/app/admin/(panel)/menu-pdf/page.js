'use client';

import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Download, ExternalLink, FileText, Loader2, Trash2, Upload } from 'lucide-react';
import { api, when } from '@/components/admin/api';
import { checkPdf, MAX_PDF_BYTES, MAX_VERSIONS } from '@/lib/menuPdf/validate';

const card = 'bg-white rounded-2xl border p-5 space-y-3';
const primary = 'inline-flex items-center justify-center gap-2 bg-red-700 text-white font-bold px-4 py-2.5 rounded-xl text-sm disabled:opacity-50';
const secondary = 'inline-flex items-center justify-center gap-2 border border-zinc-300 bg-white font-semibold px-4 py-2.5 rounded-xl text-sm disabled:opacity-50';
const size = (n) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

export default function MenuPdfAdmin() {
  const [data, setData] = useState(null);
  const [msg, setMsg] = useState(null); // { ok, text }
  const [busy, setBusy] = useState('');
  const [picked, setPicked] = useState(null); // { file, url }
  const [inputKey, setInputKey] = useState(0);

  const load = useCallback(async () => {
    try { setData(await api('/api/admin/menu-pdf')); } catch (e) { setMsg({ ok: false, text: e.message }); }
  }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => () => { if (picked) URL.revokeObjectURL(picked.url); }, [picked]);

  const clearPick = () => { setPicked(null); setInputKey((k) => k + 1); };

  const choose = async (file) => {
    setMsg(null);
    if (!file) return clearPick();
    const problem = file.size > MAX_PDF_BYTES ? checkPdf({ length: file.size }) : checkPdf(new Uint8Array(await file.arrayBuffer()), { name: file.name, type: file.type });
    if (problem) { clearPick(); return setMsg({ ok: false, text: problem }); }
    setPicked({ file, url: URL.createObjectURL(file) });
  };

  const upload = async (activate) => {
    const { file } = picked;
    if (activate && !confirm(`Publish "${file.name}"? Every customer will download this PDF from the website and the app.`)) return;
    setBusy(activate ? 'publish' : 'upload'); setMsg(null);
    try {
      let next;
      if (data.directUploadAbove && file.size > data.directUploadAbove) {
        const link = await api('/api/admin/menu-pdf/direct', { method: 'POST', body: { originalName: file.name, size: file.size } });
        const res = await fetch(link.uploadUrl, { method: 'PUT', headers: { 'Content-Type': 'application/pdf' }, body: file });
        if (!res.ok) throw new Error('The upload to storage failed.');
        next = await api('/api/admin/menu-pdf/direct', { method: 'PUT', body: { name: link.name, originalName: file.name, activate } });
      } else {
        const form = new FormData();
        form.append('file', file);
        form.append('activate', String(activate));
        const res = await fetch('/api/admin/menu-pdf', { method: 'POST', body: form });
        next = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(next.error || (res.status === 413 ? 'That PDF is too large to upload.' : 'The upload failed.'));
      }
      setData(next); clearPick();
      setMsg({ ok: true, text: activate ? 'Published. Customers now download your PDF.' : 'Uploaded. It is not published yet.' });
    } catch (e) {
      setMsg({ ok: false, text: `${e.message} The menu customers download has not changed.` });
    }
    setBusy('');
  };

  const run = async (key, request, done, ask) => {
    if (ask && !confirm(ask)) return;
    setBusy(key); setMsg(null);
    try { setData(await request()); setMsg({ ok: true, text: done }); } catch (e) { setMsg({ ok: false, text: e.message }); }
    setBusy('');
  };
  const publish = (f) => run(f.id, () => api('/api/admin/menu-pdf', { method: 'PATCH', body: { action: 'activate', id: f.id } }), 'Published. Customers now download your PDF.', `Publish "${f.original}"? Every customer will download this PDF.`);
  const automatic = () => run('auto', () => api('/api/admin/menu-pdf', { method: 'PATCH', body: { action: 'automatic' } }), 'Customers now download the automatically generated menu.', 'Switch to the automatically generated menu? Your uploaded PDFs are kept.');
  const remove = (f) => run(f.id, () => api(`/api/admin/menu-pdf/files/${f.id}`, { method: 'DELETE' }), 'Deleted.', `Permanently delete "${f.original}"?`);

  if (!data) return msg ? <p role="alert" className="text-red-700 text-sm">{msg.text}</p> : <Loader2 className="animate-spin text-zinc-400" />;
  const active = data.files.find((f) => f.active);
  const custom = data.source === 'custom';

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <h1 className="text-2xl font-black">Menu PDF</h1>
      <p className="text-sm text-zinc-500">The “Download Menu (PDF)” button on the website and in the app gives customers the menu chosen here.</p>
      {msg && <p role={msg.ok ? 'status' : 'alert'} className={`text-sm rounded-xl p-3 ${msg.ok ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-700'}`}>{msg.text}</p>}

      <section className={card} aria-label="Current menu">
        <div className="flex flex-wrap items-center gap-3">
          <FileText className="text-red-700" />
          <div className="flex-1 min-w-[200px]">
            <div className="text-xs font-semibold text-zinc-500">CUSTOMERS DOWNLOAD NOW</div>
            <div className="font-black" data-testid="active-menu">{custom ? `Your PDF: ${active?.original}` : 'Automatic menu (from your live menu)'}</div>
          </div>
          <a href="/api/menu/pdf" className={secondary}><Download size={16} /> Download it</a>
        </div>
        {data.activeFileMissing && <p role="alert" className="flex gap-2 text-sm bg-amber-50 border border-amber-200 text-amber-900 rounded-xl p-3"><AlertTriangle size={16} className="shrink-0 mt-0.5" /> The published file is missing from storage, so customers are getting the automatic menu. Upload it again.</p>}
        {data.storage === 'unavailable' && <p role="alert" className="text-sm bg-amber-50 border border-amber-200 text-amber-900 rounded-xl p-3">Uploads are not set up on this server (SUPABASE_SERVICE_ROLE_KEY is missing). The automatic menu works.</p>}
      </section>

      <section className={card}>
        <h2 className="font-black">A. Automatic menu</h2>
        <p className="text-sm text-zinc-600">Made on each download from what is published now: {data.auto.categories} categories, {data.auto.items} available items, {data.auto.deals} active deals, with your shop details. Hidden, sold-out and unavailable items and expired deals are left out.</p>
        <p className="text-xs text-zinc-500">Change items and prices in <a className="underline" href="/admin/menu">Menu &amp; Stock</a>, deals in <a className="underline" href="/admin/deals">Deals</a>, and the name, tagline, phone and address in <a className="underline" href="/admin/settings">Shop Settings</a>.</p>
        <div className="flex flex-wrap gap-2">
          <a href="/api/admin/menu-pdf/preview" target="_blank" rel="noreferrer" className={secondary}><ExternalLink size={16} /> Preview automatic menu</a>
          {custom && <button onClick={automatic} disabled={!!busy} className={primary}>{busy === 'auto' && <Loader2 size={16} className="animate-spin" />} Use automatic menu</button>}
          {!custom && <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-emerald-700"><CheckCircle2 size={16} /> Published now</span>}
        </div>
      </section>

      <section className={card}>
        <h2 className="font-black">B. Your own PDF</h2>
        <p className="text-sm text-zinc-600">Upload a designed menu (PDF, up to {MAX_PDF_BYTES / 1024 / 1024} MB). It only changes what customers download: your menu items and prices stay exactly as they are, so keep the two in agreement.</p>
        <input key={inputKey} type="file" accept="application/pdf,.pdf" aria-label="Choose a menu PDF" disabled={!!busy || data.storage === 'unavailable'} onChange={(e) => choose(e.target.files?.[0])} className="block w-full text-sm" />
        {picked && (
          <div className="space-y-3">
            <p className="text-sm font-semibold">{picked.file.name} <span className="text-zinc-500 font-normal">({size(picked.file.size)}) — not uploaded yet</span></p>
            <iframe src={picked.url} title="Preview of the chosen PDF" className="hidden sm:block w-full h-96 rounded-xl border" />
            <a href={picked.url} target="_blank" rel="noreferrer" className="sm:hidden text-sm font-semibold underline">Open the chosen PDF to check it</a>
            <div className="flex flex-wrap gap-2">
              <button onClick={() => upload(true)} disabled={!!busy} className={primary}>{busy === 'publish' ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />} Upload and publish</button>
              <button onClick={() => upload(false)} disabled={!!busy} className={secondary}>{busy === 'upload' && <Loader2 size={16} className="animate-spin" />} Upload only</button>
              <button onClick={clearPick} disabled={!!busy} className="text-sm underline text-zinc-500">Cancel</button>
            </div>
          </div>
        )}
      </section>

      <section className={card}>
        <h2 className="font-black">Uploaded PDFs</h2>
        {data.files.length === 0 ? <p className="text-sm text-zinc-500">None yet.</p> : (
          <ul className="divide-y">
            {data.files.map((f) => (
              <li key={f.id} data-testid="menu-version" className="py-3 flex flex-wrap items-center gap-3">
                <div className="flex-1 min-w-[200px]">
                  <div className="font-bold text-sm break-all">{f.original} {f.active && <span className="ml-1 text-[10px] bg-emerald-100 text-emerald-800 rounded px-1.5 py-0.5">PUBLISHED</span>}</div>
                  <div className="text-xs text-zinc-500">{size(f.size)} · {when(f.uploadedAt)} · {f.uploadedBy}</div>
                </div>
                <a href={`/api/admin/menu-pdf/files/${f.id}`} target="_blank" rel="noreferrer" className={secondary}><ExternalLink size={15} /> Preview</a>
                {f.active
                  ? <button onClick={automatic} disabled={!!busy} className={secondary}>Unpublish</button>
                  : <>
                    <button onClick={() => publish(f)} disabled={!!busy} className={primary}>{busy === f.id && <Loader2 size={15} className="animate-spin" />} Publish</button>
                    <button onClick={() => remove(f)} disabled={!!busy} aria-label={`Delete ${f.original}`} className="p-2 text-red-600"><Trash2 size={16} /></button>
                  </>}
              </li>
            ))}
          </ul>
        )}
        <p className="text-[11px] text-zinc-400">The latest {MAX_VERSIONS} uploads are kept. To replace the published menu, upload the new file and publish it: the old one stays in use until the new one has been stored.</p>
      </section>
    </div>
  );
}
