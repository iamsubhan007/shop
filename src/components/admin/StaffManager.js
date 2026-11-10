'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2, Trash2, UserPlus } from 'lucide-react';
import { api, when } from '@/components/admin/api';

const inp = 'border border-zinc-300 rounded-lg px-3 py-2 text-sm bg-white';
const ROLE_HELP = {
  admin: 'Orders, menu & stock, deals, reports, customers and shop settings.',
  kitchen: 'The kitchen queue only (no prices, reports or settings).',
};

export default function StaffManager() {
  const [staff, setStaff] = useState(null);
  const [meId, setMeId] = useState(null);
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ email: '', fullName: '', role: 'admin' });

  const load = useCallback(() => api('/api/admin/staff').then((d) => { setStaff(d.staff); setMeId(d.meId); }).catch((e) => setError(e.message)), []);
  useEffect(() => { load(); }, [load]);

  const add = async (e) => {
    e.preventDefault();
    setError(''); setOk(''); setBusy(true);
    try {
      const d = await api('/api/admin/staff', { method: 'POST', body: { email: form.email, fullName: form.fullName || undefined, role: form.role } });
      setOk(`${d.staff.email} can now sign in at /admin/login with an emailed code.`);
      setForm({ email: '', fullName: '', role: form.role });
      await load();
    } catch (er) { setError(er.message); }
    setBusy(false);
  };

  const changeRole = async (m, role) => {
    setError(''); setOk('');
    try { await api(`/api/admin/staff/${m.id}`, { method: 'PATCH', body: { role } }); setOk(`${m.email} is now ${role}.`); await load(); } catch (er) { setError(er.message); }
  };

  const remove = async (m) => {
    if (!window.confirm(`Remove staff access for ${m.email}? They will be signed out of /admin and can no longer sign in.`)) return;
    setError(''); setOk('');
    try { await api(`/api/admin/staff/${m.id}`, { method: 'DELETE' }); setOk(`${m.email} no longer has staff access.`); await load(); } catch (er) { setError(er.message); }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-black">Staff Access</h1>
        <p className="text-xs text-zinc-500 mt-1">Owner only. Only the emails listed here can sign in at <span className="font-mono">/admin/login</span>. Each sign-in needs a one-time code sent to that email, so there are no passwords to share.</p>
      </div>
      {error && <p role="alert" className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">{error}</p>}
      {ok && <p role="status" className="text-sm text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg p-3">{ok}</p>}

      <section className="bg-white rounded-2xl border p-4">
        <h2 className="font-black mb-3 flex items-center gap-2"><UserPlus size={18} /> Add staff</h2>
        <form onSubmit={add} className="grid sm:grid-cols-[1.5fr_1fr_auto_auto] gap-2 items-end">
          <label className="text-xs font-semibold text-zinc-600">Email
            <input required type="email" autoComplete="off" placeholder="name@example.com" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className={`${inp} w-full mt-1`} />
          </label>
          <label className="text-xs font-semibold text-zinc-600">Name (optional)
            <input maxLength={80} placeholder="e.g. Ali" value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} className={`${inp} w-full mt-1`} />
          </label>
          <label className="text-xs font-semibold text-zinc-600">Role
            <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} className={`${inp} w-full mt-1`}>
              <option value="admin">Admin</option>
              <option value="kitchen">Kitchen</option>
            </select>
          </label>
          <button disabled={busy} className="bg-red-700 hover:bg-red-600 disabled:opacity-60 text-white font-bold rounded-lg px-4 py-2 text-sm h-[38px]">{busy ? 'Adding…' : 'Add staff'}</button>
        </form>
        <p className="text-xs text-zinc-500 mt-2"><strong className="capitalize">{form.role}:</strong> {ROLE_HELP[form.role]}</p>
      </section>

      <section className="bg-white rounded-2xl border p-4">
        <h2 className="font-black mb-3">Who can sign in</h2>
        {!staff ? <Loader2 className="animate-spin text-zinc-400" /> : (
          <ul className="divide-y text-sm">
            {staff.map((m) => {
              const isOwner = m.role === 'owner';
              return (
                <li key={m.id} className="py-3 flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-semibold truncate">{m.fullName || m.email}{m.id === meId && <span className="ml-2 text-[10px] bg-zinc-100 text-zinc-600 rounded px-1.5 py-0.5 align-middle">YOU</span>}{!m.isActive && <span className="ml-2 text-[10px] bg-amber-100 text-amber-800 rounded px-1.5 py-0.5 align-middle">DISABLED</span>}</div>
                    {m.fullName && <div className="text-xs text-zinc-500 truncate">{m.email}</div>}
                    <div className="text-[11px] text-zinc-400">{m.lastLoginAt ? `Last sign-in ${when(m.lastLoginAt)}` : 'Has not signed in yet'}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    {isOwner ? (
                      <span className="text-xs font-bold bg-red-700 text-white rounded-lg px-3 py-1.5">Owner</span>
                    ) : (
                      <>
                        <select aria-label={`Role for ${m.email}`} value={m.role} onChange={(e) => changeRole(m, e.target.value)} className={inp}>
                          <option value="admin">Admin</option>
                          <option value="kitchen">Kitchen</option>
                        </select>
                        <button onClick={() => remove(m)} className="flex items-center gap-1.5 text-red-700 hover:bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs font-semibold"><Trash2 size={14} /> Remove access</button>
                      </>
                    )}
                  </div>
                </li>
              );
            })}
            {!staff.length && <li className="py-3 text-zinc-400 text-xs">No staff yet.</li>}
          </ul>
        )}
      </section>
    </div>
  );
}
