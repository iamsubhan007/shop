'use client';

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Bike, Store, Copy, Check, Upload, AlertCircle, Loader2, ShoppingBag, Banknote, Wallet, Landmark } from 'lucide-react';
import { useCart } from '@/context/CartContext';
import { useAuth } from '@/context/AuthContext';
import { useSite } from '@/context/SiteContext';
import LocationRadiusChecker from '@/components/delivery/LocationRadiusChecker';
import { PAYMENT_LABELS, PAYMENT_METHODS } from '@/lib/orderStatus';
import { prepareImage } from '@/lib/compressImage';

const ICONS = { bank_transfer: Landmark, jazzcash: Wallet, easypaisa: Wallet, cod: Banknote };

export default function CheckoutPage() {
  const router = useRouter();
  const { items, subtotal, deliveryFee, total, orderType, setOrderType, customerLocation, clearCart } = useCart();
  const { user, loading: authLoading, profileComplete } = useAuth();
  const { settings } = useSite();

  const [instructions, setInstructions] = useState(null);
  const [paymentMethod, setPaymentMethod] = useState('');
  const [reference, setReference] = useState('');
  const [proofFile, setProofFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [notes, setNotes] = useState('');
  const [couponInput, setCouponInput] = useState('');
  const [coupon, setCoupon] = useState(null); // { code, discount }
  const [couponMsg, setCouponMsg] = useState('');
  const [copied, setCopied] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const idemKey = useRef(null);

  useEffect(() => {
    if (authLoading) return;
    if (!user || !profileComplete) router.replace('/auth?next=/checkout');
  }, [authLoading, user, profileComplete, router]);

  useEffect(() => {
    if (!user) return;
    fetch('/api/settings?payment=1', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => setInstructions(d.paymentInstructions || null))
      .catch(() => {});
  }, [user]);

  // Keep chosen order type valid against shop settings
  useEffect(() => {
    if (!settings) return;
    if (orderType === 'delivery' && !settings.delivery.enabled && settings.pickup.enabled) setOrderType('pickup');
  }, [settings, orderType, setOrderType]);

  // Only offer methods allowed for this order type AND configured by the owner
  const available = settings
    ? PAYMENT_METHODS[orderType].filter((m) => (m === 'cod' ? true : settings.paymentMethods[m]))
    : [];
  useEffect(() => {
    if (!available.includes(paymentMethod)) setPaymentMethod(available[0] || '');
  }, [orderType, settings]); // eslint-disable-line react-hooks/exhaustive-deps

  const copy = (text, key) => {
    navigator.clipboard?.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(''), 1500);
  };

  const onFile = async (file) => {
    if (!file) return;
    setUploading(true);
    setError('');
    try {
      const fd = new FormData();
      fd.append('file', await prepareImage(file)); // big screenshots are shrunk first so they upload reliably
      const res = await fetch('/api/upload/proof', { method: 'POST', body: fd });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        return setError(j.error || (res.status === 413 ? 'That image is too large. Please choose a smaller screenshot.' : 'Upload failed. Please try again, or enter the transaction ID instead.'));
      }
      setProofFile(j.file);
    } catch {
      setError('Upload failed. Check your connection and try again, or enter the transaction ID instead.');
    } finally {
      setUploading(false);
    }
  };

  const applyCoupon = async () => {
    setCouponMsg('');
    const res = await fetch('/api/coupons/validate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: couponInput, subtotal }) });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) { setCoupon(null); return setCouponMsg(j.error || 'Invalid coupon.'); }
    setCoupon(j);
  };
  // Re-check when the cart changes so the preview never shows a stale discount
  useEffect(() => { if (coupon) { setCoupon(null); setCouponMsg('Cart changed — please apply your coupon again.'); } }, [subtotal]); // eslint-disable-line react-hooks/exhaustive-deps

  const place = async (e) => {
    e.preventDefault();
    setError('');
    if (!items.length) return setError('Your cart is empty.');
    if (orderType === 'delivery') {
      if (!customerLocation?.lat) return setError('Please set your delivery location on the map.');
      if (!customerLocation.isEligible) return setError('Your location is outside our delivery area. Please choose pickup.');
      if ((customerLocation.address || '').trim().length < 5) return setError('Please enter your full delivery address.');
    }
    if (!paymentMethod) return setError('Please choose a payment method.');

    setSubmitting(true);
    idemKey.current ||= crypto.randomUUID();
    try {
      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderType,
          customerName: user.fullName,
          customerPhone: user.phone,
          deliveryAddress: orderType === 'delivery' ? customerLocation.address : undefined,
          deliveryLat: orderType === 'delivery' ? customerLocation.lat : undefined,
          deliveryLng: orderType === 'delivery' ? customerLocation.lng : undefined,
          paymentMethod,
          paymentReference: reference || undefined,
          paymentProofFile: proofFile || undefined,
          specialInstructions: notes || undefined,
          couponCode: coupon?.code || undefined,
          idempotencyKey: idemKey.current,
          items: items.map((i) => ({ type: i.is_deal ? 'deal' : 'product', id: i.id, quantity: i.quantity, notes: i.notes || undefined })),
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (j.code !== 'ordering_closed') idemKey.current = null; // allow a corrected retry as a new order
        setError(j.error || 'Could not place your order.');
        window.scrollTo({ top: 0, behavior: 'smooth' });
        return;
      }
      clearCart();
      router.replace(`/orders/${j.orderId}?placed=1`);
    } catch {
      setError('Network problem. Please check your connection and try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (authLoading || !user || !settings) return <div className="min-h-[60vh] flex items-center justify-center"><Loader2 className="animate-spin text-zinc-400" /></div>;

  if (!items.length) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center gap-3 text-center p-6">
        <ShoppingBag size={36} className="text-zinc-300" />
        <h1 className="font-bold text-zinc-800">Your cart is empty</h1>
        <Link href="/Menu" className="px-5 py-2.5 bg-red-700 text-white rounded-xl text-sm font-bold">Browse the menu</Link>
      </div>
    );
  }

  const closed = settings.orderingState && !settings.orderingState.open;
  const deliveryOn = settings.delivery.enabled;
  const pickupOn = settings.pickup.enabled;
  const pay = instructions?.[paymentMethod];
  const card = 'bg-white rounded-2xl border border-zinc-200 p-5 shadow-sm';

  return (
    <div className="bg-zinc-50 min-h-screen py-8 px-4">
      <form onSubmit={place} className="max-w-5xl mx-auto grid lg:grid-cols-[1fr_340px] gap-6">
        <div className="space-y-5">
          <Link href="/Menu" className="inline-flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-800"><ArrowLeft size={14} /> Back to menu</Link>
          <h1 className="text-2xl font-black text-zinc-900">Checkout</h1>

          {closed && (
            <div role="alert" className="rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-sm p-4">
              {settings.orderingState.notice || 'We are not taking orders right now.'}
            </div>
          )}
          {error && (
            <div role="alert" className="rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm p-4 flex gap-2">
              <AlertCircle size={16} className="shrink-0 mt-0.5" /> {error}
            </div>
          )}

          <section className={card}>
            <h2 className="font-bold text-sm mb-3">How would you like your order?</h2>
            <div className="grid grid-cols-2 gap-2 p-1 bg-zinc-100 rounded-xl">
              {[['delivery', 'Home delivery', Bike, deliveryOn], ['pickup', 'Pickup', Store, pickupOn]].map(([k, label, Icon, on]) => (
                <button key={k} type="button" disabled={!on} onClick={() => setOrderType(k)}
                  className={`flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold disabled:opacity-40 ${orderType === k ? 'bg-red-700 text-white shadow' : 'text-zinc-600'}`}>
                  <Icon size={15} /> {label}{!on && ' (unavailable)'}
                </button>
              ))}
            </div>
            {orderType === 'pickup' && (
              <p className="text-xs text-zinc-600 mt-3">Collect from: <strong>{settings.shop.address}</strong>. <a className="text-red-700 underline" target="_blank" rel="noreferrer" href={`https://www.google.com/maps/dir/?api=1&destination=${settings.shop.lat},${settings.shop.lng}`}>Get directions</a></p>
            )}
          </section>

          {orderType === 'delivery' && <LocationRadiusChecker />}

          <section className={card}>
            <h2 className="font-bold text-sm mb-1">Contact</h2>
            <p className="text-xs text-zinc-600">{user.fullName} · {user.phone} · {user.email}</p>
            <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} placeholder="Special instructions (optional)" className="mt-3 w-full text-sm p-3 border border-zinc-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-600/30" />
          </section>

          <section className={card}>
            <h2 className="font-bold text-sm mb-3">Payment</h2>
            {orderType === 'pickup' && <p className="text-xs text-zinc-500 mb-3">Cash on delivery is only available for home delivery.</p>}
            {available.length === 0 ? (
              <p className="text-sm text-red-700">No payment method is available right now. Please contact the shop.</p>
            ) : (
              <div className="grid sm:grid-cols-2 gap-2">
                {available.map((m) => {
                  const Icon = ICONS[m];
                  return (
                    <label key={m} className={`flex items-center gap-2.5 p-3 rounded-xl border cursor-pointer text-sm ${paymentMethod === m ? 'border-red-600 bg-red-50' : 'border-zinc-200'}`}>
                      <input type="radio" name="pm" className="accent-red-700" checked={paymentMethod === m} onChange={() => setPaymentMethod(m)} />
                      <Icon size={16} className="text-zinc-600" /> {PAYMENT_LABELS[m]}
                    </label>
                  );
                })}
              </div>
            )}

            {paymentMethod === 'cod' && <p className="text-xs text-zinc-600 mt-3">Pay in cash to the rider when your order arrives.</p>}

            {paymentMethod && paymentMethod !== 'cod' && (
              <div className="mt-4 space-y-3">
                {pay ? (
                  <div className="rounded-xl bg-zinc-50 border border-zinc-200 p-4 text-sm space-y-2">
                    {Object.entries(pay).filter(([k, v]) => k !== 'enabled' && v).map(([k, v]) => (
                      <div key={k} className="flex items-center justify-between gap-2">
                        <span className="text-zinc-500 capitalize">{k.replace(/_/g, ' ')}</span>
                        <button type="button" onClick={() => copy(String(v), k)} className="flex items-center gap-1.5 font-semibold text-zinc-900">
                          {v} {copied === k ? <Check size={13} className="text-emerald-600" /> : <Copy size={13} className="text-zinc-400" />}
                        </button>
                      </div>
                    ))}
                    {instructions?.instructions && <p className="text-xs text-zinc-600 pt-2 border-t border-zinc-200">{instructions.instructions}</p>}
                  </div>
                ) : <Loader2 className="animate-spin text-zinc-400" size={16} />}
                <p className="text-xs text-zinc-600">Send <strong>Rs. {total}</strong>, then enter the transaction ID and/or upload a screenshot. You can also add it after placing the order. We confirm your order once we verify the payment.</p>
                <input value={reference} onChange={(e) => setReference(e.target.value)} maxLength={100} placeholder="Transaction / reference ID" className="w-full text-sm p-3 border border-zinc-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-600/30" />
                <label className="flex items-center gap-2 text-xs font-semibold text-zinc-700 cursor-pointer">
                  <span className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-zinc-300 bg-white">
                    {uploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />} {proofFile ? 'Screenshot attached ✓' : 'Upload payment screenshot'}
                  </span>
                  <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
                </label>
              </div>
            )}
          </section>
        </div>

        <aside className="lg:sticky lg:top-24 h-fit space-y-4">
          <div className={card}>
            <h2 className="font-bold text-sm mb-3">Order summary</h2>
            <ul className="divide-y divide-zinc-100 text-sm">
              {items.map((i) => (
                <li key={i.cartKey} className="py-2 flex justify-between gap-2"><span>{i.quantity} × {i.title}</span><span className="font-semibold">Rs. {i.price * i.quantity}</span></li>
              ))}
            </ul>
            <div className="mt-3 flex gap-2">
              <input value={couponInput} onChange={(e) => setCouponInput(e.target.value.toUpperCase())} placeholder="Coupon code" maxLength={40} aria-label="Coupon code" className="flex-1 text-sm p-2.5 border border-zinc-300 rounded-xl" />
              <button type="button" onClick={applyCoupon} disabled={!couponInput} className="px-3 text-sm font-semibold border rounded-xl disabled:opacity-40">Apply</button>
            </div>
            {couponMsg && <p role="alert" className="text-xs text-red-700 mt-1">{couponMsg}</p>}
            <dl className="mt-3 pt-3 border-t border-zinc-200 text-sm space-y-1">
              <div className="flex justify-between"><dt className="text-zinc-500">Subtotal</dt><dd>Rs. {subtotal}</dd></div>
              {coupon && <div className="flex justify-between text-emerald-700"><dt>Coupon {coupon.code}</dt><dd>- Rs. {coupon.discount}</dd></div>}
              <div className="flex justify-between"><dt className="text-zinc-500">Delivery</dt><dd>{orderType === 'pickup' ? 'Pickup' : deliveryFee ? `Rs. ${deliveryFee}` : 'Free'}</dd></div>
              <div className="flex justify-between font-black text-base pt-1"><dt>Total</dt><dd>Rs. {total - (coupon?.discount || 0)}</dd></div>
            </dl>
            <p className="text-[11px] text-zinc-400 mt-2">Final prices and availability are confirmed when you place the order.</p>
            <button type="submit" disabled={submitting || closed || !paymentMethod} className="mt-4 w-full flex items-center justify-center gap-2 bg-red-700 hover:bg-red-600 disabled:bg-zinc-400 text-white font-bold py-3 rounded-xl text-sm">
              {submitting ? <><Loader2 size={16} className="animate-spin" /> Placing order…</> : `Place order · Rs. ${total}`}
            </button>
          </div>
        </aside>
      </form>
    </div>
  );
}
