'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Loader2, Receipt, RotateCcw, X } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useCart } from '@/context/CartContext';
import { PAYMENT_LABELS, statusColor } from '@/lib/orderStatus';

export default function OrdersPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const { addToCart, clearCart } = useCart();
  const [orders, setOrders] = useState(null);
  const [error, setError] = useState('');
  const [reorder, setReorder] = useState(null); // { orderNumber, items }
  const [busy, setBusy] = useState('');

  useEffect(() => {
    if (authLoading) return;
    if (!user) return router.replace('/auth?next=/orders');
    fetch('/api/orders/mine', { cache: 'no-store' })
      .then((r) => r.json())
      .then((j) => (j.orders ? setOrders(j.orders) : setError(j.error || 'Could not load orders.')))
      .catch(() => setError('Could not load orders.'));
  }, [authLoading, user, router]);

  const startReorder = async (o) => {
    setBusy(o.id);
    const res = await fetch(`/api/orders/${o.id}/reorder`, { method: 'POST' });
    const j = await res.json().catch(() => ({}));
    setBusy('');
    if (!res.ok) return setError(j.error || 'Could not prepare reorder.');
    setReorder({ orderNumber: o.orderNumber, items: j.items });
  };

  const confirmReorder = () => {
    clearCart();
    reorder.items.filter((i) => i.available).forEach((i) =>
      addToCart({ id: i.id, title: i.title, price: i.price, image_url: i.imageUrl, is_deal: i.type === 'deal' }, i.quantity)
    );
    setReorder(null);
  };

  if (authLoading || (!orders && !error)) return <div className="min-h-[60vh] flex items-center justify-center"><Loader2 className="animate-spin text-zinc-400" /></div>;

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-black text-zinc-900 mb-6">My orders</h1>
      {error && <div role="alert" className="mb-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm p-3">{error}</div>}
      {orders?.length === 0 && (
        <div className="text-center py-16 text-zinc-500">
          <Receipt className="mx-auto mb-3 text-zinc-300" size={36} />
          <p className="text-sm mb-4">You haven&apos;t placed any orders yet.</p>
          <Link href="/Menu" className="px-5 py-2.5 bg-red-700 text-white rounded-xl text-sm font-bold">Start ordering</Link>
        </div>
      )}
      <ul className="space-y-3">
        {orders?.map((o) => (
          <li key={o.id} className="bg-white rounded-2xl border border-zinc-200 p-4 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Link href={`/orders/${o.id}`} className="font-bold text-zinc-900 hover:text-red-700">{o.orderNumber}</Link>
              <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full ${statusColor(o.status)}`}>{o.status}</span>
            </div>
            <p className="text-xs text-zinc-500 mt-1">
              {new Date(o.createdAt).toLocaleString('en-PK', { timeZone: 'Asia/Karachi', dateStyle: 'medium', timeStyle: 'short' })} · {o.orderType === 'delivery' ? 'Delivery' : 'Pickup'} · {PAYMENT_LABELS[o.paymentMethod]}
            </p>
            <p className="text-xs text-zinc-600 mt-2 line-clamp-2">{o.items.map((i) => `${i.quantity}× ${i.title}`).join(', ')}</p>
            <div className="flex items-center justify-between mt-3">
              <span className="font-black">Rs. {o.totalAmount}</span>
              <div className="flex gap-2">
                <Link href={`/orders/${o.id}`} className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-zinc-300">Track</Link>
                {o.status === 'Completed' && (
                  <button onClick={() => startReorder(o)} disabled={busy === o.id} className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-red-700 text-white flex items-center gap-1">
                    {busy === o.id ? <Loader2 size={12} className="animate-spin" /> : <RotateCcw size={12} />} Reorder
                  </button>
                )}
              </div>
            </div>
          </li>
        ))}
      </ul>

      {reorder && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-end sm:items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Reorder">
          <div className="bg-white rounded-2xl w-full max-w-md p-5 max-h-[85vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-3">
              <h2 className="font-bold">Reorder {reorder.orderNumber}</h2>
              <button onClick={() => setReorder(null)} aria-label="Close"><X size={18} /></button>
            </div>
            <p className="text-xs text-zinc-500 mb-3">Prices below are today&apos;s prices. Nothing is ordered until you check out.</p>
            <ul className="space-y-2 text-sm">
              {reorder.items.map((i, k) => (
                <li key={k} className={`flex justify-between gap-2 ${i.available ? '' : 'text-zinc-400'}`}>
                  <span>{i.quantity}× {i.title}{!i.available && <em className="block text-[11px] text-red-600 not-italic">No longer available — will be skipped</em>}</span>
                  {i.available && <span className="text-right">Rs. {i.price * i.quantity}{i.priceChanged && <em className="block text-[11px] text-amber-700 not-italic">was Rs. {i.oldPrice} each</em>}</span>}
                </li>
              ))}
            </ul>
            {reorder.items.some((i) => i.available) ? (
              <button onClick={() => { confirmReorder(); router.push('/checkout'); }} className="mt-5 w-full bg-red-700 text-white font-bold py-3 rounded-xl text-sm">Add to cart & continue</button>
            ) : <p className="mt-4 text-sm text-red-700">None of these items are available right now.</p>}
          </div>
        </div>
      )}
    </div>
  );
}
