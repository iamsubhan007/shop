'use client';

import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { api } from '@/components/admin/api';

function fmtHours(a, b) {
  const f = (t) => { const [h, m] = t.split(':').map(Number); return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`; };
  return `${f(a)} - ${f(b)}`;
}

const inp = 'w-full border border-zinc-300 rounded-lg px-3 py-2 text-sm';
const Field = ({ label, children, hint }) => <label className="block text-xs font-semibold text-zinc-700">{label}{children}{hint && <span className="block font-normal text-zinc-400 mt-0.5">{hint}</span>}</label>;
const Check = ({ label, checked, onChange }) => <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={!!checked} onChange={(e) => onChange(e.target.checked)} className="w-5 h-5 accent-red-700" /> {label}</label>;

function Section({ title, hint, settingKey, value, onSaved, children, build }) {
  const [v, setV] = useState(value);
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const save = async (e) => {
    e.preventDefault(); setBusy(true); setMsg(null);
    try { await api('/api/admin/settings', { method: 'PUT', body: { key: settingKey, value: build ? build(v) : v } }); setMsg({ ok: true, t: 'Saved ✓' }); onSaved?.(); } catch (er) { setMsg({ ok: false, t: er.message }); }
    setBusy(false);
  };
  return (
    <form onSubmit={save} className="bg-white rounded-2xl border p-5 space-y-3">
      <div><h2 className="font-black">{title}</h2>{hint && <p className="text-xs text-zinc-500">{hint}</p>}</div>
      {children(v, (patch) => setV((p) => ({ ...p, ...patch })), setV)}
      <div className="flex items-center gap-3"><button disabled={busy} className="bg-red-700 text-white font-bold px-5 py-2.5 rounded-xl text-sm disabled:opacity-60">{busy ? 'Saving…' : 'Save'}</button>{msg && <span role={msg.ok ? 'status' : 'alert'} className={`text-sm ${msg.ok ? 'text-emerald-700' : 'text-red-700'}`}>{msg.t}</span>}</div>
    </form>
  );
}

export default function SettingsAdmin() {
  const [s, setS] = useState(null);
  const [err, setErr] = useState('');
  useEffect(() => { api('/api/admin/settings').then((d) => setS(d.settings)).catch((e) => setErr(e.message)); }, []);
  if (err) return <p role="alert" className="text-red-700">{err}</p>;
  if (!s) return <Loader2 className="animate-spin text-zinc-400" />;

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <h1 className="text-2xl font-black">Shop Settings</h1>

      <Section title="Open / closed for orders" hint="Turn off to stop new orders (e.g. holiday or rush). Existing orders and the admin panel keep working." settingKey="ordering" value={{ ...s.ordering, reopen_local: s.ordering.reopen_at ? new Date(s.ordering.reopen_at).toISOString().slice(0, 16) : '' }}
        build={(v) => ({ open: v.open, notice: v.notice || '', reopen_at: v.reopen_local ? new Date(v.reopen_local).toISOString() : null })}>
        {(v, set) => (<>
          <Check label="Accepting new orders" checked={v.open} onChange={(x) => set({ open: x })} />
          <Field label="Message shown to customers"><input className={inp} value={v.notice} onChange={(e) => set({ notice: e.target.value })} placeholder="e.g. We are closed for Eid. Back tomorrow!" /></Field>
          <Field label="Reopens at (optional)"><input type="datetime-local" className={inp} value={v.reopen_local} onChange={(e) => set({ reopen_local: e.target.value })} /></Field>
        </>)}
      </Section>

      <Section title="Delivery & pickup" settingKey="delivery" value={{ ...s.delivery, pickup: s.pickup.enabled }}
        build={(v) => ({ enabled: v.enabled, radius_m: v.radius_m, fee: v.fee, free_over: v.free_over, min_order: v.min_order })}
        onSaved={() => {}}>
        {(v, set) => (<>
          <Check label="Home delivery available" checked={v.enabled} onChange={(x) => set({ enabled: x })} />
          <div className="grid grid-cols-2 gap-3">
            <Field label="Delivery radius (metres)"><input type="number" min="100" className={inp} value={v.radius_m} onChange={(e) => set({ radius_m: e.target.value })} /></Field>
            <Field label="Delivery fee (Rs.)"><input type="number" min="0" className={inp} value={v.fee} onChange={(e) => set({ fee: e.target.value })} /></Field>
            <Field label="Free delivery above (Rs., 0 = never)"><input type="number" min="0" className={inp} value={v.free_over} onChange={(e) => set({ free_over: e.target.value })} /></Field>
            <Field label="Minimum order (Rs., 0 = none)"><input type="number" min="0" className={inp} value={v.min_order} onChange={(e) => set({ min_order: e.target.value })} /></Field>
          </div>
        </>)}
      </Section>

      <Section title="Pickup" settingKey="pickup" value={s.pickup}>
        {(v, set) => <Check label="Pickup available" checked={v.enabled} onChange={(x) => set({ enabled: x })} />}
      </Section>

      <Section title="Payment accounts" hint="Customers see these when paying by transfer. Only the owner can change them." settingKey="payment" value={s.payment}>
        {(v, _set, setAll) => {
          const upd = (k, patch) => setAll({ ...v, [k]: { ...v[k], ...patch } });
          return (<>
            <div className="space-y-2 border rounded-xl p-3"><Check label="Bank transfer" checked={v.bank.enabled} onChange={(x) => upd('bank', { enabled: x })} />
              <div className="grid grid-cols-2 gap-2">
                {[['bank_name', 'Bank name'], ['account_title', 'Account title'], ['account_number', 'Account number'], ['iban', 'IBAN']].map(([k, l]) => <Field key={k} label={l}><input className={inp} value={v.bank[k] || ''} onChange={(e) => upd('bank', { [k]: e.target.value })} /></Field>)}
              </div></div>
            {['jazzcash', 'easypaisa'].map((k) => (
              <div key={k} className="space-y-2 border rounded-xl p-3"><Check label={k === 'jazzcash' ? 'JazzCash' : 'EasyPaisa'} checked={v[k].enabled} onChange={(x) => upd(k, { enabled: x })} />
                <div className="grid grid-cols-2 gap-2"><Field label="Mobile number"><input className={inp} value={v[k].number || ''} onChange={(e) => upd(k, { number: e.target.value })} /></Field><Field label="Account title"><input className={inp} value={v[k].title || ''} onChange={(e) => upd(k, { title: e.target.value })} /></Field></div></div>
            ))}
            <Field label="Instructions shown to customers"><textarea rows={3} className={inp} value={v.instructions || ''} onChange={(e) => setAll({ ...v, instructions: e.target.value })} /></Field>
          </>);
        }}
      </Section>

      <Section title="Loyalty points" hint="Optional. When on, customers earn points for completed orders. Nothing is given automatically unless you turn this on." settingKey="loyalty" value={s.loyalty}>
        {(v, set) => (<>
          <Check label="Loyalty points enabled" checked={v.enabled} onChange={(x) => set({ enabled: x })} />
          <Field label="Points earned per Rs. 100 spent"><input type="number" min="0" className={inp} value={v.points_per_100} onChange={(e) => set({ points_per_100: e.target.value })} /></Field>
        </>)}
      </Section>

      <Section title="Automatic backups" hint="Backups run on this schedule (owner can download them under Backups & Activity)." settingKey="backup" value={s.backup}>
        {(v, set) => (<>
          <Check label="Automatic backups on" checked={v.enabled} onChange={(x) => set({ enabled: x })} />
          <div className="grid grid-cols-2 gap-3">
            <Field label="Back up every (hours)"><input type="number" min="1" className={inp} value={v.every_hours} onChange={(e) => set({ every_hours: e.target.value })} /></Field>
            <Field label="Keep the latest (backups)"><input type="number" min="1" className={inp} value={v.keep} onChange={(e) => set({ keep: e.target.value })} /></Field>
          </div>
        </>)}
      </Section>

      <Section title="Shop details" hint="Only the owner can change these. The location pin is the centre of the delivery radius." settingKey="shop" value={s.shop}
        build={(v) => ({ ...v, lat: Number(v.lat), lng: Number(v.lng) })}>
        {(v, set) => (<>
          <div className="grid sm:grid-cols-2 gap-3">
            <Field label="Shop name"><input className={inp} value={v.name} onChange={(e) => set({ name: e.target.value })} /></Field>
            <Field label="Phone"><input className={inp} value={v.phone} onChange={(e) => set({ phone: e.target.value })} /></Field>
            <Field label="WhatsApp number" hint="Digits with country code, e.g. 923001234567"><input className={inp} value={v.whatsapp} onChange={(e) => set({ whatsapp: e.target.value })} /></Field>
            <Field label="Email"><input className={inp} value={v.email} onChange={(e) => set({ email: e.target.value })} /></Field>
            <Field label="Opens at (daily)" hint="Shop time (Pakistan). Orders are blocked outside opening hours."><input type="time" required className={inp} value={v.open_time || '08:00'} onChange={(e) => set({ open_time: e.target.value, hours: fmtHours(e.target.value, v.close_time || '23:00') })} /></Field>
            <Field label="Closes at (daily)"><input type="time" required className={inp} value={v.close_time || '23:00'} onChange={(e) => set({ close_time: e.target.value, hours: fmtHours(v.open_time || '08:00', e.target.value) })} /></Field>
            <Field label="Google Maps link"><input className={inp} value={v.maps_url} onChange={(e) => set({ maps_url: e.target.value })} /></Field>
            <Field label="Latitude"><input type="number" step="any" className={inp} value={v.lat} onChange={(e) => set({ lat: e.target.value })} /></Field>
            <Field label="Longitude"><input type="number" step="any" className={inp} value={v.lng} onChange={(e) => set({ lng: e.target.value })} /></Field>
          </div>
          <Field label="Address"><textarea rows={2} className={inp} value={v.address} onChange={(e) => set({ address: e.target.value })} /></Field>
        </>)}
      </Section>
    </div>
  );
}
