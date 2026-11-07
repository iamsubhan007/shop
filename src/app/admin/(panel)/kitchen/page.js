'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Volume2, VolumeX } from 'lucide-react';
import { api, ago } from '@/components/admin/api';

const COLS = [
  { key: 'new', title: 'New', statuses: ['Placed'], next: 'Confirmed', btn: 'Accept order' },
  { key: 'confirmed', title: 'Confirmed', statuses: ['Confirmed'], next: 'Cooking', btn: 'Start cooking' },
  { key: 'cooking', title: 'Cooking', statuses: ['Cooking'], next: 'READY', btn: 'Food is ready' },
  { key: 'ready', title: 'Ready / Dispatch', statuses: ['Ready for Pickup', 'Out for Delivery'], next: null },
];

export default function Kitchen() {
  const [orders, setOrders] = useState([]);
  const [err, setErr] = useState('');
  const [sound, setSound] = useState(false);
  const [, tick] = useState(0);
  const known = useRef(null);
  const ctx = useRef(null);
  const [fresh, setFresh] = useState(new Set());

  useEffect(() => { try { setSound(localStorage.getItem('hbt_kds_sound') === '1'); } catch {} }, []);

  const beep = useCallback(() => {
    try {
      ctx.current ||= new (window.AudioContext || window.webkitAudioContext)();
      const o = ctx.current.createOscillator(); const g = ctx.current.createGain();
      o.connect(g); g.connect(ctx.current.destination); o.frequency.value = 880; g.gain.value = 0.2;
      o.start(); o.stop(ctx.current.currentTime + 0.35);
    } catch {}
  }, []);

  const load = useCallback(async () => {
    try {
      const d = await api('/api/admin/kitchen');
      setOrders(d.orders);
      setErr('');
      const ids = new Set(d.orders.map((o) => o.id));
      if (known.current) {
        const added = [...ids].filter((i) => !known.current.has(i));
        if (added.length) { setFresh((p) => new Set([...p, ...added])); if (sound) beep(); }
      }
      known.current = ids;
    } catch (e) { setErr(e.message); }
  }, [sound, beep]);

  useEffect(() => { load(); const t = setInterval(load, 8000); return () => clearInterval(t); }, [load]);
  useEffect(() => { const t = setInterval(() => tick((n) => n + 1), 30000); return () => clearInterval(t); }, []);

  const toggleSound = () => { const v = !sound; setSound(v); try { localStorage.setItem('hbt_kds_sound', v ? '1' : '0'); } catch {} if (v) beep(); };

  const move = async (o, to) => {
    const status = to === 'READY' ? (o.orderType === 'pickup' ? 'Ready for Pickup' : 'Out for Delivery') : to;
    try { await api(`/api/admin/orders/${o.id}`, { method: 'PATCH', body: { action: 'status', status } }); setFresh((p) => { const n = new Set(p); n.delete(o.id); return n; }); load(); } catch (e) { setErr(e.message); }
  };
  const done = async (o) => {
    try { await api(`/api/admin/orders/${o.id}`, { method: 'PATCH', body: { action: 'status', status: 'Completed' } }); load(); } catch (e) { setErr(e.message); }
  };

  return (
    <div className="max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-black">Kitchen</h1>
        <button onClick={toggleSound} className="flex items-center gap-2 px-4 py-2.5 rounded-xl border bg-white text-sm font-semibold" aria-pressed={sound}>
          {sound ? <Volume2 size={18} /> : <VolumeX size={18} />} Sound {sound ? 'on' : 'off'}
        </button>
      </div>
      {err && <p role="alert" className="text-red-700 text-sm mb-3">{err}</p>}
      <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-4 items-start">
        {COLS.map((c) => {
          const list = orders.filter((o) => c.statuses.includes(o.status));
          return (
            <section key={c.key} aria-label={c.title}>
              <h2 className="font-black text-sm mb-2 flex justify-between">{c.title}<span className="bg-zinc-900 text-white rounded-full px-2.5 text-xs leading-6">{list.length}</span></h2>
              <div className="space-y-3">
                {list.length === 0 && <p className="text-xs text-zinc-400 bg-white rounded-2xl border p-4">Nothing here</p>}
                {list.map((o) => {
                  const blocked = c.key === 'new' && o.paymentMethod !== 'cod';
                  const mins = (Date.now() - new Date(o.createdAt).getTime()) / 60000;
                  return (
                    <article key={o.id} className={`bg-white rounded-2xl border-2 p-4 ${fresh.has(o.id) ? 'border-amber-400 animate-pulse' : mins > 30 ? 'border-red-300' : 'border-zinc-200'}`}>
                      <div className="flex justify-between items-start">
                        <div className="font-black text-lg">{o.orderNumber.split('-').slice(1).join('-')}</div>
                        <div className="text-right text-xs"><div className={`font-bold ${mins > 30 ? 'text-red-600' : 'text-zinc-600'}`}>{ago(o.createdAt)}</div><div className="uppercase text-zinc-400">{o.orderType}</div></div>
                      </div>
                      <ul className="mt-2 text-base font-semibold space-y-0.5">{o.items.map((i, k) => <li key={k}>{i.quantity} × {i.title}{i.notes && <span className="block text-xs font-normal text-zinc-500">{i.notes}</span>}</li>)}</ul>
                      {o.specialInstructions && <p className="mt-2 text-sm bg-amber-50 border border-amber-200 rounded-lg p-2">⚠ {o.specialInstructions}</p>}
                      {c.next && !blocked && <button onClick={() => move(o, c.next)} className="mt-3 w-full py-4 rounded-xl bg-red-700 text-white text-lg font-black active:scale-[0.98]">{c.btn}</button>}
                      {blocked && <p className="mt-3 text-xs text-zinc-500">Waiting for payment check by the office.</p>}
                      {c.key === 'ready' && <button onClick={() => done(o)} className="mt-3 w-full py-4 rounded-xl bg-emerald-600 text-white text-lg font-black">{o.status === 'Ready for Pickup' ? 'Handed to customer' : 'Delivered'}</button>}
                    </article>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
