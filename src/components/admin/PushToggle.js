'use client';

import { useCallback, useEffect, useState } from 'react';
import { Bell, BellOff, Loader2 } from 'lucide-react';
import { api } from '@/components/admin/api';

// "Turn on phone alerts": registers the service worker, asks permission, subscribes this browser to Web Push and
// tells the server, so new orders reach this device even when the portal is closed. Works per device: do it once on
// each phone/PC that should be alerted.

const b64ToBytes = (s) => {
  const raw = atob((s + '='.repeat((4 - (s.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
};
const supported = () => typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
const currentSub = async () => {
  const reg = await navigator.serviceWorker.getRegistration('/admin/');
  return reg ? reg.pushManager.getSubscription() : null;
};

export default function PushToggle({ role }) {
  // checking | unsupported | ios | unconfigured | off | on | denied | busy
  const [state, setState] = useState('checking');
  const [msg, setMsg] = useState('');
  const [key, setKey] = useState(null);

  const refresh = useCallback(async () => {
    if (!supported()) return setState(/iPad|iPhone|iPod/.test(navigator.userAgent) ? 'ios' : 'unsupported');
    try {
      const k = await api('/api/admin/push/key');
      if (!k.configured) return setState('unconfigured');
      setKey(k.publicKey);
      if (Notification.permission === 'denied') return setState('denied');
      const sub = await currentSub();
      if (sub && Notification.permission === 'granted') {
        // Keep the server's record tied to whoever is signed in on this device right now.
        api('/api/admin/push/subscribe', { method: 'POST', body: { subscription: sub.toJSON() } }).catch(() => {});
        return setState('on');
      }
      setState('off');
    } catch { setState('off'); }
  }, []);
  useEffect(() => { refresh(); }, [refresh]);

  const enable = async () => {
    setMsg(''); setState('busy');
    try {
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') return setState(perm === 'denied' ? 'denied' : 'off');
      const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/admin/' });
      await navigator.serviceWorker.ready;
      const sub = (await reg.pushManager.getSubscription()) || (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(key) }));
      await api('/api/admin/push/subscribe', { method: 'POST', body: { subscription: sub.toJSON() } });
      setState('on');
      setMsg('Done. Tap "Test" to check it.');
    } catch (e) {
      setMsg(e?.message && !/Registration failed|AbortError/i.test(e.message) ? e.message : 'Could not turn on alerts on this device. Try again, or use another browser.');
      setState('off');
    }
  };

  const disable = async () => {
    setMsg(''); setState('busy');
    try {
      const sub = await currentSub();
      if (sub) {
        const endpoint = sub.endpoint;
        await sub.unsubscribe();
        await api('/api/admin/push/subscribe', { method: 'DELETE', body: { endpoint } }).catch(() => {});
      }
    } catch {}
    setState('off');
  };

  const test = async () => {
    setMsg('');
    try { await api('/api/admin/push/test', { method: 'POST' }); setMsg('Test sent. It should appear in a moment.'); } catch (e) { setMsg(e.message); }
  };

  if (state === 'checking' || state === 'unsupported') return null;
  if (state === 'unconfigured') return role === 'owner' ? <p className="text-[11px] text-zinc-500">Phone alerts are not set up on the server yet.</p> : null;
  if (state === 'ios') return <p className="text-[11px] text-zinc-400">On iPhone: tap Share, then Add to Home Screen, and open the portal from there to turn on phone alerts.</p>;

  return (
    <div className="text-xs">
      {state === 'on' ? (
        <div className="flex items-center gap-2 text-emerald-400 font-semibold">
          <Bell size={14} /> Phone alerts on
          <button onClick={test} className="ml-auto underline text-zinc-300 font-normal">Test</button>
          <button onClick={disable} className="underline text-zinc-400 font-normal">Off</button>
        </div>
      ) : state === 'denied' ? (
        <p className="text-amber-300">Notifications are blocked here. Allow them in the browser settings, then reload.</p>
      ) : (
        <button onClick={enable} disabled={state === 'busy'} className="flex items-center gap-2 text-amber-300 font-semibold disabled:opacity-60">
          {state === 'busy' ? <Loader2 size={14} className="animate-spin" /> : <BellOff size={14} />} Turn on phone alerts
        </button>
      )}
      {msg && <p className="mt-1 text-zinc-400">{msg}</p>}
    </div>
  );
}
