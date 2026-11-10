'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { BellRing, Loader2, Volume2 } from 'lucide-react';
import { api, rs, ago } from '@/components/admin/api';

const POLL_MS = 5000; // how often the portal asks for orders that are waiting
const BEEP_EVERY_MS = 2200; // the alarm repeats at this rate until nothing is waiting
const SHOW = 3; // orders listed in the banner; the rest are counted

/**
 * The new-order alarm, shown on every staff page (owner, admin and kitchen).
 * It rings and flashes for as long as any order is waiting to be accepted. It has no dismiss button on purpose:
 * it stops only when the order is accepted by staff or cancelled by the customer.
 *
 * Sound is generated with the Web Audio API, so there is no audio file to host. Browsers refuse to play sound until
 * the person has interacted with the page, so the first tap/click/key unlocks it; until then the banner shows a
 * "turn on sound" button.
 */
export default function NewOrderAlert({ role }) {
  const [list, setList] = useState({ count: 0, orders: [] });
  const [soundReady, setSoundReady] = useState(false);
  const [failures, setFailures] = useState(0);
  const [busyId, setBusyId] = useState(null);
  const [err, setErr] = useState('');
  // The banner can be folded down to a slim bar so it never hides the menu / sign-out on a phone. Folding it does NOT
  // silence or dismiss the alert: the sound and the bar stay until the orders are accepted or cancelled, and it
  // opens itself again whenever another order arrives.
  const [open, setOpen] = useState(true);
  const prevCount = useRef(0);
  const ctxRef = useRef(null);
  const countRef = useRef(0);
  const active = list.count > 0;
  countRef.current = list.count;
  useEffect(() => {
    if (list.count > prevCount.current) setOpen(true);
    prevCount.current = list.count;
  }, [list.count]);

  // ---- sound ----
  const unlock = useCallback(() => {
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      ctxRef.current ||= new AC();
      const ctx = ctxRef.current;
      const sync = () => setSoundReady(ctx.state === 'running');
      if (ctx.state === 'running') return sync();
      ctx.resume().then(sync).catch(() => setSoundReady(false));
    } catch { setSoundReady(false); }
  }, []);

  useEffect(() => {
    const events = ['pointerdown', 'keydown', 'touchstart'];
    events.forEach((e) => window.addEventListener(e, unlock, { passive: true }));
    unlock(); // works straight away if the browser already allows sound for this site
    return () => events.forEach((e) => window.removeEventListener(e, unlock));
  }, [unlock]);

  const beep = useCallback(() => {
    const ctx = ctxRef.current;
    if (!ctx || ctx.state !== 'running') return;
    const t0 = ctx.currentTime;
    [[880, 0], [1175, 0.24], [880, 0.48]].forEach(([freq, at]) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, t0 + at);
      gain.gain.exponentialRampToValueAtTime(0.55, t0 + at + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + at + 0.2);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t0 + at);
      osc.stop(t0 + at + 0.22);
    });
    try { navigator.vibrate?.([200, 100, 200]); } catch {}
  }, []);

  useEffect(() => {
    if (!active) return;
    beep();
    const t = setInterval(beep, BEEP_EVERY_MS);
    return () => clearInterval(t);
  }, [active, beep, soundReady]);

  // ---- flashing tab title, so it is noticed from another tab ----
  useEffect(() => {
    if (!active) return;
    const original = document.title;
    let on = false;
    const t = setInterval(() => { on = !on; document.title = on ? `\u{1F514} NEW ORDER (${countRef.current})` : original; }, 1000);
    return () => { clearInterval(t); document.title = original; };
  }, [active]);

  // ---- ask the server which orders are waiting ----
  const poll = useCallback(async () => {
    try {
      const d = await api('/api/admin/alerts');
      setList({ count: d.count, orders: d.orders });
      setFailures(0);
    } catch { setFailures((n) => n + 1); }
  }, []);

  useEffect(() => {
    poll();
    const t = setInterval(poll, POLL_MS);
    const onVisible = () => { if (document.visibilityState === 'visible') poll(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', onVisible); };
  }, [poll]);

  const accept = async (o) => {
    setBusyId(o.id); setErr('');
    try {
      await api(`/api/admin/orders/${o.id}`, { method: 'PATCH', body: { action: 'status', status: 'Confirmed' } });
      await poll();
    } catch (e) { setErr(e.message); }
    setBusyId(null);
  };

  const openHref = (o) => (role === 'kitchen' ? '/admin/kitchen' : `/admin/orders?open=${o.id}`);
  const shown = list.orders.slice(0, SHOW);

  return (
    <>
      {failures >= 3 && (
        <div role="status" className="fixed z-[90] top-2 left-1/2 -translate-x-1/2 bg-zinc-900 text-white text-xs font-semibold rounded-full px-4 py-2 shadow-lg">
          Can&apos;t check for new orders right now. Check the internet connection.
        </div>
      )}
      {active && (
        <div
          role="alert"
          aria-live="assertive"
          data-testid="new-order-alert"
          data-count={list.count}
          data-sound={soundReady ? 'on' : 'blocked'}
          data-expanded={open ? 'yes' : 'no'}
          className={`fixed z-[90] bottom-3 left-3 right-3 lg:left-[16rem] lg:right-auto lg:w-[30rem] rounded-2xl bg-red-700 text-white shadow-2xl ${open ? 'p-4' : 'px-4 py-2.5'}`}
        >
          <span aria-hidden className="pointer-events-none absolute inset-0 rounded-2xl ring-4 ring-amber-300 animate-pulse" />
          <div className="relative">
            <button onClick={() => setOpen((v) => !v)} aria-expanded={open} className="w-full flex items-center gap-2 font-black text-lg text-left">
              <BellRing className="animate-bounce shrink-0" size={22} />
              <span className="flex-1">{list.count === 1 ? 'NEW ORDER' : `${list.count} ORDERS WAITING`}</span>
              <span className="text-xs font-semibold bg-white/20 rounded-full px-3 py-1">{open ? 'Fold' : 'Show'}</span>
            </button>
            {open && (<>

            {!soundReady && (
              <button onClick={unlock} className="mt-2 w-full flex items-center justify-center gap-2 bg-amber-300 text-black font-black rounded-xl py-3 text-sm">
                <Volume2 size={18} /> Tap here to turn on the alert sound
              </button>
            )}

            <ul className="mt-3 space-y-2">
              {shown.map((o) => (
                <li key={o.id} className="bg-white/10 rounded-xl p-3">
                  <div className="flex justify-between gap-2 text-sm">
                    <span className="font-black">{o.orderNumber}</span>
                    <span className="text-red-100 text-xs">{ago(o.createdAt)} ago</span>
                  </div>
                  <div className="text-xs text-red-50 mt-0.5">
                    {o.customerName} · {o.orderType === 'delivery' ? 'Delivery' : 'Pickup'} · {o.itemCount} item{o.itemCount === 1 ? '' : 's'}
                    {o.totalAmount !== undefined && ` · ${rs(o.totalAmount)}`}
                  </div>
                  <div className="flex gap-2 mt-2">
                    {o.canAccept ? (
                      <button disabled={busyId === o.id} onClick={() => accept(o)} className="flex-1 bg-white text-red-700 font-black rounded-lg py-3 text-sm disabled:opacity-70 flex justify-center">
                        {busyId === o.id ? <Loader2 className="animate-spin" size={18} /> : 'Accept order'}
                      </button>
                    ) : (
                      <span className="flex-1 text-xs text-red-50 self-center">Payment submitted. Check it, then accept.</span>
                    )}
                    <Link href={openHref(o)} className="px-4 bg-red-900/60 border border-white/30 rounded-lg text-sm font-bold flex items-center">{o.canAccept ? 'Open' : 'Review payment'}</Link>
                  </div>
                </li>
              ))}
            </ul>
            {list.count > shown.length && <p className="text-xs text-red-100 mt-2">+ {list.count - shown.length} more waiting</p>}
            {err && <p role="alert" className="text-xs bg-white text-red-700 rounded-lg p-2 mt-2">{err}</p>}
            <p className="text-[11px] text-red-100 mt-2">This alert stops when the order is accepted, or if the customer cancels it.</p>
            </>)}
          </div>
        </div>
      )}
    </>
  );
}
