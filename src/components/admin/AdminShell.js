'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import NewOrderAlert from '@/components/admin/NewOrderAlert';
import PushToggle from '@/components/admin/PushToggle';
import StorageBanner from '@/components/admin/StorageBanner';
import { BarChart3, Bike, ChefHat, DatabaseBackup, HardDrive, LayoutDashboard, LogOut, Menu as MenuIcon, Receipt, Settings, Tag, UserCog, UtensilsCrossed, Users, X } from 'lucide-react';

const NAV = [
  { href: '/admin', label: 'Dashboard', ur: 'ڈیش بورڈ', icon: LayoutDashboard, roles: ['owner', 'admin'] },
  { href: '/admin/orders', label: 'Orders', ur: 'آرڈرز', icon: Receipt, roles: ['owner', 'admin'] },
  { href: '/admin/kitchen', label: 'Kitchen', ur: 'کچن', icon: ChefHat, roles: ['owner', 'admin', 'kitchen'] },
  { href: '/admin/rider', label: 'Deliveries', ur: 'ڈیلیوری', icon: Bike, roles: ['rider'] },
  { href: '/admin/menu', label: 'Menu & Stock', ur: 'مینو', icon: UtensilsCrossed, roles: ['owner', 'admin'] },
  { href: '/admin/deals', label: 'Deals', ur: 'ڈیلز', icon: Tag, roles: ['owner', 'admin'] },
  { href: '/admin/reports', label: 'Reports', ur: 'رپورٹس', icon: BarChart3, roles: ['owner', 'admin'] },
  { href: '/admin/customers', label: 'Customers & Coupons', ur: 'گاہک', icon: Users, roles: ['owner', 'admin'] },
  { href: '/admin/system', label: 'Backups & Activity', ur: 'بیک اپ', icon: DatabaseBackup, roles: ['owner'] },
  { href: '/admin/storage', label: 'Storage & Backups', ur: 'اسٹوریج', icon: HardDrive, roles: ['owner', 'admin'] },
  { href: '/admin/staff', label: 'Staff Access', ur: 'اسٹاف', icon: UserCog, roles: ['owner'] },
  { href: '/admin/settings', label: 'Shop Settings', ur: 'سیٹنگز', icon: Settings, roles: ['owner', 'admin'] },
];

export default function AdminShell({ user, children }) {
  const path = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const links = NAV.filter((n) => n.roles.includes(user.role));

  // A rider only has the Deliveries screen. Anything else they open (a bookmark, a typed address) is sent there
  // before it renders, so they never hit another page's data requests. The server refuses those requests anyway.
  const isRider = user.role === 'rider';
  const riderOffRoute = isRider && !path.startsWith('/admin/rider');
  useEffect(() => { if (riderOffRoute) router.replace('/admin/rider'); }, [riderOffRoute, router]);

  const logout = async () => {
    await fetch('/api/auth/logout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ scope: 'staff' }) });
    router.replace('/admin/login');
  };

  const nav = (
    <nav className="flex flex-col gap-1 p-3" aria-label="Admin">
      {links.map(({ href, label, ur, icon: Icon }) => {
        const active = href === '/admin' ? path === '/admin' : path.startsWith(href);
        return (
          <Link key={href} href={href} onClick={() => setOpen(false)} className={`flex items-center gap-3 px-3.5 py-3 rounded-xl text-sm font-semibold ${active ? 'bg-red-700 text-white' : 'text-zinc-300 hover:bg-zinc-800'}`}>
            <Icon size={18} /> <span>{label}</span> <span className="ml-auto text-[11px] opacity-60" lang="ur">{ur}</span>
          </Link>
        );
      })}
    </nav>
  );

  return (
    <div className="fixed inset-0 z-[60] flex bg-zinc-100 text-zinc-900">
      <aside className="hidden lg:flex w-60 shrink-0 flex-col bg-zinc-950 overflow-y-auto">
        <div className="p-5 text-white font-black text-lg">HBT Admin</div>
        {nav}
        <div className="mt-auto p-4 text-xs text-zinc-400 border-t border-zinc-800">
          <div className="truncate text-zinc-200 font-semibold">{user.name}</div>
          <div className="capitalize mb-2">{user.role}</div>
          {!isRider && <div className="mb-3"><PushToggle role={user.role} /></div>}
          <button onClick={logout} className="flex items-center gap-2 text-red-400 font-semibold"><LogOut size={14} /> Sign out</button>
        </div>
      </aside>

      {open && (
        <div className="lg:hidden fixed inset-0 z-10 flex">
          <div className="w-64 bg-zinc-950 flex flex-col overflow-y-auto">
            <div className="p-4 flex justify-between text-white font-black">HBT Admin <button onClick={() => setOpen(false)} aria-label="Close menu"><X /></button></div>
            {nav}
            <div className="mt-auto p-4 pb-24 space-y-3">{/* pb-24 keeps these clear of the folded new-order bar */}
              {!isRider && <PushToggle role={user.role} />}
              <button onClick={logout} className="flex items-center gap-2 text-red-400 text-sm font-semibold"><LogOut size={14} /> Sign out</button>
            </div>
          </div>
          <div className="flex-1 bg-black/50" onClick={() => setOpen(false)} />
        </div>
      )}

      <div className="flex-1 flex flex-col min-w-0">
        <header className="lg:hidden flex items-center gap-3 bg-zinc-950 text-white p-3">
          <button onClick={() => setOpen(true)} aria-label="Open menu"><MenuIcon /></button>
          <span className="font-black">HBT Admin</span>
        </header>
        {['owner', 'admin'].includes(user.role) && <StorageBanner />}
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 print:overflow-visible">{riderOffRoute ? null : children}</main>
      </div>
      {!isRider && <NewOrderAlert role={user.role} />}
    </div>
  );
}
