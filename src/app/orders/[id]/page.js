'use client';

import React, { Suspense, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { CheckCircle2, Circle, Loader2, MessageCircle, Star, Upload, XCircle } from 'lucide-react';
import { useSite } from '@/context/SiteContext';
import { useAuth } from '@/context/AuthContext';
import { CUSTOMER_CANCELLABLE, PAYMENT_LABELS, statusColor, timelineSteps } from '@/lib/orderStatus';
import { prepareImage } from '@/lib/compressImage';
import OrderProgressHero from '@/components/OrderProgressHero';

const fmt = (d) => new Date(d).toLocaleString('en-PK', { timeZone: 'Asia/Karachi', dateStyle: 'medium', timeStyle: 'short' });

function OrderView() {
  const { id } = useParams();
  const sp = useSearchParams();
  const token = sp.get('t');
  const placed = sp.get('placed');
  const { settings } = useSite();
  const { user } = useAuth();
  const [order, setOrder] = useState(null);
  const [notFound, setNotFound] = useState(false);
  const [msg, setMsg] = useState('');
  const [ref, setRef] = useState('');
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [stars, setStars] = useState(0); // feedback form
  const [fbText, setFbText] = useState('');
  const [fbBusy, setFbBusy] = useState(false);
  const [fbMsg, setFbMsg] = useState('');
  const [editFb, setEditFb] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/orders/${id}${token ? `?t=${token}` : ''}`, { cache: 'no-store' });
    if (res.status === 404) return setNotFound(true);
    const j = await res.json();
    setOrder(j.order);
  }, [id, token]);

  useEffect(() => {
    load();
    const t = setInterval(load, 20000); // live status
    return () => clearInterval(t);
  }, [load]);

  const upload = async (f) => {
    try {
      const fd = new FormData();
      fd.append('file', await prepareImage(f)); // big screenshots are shrunk first so they upload reliably
      const res = await fetch('/api/upload/proof', { method: 'POST', body: fd });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        return setMsg(j.error || (res.status === 413 ? 'That image is too large. Please choose a smaller screenshot.' : 'Upload failed. Please try again, or enter the transaction ID instead.'));
      }
      setFile(j.file);
    } catch {
      setMsg('Upload failed. Check your connection and try again, or enter the transaction ID instead.');
    }
  };

  const submitPayment = async () => {
    setBusy(true);
    setMsg('');
    const res = await fetch(`/api/orders/${order.id}/payment`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reference: ref || undefined, proofFile: file || undefined }) });
    const j = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setMsg(j.error || 'Could not submit.');
    setRef('');
    setFile(null);
    load();
  };

  const cancel = async () => {
    if (!confirm('Cancel this order?')) return;
    setBusy(true);
    const res = await fetch(`/api/orders/${order.id}/cancel`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    const j = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) setMsg(j.error || 'Could not cancel.');
    load();
  };

  const sendFeedback = async () => {
    if (!stars) return setFbMsg('Please tap the stars to rate your order.');
    setFbBusy(true); setFbMsg('');
    try {
      const res = await fetch(`/api/orders/${order.id}/feedback`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rating: stars, comment: fbText || null }) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) setFbMsg(j.error || 'Could not send your feedback. Please try again.');
      else { setEditFb(false); await load(); }
    } catch { setFbMsg('Could not send your feedback. Check your connection and try again.'); }
    setFbBusy(false);
  };

  if (notFound) return <div className="min-h-[60vh] flex flex-col items-center justify-center gap-3 p-6 text-center"><h1 className="font-bold">Order not found</h1><p className="text-sm text-zinc-500">Check the link, or sign in with the account you ordered with.</p><Link href="/auth?next=/orders" className="px-5 py-2.5 bg-red-700 text-white rounded-xl text-sm font-bold">Sign in</Link></div>;
  if (!order) return <div className="min-h-[60vh] flex items-center justify-center"><Loader2 className="animate-spin text-zinc-400" /></div>;

  const steps = timelineSteps(order.orderType, order.paymentMethod);
  const reached = new Map(order.history.map((h) => [h.to, h.at]));
  const dead = ['Cancelled', 'Rejected'].includes(order.status);
  const isOwner = user && order.userId === user.id;
  const wa = settings?.shop.whatsapp;
  const waText = encodeURIComponent(`Hello Haq Bahu Tandoor, I need help with my order ${order.orderNumber}.`);
  const canPay = isOwner && order.canSubmitPayment;
  const reminded = !dead && order.paymentReminderAt;
  const card = 'bg-white rounded-2xl border border-zinc-200 p-5 shadow-sm';

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-5">
      {placed && (
        <div role="status" className="rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-900 p-4 text-sm">
          <strong>Thank you! Your order {order.orderNumber} has been received.</strong>
          {order.status === 'Payment Pending' && ' Please send your payment and submit the details below so we can confirm it.'}
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-black">{order.orderNumber}</h1>
        <span className={`text-xs font-bold px-3 py-1 rounded-full ${statusColor(order.status)}`}>{order.status}</span>
      </div>

      {reminded && (
        <div role="alert" data-testid="payment-reminder" className="rounded-2xl bg-red-50 border border-red-200 text-red-900 p-4 text-sm">
          <strong>We have not received your payment of Rs. {order.totalAmount} yet.</strong>
          <p className="mt-1">Please send it. If you have already sent it, {canPay ? 'add a proof of payment (screenshot or transaction ID) below.' : 'sign in with the account you ordered with to add a proof of payment.'}</p>
        </div>
      )}

      {order.etaAt && !dead && <OrderProgressHero order={order} />}

      <section className={card} aria-label="Order progress">
        {dead ? (
          <p className="flex items-center gap-2 text-sm text-red-700"><XCircle size={18} /> This order was {order.status.toLowerCase()}.{order.cancelReason ? ` Reason: ${order.cancelReason}` : ''}</p>
        ) : (
          <ol className="space-y-3">
            {steps.map((s) => {
              const at = reached.get(s);
              return (
                <li key={s} className="flex items-start gap-3">
                  {at ? <CheckCircle2 size={18} className="text-emerald-600 mt-0.5" /> : <Circle size={18} className={`mt-0.5 ${s === order.status ? 'text-amber-500' : 'text-zinc-300'}`} />}
                  <div>
                    <div className={`text-sm font-semibold ${at ? 'text-zinc-900' : 'text-zinc-400'}`}>{s}</div>
                    {at && <div className="text-[11px] text-zinc-500">{fmt(at)}</div>}
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </section>

      <section className={card}>
        <h2 className="font-bold text-sm mb-3">Items</h2>
        <ul className="divide-y divide-zinc-100 text-sm">
          {order.items.map((i) => <li key={i.id} className="py-2 flex justify-between"><span>{i.quantity} × {i.title}</span><span>Rs. {i.subtotal}</span></li>)}
        </ul>
        <dl className="mt-3 pt-3 border-t text-sm space-y-1">
          <div className="flex justify-between"><dt className="text-zinc-500">Subtotal</dt><dd>Rs. {order.subtotal}</dd></div>
          {order.discountAmount > 0 && <div className="flex justify-between"><dt className="text-zinc-500">Discount</dt><dd>- Rs. {order.discountAmount}</dd></div>}
          {order.deliveryFee > 0 && <div className="flex justify-between"><dt className="text-zinc-500">Delivery</dt><dd>Rs. {order.deliveryFee}</dd></div>}
          <div className="flex justify-between font-black text-base"><dt>Total</dt><dd>Rs. {order.totalAmount}</dd></div>
        </dl>
        <p className="text-xs text-zinc-500 mt-3">{order.orderType === 'delivery' ? `Delivery to: ${order.deliveryAddress}` : 'Pickup from the shop'} · {PAYMENT_LABELS[order.paymentMethod]} · payment: <strong>{order.paymentStatus.replace(/_/g, ' ')}</strong></p>
      </section>

      {canPay && (
        <section className={card}>
          <h2 className="font-bold text-sm mb-2">{order.paymentStatus === 'submitted' ? 'Send proof of payment' : 'Submit your payment details'}</h2>
          {order.paymentStatus === 'rejected' && <p className="text-xs text-red-700 mb-2">Your last payment details could not be verified. Please check and send them again.</p>}
          <input value={ref} onChange={(e) => setRef(e.target.value)} maxLength={100} placeholder="Transaction / reference ID" className="w-full text-sm p-3 border border-zinc-300 rounded-xl" />
          <label className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg border border-zinc-300 cursor-pointer">
            <Upload size={14} /> {file ? 'Screenshot attached ✓' : 'Upload screenshot'}
            <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
          </label>
          <button onClick={submitPayment} disabled={busy || (!ref && !file)} className="mt-3 w-full bg-red-700 disabled:bg-zinc-400 text-white font-bold py-2.5 rounded-xl text-sm">{busy ? 'Sending…' : 'Submit for verification'}</button>
        </section>
      )}

      {isOwner && order.status === 'Completed' && (
        <section className={card} aria-label="Your feedback" data-testid="feedback">
          <h2 className="font-bold text-sm mb-2">How was your order?</h2>
          {order.feedback && !editFb ? (
            <div className="text-sm space-y-2">
              <div className="flex items-center gap-0.5" aria-label={`You rated ${order.feedback.rating} out of 5`}>
                {[1, 2, 3, 4, 5].map((n) => <Star key={n} size={20} className={n <= order.feedback.rating ? 'fill-amber-400 text-amber-400' : 'text-zinc-300'} />)}
              </div>
              {order.feedback.comment && <p className="text-zinc-700">{order.feedback.comment}</p>}
              <p className="text-xs text-emerald-700 font-semibold">Thank you for your feedback!</p>
              <button onClick={() => { setStars(order.feedback.rating); setFbText(order.feedback.comment || ''); setEditFb(true); }} className="text-xs underline text-zinc-500">Change my feedback</button>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center gap-1" role="radiogroup" aria-label="Rating">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button key={n} type="button" role="radio" aria-checked={stars === n} aria-label={`${n} star${n === 1 ? '' : 's'}`} onClick={() => setStars(n)} className="p-0.5">
                    <Star size={30} className={n <= stars ? 'fill-amber-400 text-amber-400' : 'text-zinc-300'} />
                  </button>
                ))}
              </div>
              <textarea value={fbText} onChange={(e) => setFbText(e.target.value)} maxLength={500} rows={3} placeholder="Tell us more (optional)" className="w-full text-sm p-3 border border-zinc-300 rounded-xl" />
              {fbMsg && <p role="alert" className="text-xs text-red-700">{fbMsg}</p>}
              <div className="flex gap-2">
                <button onClick={sendFeedback} disabled={fbBusy} className="bg-red-700 disabled:bg-zinc-400 text-white font-bold px-5 py-2.5 rounded-xl text-sm">{fbBusy ? 'Sending…' : 'Send feedback'}</button>
                {editFb && <button onClick={() => { setEditFb(false); setFbMsg(''); }} className="px-4 py-2.5 rounded-xl text-sm border border-zinc-300">Cancel</button>}
              </div>
            </div>
          )}
        </section>
      )}

      {msg && <p role="alert" className="text-sm text-red-700">{msg}</p>}

      <div className="flex flex-wrap gap-2">
        {isOwner && CUSTOMER_CANCELLABLE.includes(order.status) && <button onClick={cancel} disabled={busy} className="px-4 py-2 text-sm font-semibold rounded-xl border border-zinc-300">Cancel order</button>}
        {wa && <a href={`https://wa.me/${wa}?text=${waText}`} target="_blank" rel="noreferrer" className="px-4 py-2 text-sm font-semibold rounded-xl bg-emerald-600 text-white flex items-center gap-1.5"><MessageCircle size={15} /> Ask about this order</a>}
        <Link href="/orders" className="px-4 py-2 text-sm font-semibold rounded-xl border border-zinc-300">All orders</Link>
      </div>
    </div>
  );
}

export default function OrderPage() {
  return <Suspense fallback={null}><OrderView /></Suspense>;
}
