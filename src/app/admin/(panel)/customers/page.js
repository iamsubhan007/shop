'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2, Search } from 'lucide-react';
import { api, rs, when } from '@/components/admin/api';

const inp = 'border border-zinc-300 rounded-lg px-3 py-2 text-sm bg-white';

export default function CustomersAdmin() {
  const [q, setQ] = useState('');
  const [customers, setCustomers] = useState(null);
  const [coupons, setCoupons] = useState([]);
  const [msg, setMsg] = useState('');
  const [c, setC] = useState({ code: '', kind: 'percent', value: '', minOrder: '0', maxUses: '', endsAt: '' });

  const load = useCallback(() => {
    api(`/api/admin/customers?q=${encodeURIComponent(q)}`).then((d) => setCustomers(d.customers)).catch((e) => setMsg(e.message));
    api('/api/admin/coupons').then((d) => setCoupons(d.coupons)).catch(() => {});
  }, [q]);
  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [load]);

  const addCoupon = async (e) => {
    e.preventDefault(); setMsg('');
    try {
      await api('/api/admin/coupons', { method: 'POST', body: { code: c.code, kind: c.kind, value: Number(c.value), minOrder: Number(c.minOrder) || 0, maxUses: c.maxUses ? Number(c.maxUses) : null, endsAt: c.endsAt ? new Date(c.endsAt).toISOString() : null } });
      setC({ code: '', kind: 'percent', value: '', minOrder: '0', maxUses: '', endsAt: '' }); load();
    } catch (er) { setMsg(er.message); }
  };
  const toggle = async (x) => { try { await api(`/api/admin/coupons/${x.id}`, { method: 'PATCH', body: { isActive: !x.isActive } }); load(); } catch (e) { setMsg(e.message); } };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <h1 className="text-2xl font-black">Customers & Coupons</h1>
      {msg && <p role="alert" className="text-sm text-red-700 bg-red-50 rounded-lg p-3">{msg}</p>}

      <section className="bg-white rounded-2xl border p-4">
        <h2 className="font-black mb-3">Coupons</h2>
        <p className="text-xs text-zinc-500 mb-3">Coupons only exist when you create them here. Customers type the code at checkout.</p>
        <form onSubmit={addCoupon} className="grid sm:grid-cols-3 lg:grid-cols-6 gap-2 mb-4 items-end">
          <input required placeholder="CODE" value={c.code} onChange={(e) => setC({ ...c, code: e.target.value.toUpperCase() })} className={inp} aria-label="Code" />
          <select value={c.kind} onChange={(e) => setC({ ...c, kind: e.target.value })} className={inp} aria-label="Type"><option value="percent">% off</option><option value="fixed">Rs. off</option></select>
          <input required type="number" min="1" placeholder="Amount" value={c.value} onChange={(e) => setC({ ...c, value: e.target.value })} className={inp} aria-label="Amount" />
          <input type="number" min="0" placeholder="Min order" value={c.minOrder} onChange={(e) => setC({ ...c, minOrder: e.target.value })} className={inp} aria-label="Minimum order" />
          <input type="number" min="1" placeholder="Max uses" value={c.maxUses} onChange={(e) => setC({ ...c, maxUses: e.target.value })} className={inp} aria-label="Maximum uses" />
          <button className="bg-red-700 text-white font-bold rounded-lg py-2 text-sm">Add</button>
        </form>
        <ul className="divide-y text-sm">
          {coupons.map((x) => (
            <li key={x.id} className="py-2 flex flex-wrap items-center justify-between gap-2">
              <span><strong>{x.code}</strong> · {x.kind === 'percent' ? `${x.value}% off` : `Rs. ${x.value} off`}{x.minOrder > 0 && ` · min Rs. ${x.minOrder}`} · used {x.usedCount}{x.maxUses ? `/${x.maxUses}` : ''}{x.endsAt && ` · until ${new Date(x.endsAt).toLocaleDateString('en-PK')}`}</span>
              <label className="flex items-center gap-1.5 text-xs"><input type="checkbox" checked={x.isActive} onChange={() => toggle(x)} className="w-5 h-5 accent-emerald-600" /> Active</label>
            </li>
          ))}
          {!coupons.length && <li className="py-3 text-zinc-400 text-xs">No coupons yet.</li>}
        </ul>
      </section>

      <section className="bg-white rounded-2xl border p-4">
        <div className="flex flex-wrap justify-between items-center gap-2 mb-3"><h2 className="font-black">Customers</h2>
          <div className="relative"><Search size={14} className="absolute left-2.5 top-3 text-zinc-400" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, email or phone" className={`${inp} pl-8`} aria-label="Search customers" /></div></div>
        {!customers ? <Loader2 className="animate-spin text-zinc-400" /> : (
          <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="text-left text-xs text-zinc-500"><th className="py-1">Name</th><th>Phone</th><th>Completed</th><th>Lifetime spend</th><th>Points</th><th>Joined</th></tr></thead>
            <tbody>{customers.map((x) => <tr key={x.id} className="border-t"><td className="py-1.5">{x.full_name || '—'} {x.repeat && <span className="text-[10px] bg-emerald-100 text-emerald-800 rounded px-1.5">REPEAT</span>}<div className="text-[11px] text-zinc-400">{x.email}</div></td><td>{x.phone || '—'}</td><td>{x.completed}</td><td>{rs(x.spent)}</td><td>{x.loyalty_points}</td><td className="text-xs">{when(x.created_at)}</td></tr>)}</tbody></table>
            {!customers.length && <p className="text-xs text-zinc-400 py-3">No customers found.</p>}</div>
        )}
      </section>
    </div>
  );
}
