'use client';

import React, { useState, useEffect, use } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  CheckCircle2,
  Clock,
  Bike,
  Store,
  ChefHat,
  Flame,
  Phone,
  AlertTriangle,
  Receipt,
  Copy,
  Check,
  RefreshCw,
} from 'lucide-react';

const ORDER_STEPS = [
  { key: 'Payment Pending', label: 'Payment Review', desc: 'Verifying bank transfer', icon: Clock },
  { key: 'Confirmed', label: 'Order Confirmed', desc: 'Payment approved', icon: CheckCircle2 },
  { key: 'Preparing', label: 'In Tandoor', desc: 'Freshly baking your naans', icon: Flame },
  { key: 'Ready', label: 'Ready', desc: 'Packed and ready', icon: ChefHat },
  { key: 'Out for Delivery', label: 'On The Way', desc: 'Rider is en route', icon: Bike },
  { key: 'Completed', label: 'Delivered / Completed', desc: 'Enjoy your meal!', icon: CheckCircle2 },
];

export default function OrderTrackingPage({ params }) {
  const unwrappedParams = use(params);
  const orderId = unwrappedParams.id;

  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const fetchOrder = async (isManual = false) => {
    if (isManual) setRefreshing(true);
    try {
      const res = await fetch(`/api/orders/${orderId}`);
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Order not found');
      }
      setOrder(data.order);
      setError('');
    } catch (err) {
      console.error('Error fetching order:', err);
      setError(err.message || 'Could not retrieve order details.');
    } finally {
      setLoading(false);
      if (isManual) setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchOrder();

    // Auto-poll every 10 seconds for real-time status changes
    const timer = setInterval(() => {
      fetchOrder();
    }, 10000);

    return () => clearInterval(timer);
  }, [orderId]);

  const copyOrderNumber = () => {
    if (order?.order_number) {
      navigator.clipboard.writeText(order.order_number);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (loading) {
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center p-6 text-center">
        <RefreshCw size={36} className="text-red-700 animate-spin mb-3" />
        <p className="text-sm font-semibold text-zinc-700">Loading Order Details...</p>
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center p-6 text-center">
        <AlertTriangle size={44} className="text-amber-600 mb-3" />
        <h2 className="text-xl font-bold text-zinc-900">Order Not Found</h2>
        <p className="text-xs text-zinc-500 mt-1 max-w-sm">
          {error || "We couldn't locate this order. Please verify your order number."}
        </p>
        <Link
          href="/orders"
          className="mt-5 px-5 py-2 bg-red-700 text-white rounded-full text-xs font-bold"
        >
          View All Orders
        </Link>
      </div>
    );
  }

  // Determine current active step
  const statusOrder = [
    'Payment Pending',
    'Confirmed',
    'Preparing',
    'Ready',
    'Out for Delivery',
    'Completed',
  ];

  const isCancelled = order.status === 'Cancelled';
  const currentStepIndex = statusOrder.indexOf(order.status);

  // WhatsApp order help message
  const whatsappHelpMsg = encodeURIComponent(
    `Hello Haq Bahu Naan Shop! I am inquiring about my Order #${order.order_number} (${order.status}). Total: Rs.${order.total_amount}.`
  );

  return (
    <div className="min-h-screen bg-zinc-50/70 pb-20">
      {/* Top Banner */}
      <div className="bg-zinc-950 text-white border-b border-zinc-800">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <Link
            href="/orders"
            className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-white transition-colors"
          >
            <ArrowLeft size={14} /> My Orders
          </Link>
          <button
            onClick={() => fetchOrder(true)}
            className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-white transition-colors"
            title="Refresh order status"
          >
            <RefreshCw size={12} className={refreshing ? 'animate-spin text-red-500' : ''} />
            <span>{refreshing ? 'Updating...' : 'Live Status'}</span>
          </button>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 pt-6 space-y-6">
        {/* Status Header Card */}
        <div className="bg-white rounded-3xl border border-zinc-200 p-6 shadow-sm overflow-hidden relative">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-zinc-100">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-red-700 bg-red-50 px-2.5 py-1 rounded-full border border-red-200">
                  {order.order_type === 'delivery' ? 'Home Delivery' : 'Pickup Order'}
                </span>
                <span className="text-xs text-zinc-400">
                  {new Date(order.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
              <h1 className="text-2xl font-black text-zinc-900 mt-2 flex items-center gap-2">
                Order #{order.order_number}
                <button
                  onClick={copyOrderNumber}
                  className="p-1 rounded text-zinc-400 hover:text-zinc-700 transition-colors"
                  title="Copy Order Number"
                >
                  {copied ? <Check size={16} className="text-emerald-600" /> : <Copy size={16} />}
                </button>
              </h1>
            </div>

            {/* Status Pill */}
            <div className="text-left sm:text-right">
              <span className="text-xs text-zinc-500 block">Current Status</span>
              <span
                className={`inline-block font-extrabold text-sm sm:text-base px-3.5 py-1.5 rounded-full mt-1 ${
                  isCancelled
                    ? 'bg-zinc-200 text-zinc-700'
                    : order.status === 'Completed'
                    ? 'bg-emerald-100 text-emerald-800'
                    : order.status === 'Payment Pending'
                    ? 'bg-amber-100 text-amber-900'
                    : 'bg-red-700 text-white'
                }`}
              >
                {order.status}
              </span>
            </div>
          </div>

          {/* Stepper Timeline (unless Cancelled) */}
          {!isCancelled ? (
            <div className="pt-6">
              <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
                {ORDER_STEPS.map((step, idx) => {
                  const Icon = step.icon;
                  const isDone = currentStepIndex > idx;
                  const isCurrent = currentStepIndex === idx;

                  // If pickup, change "Out for Delivery" label
                  const label = order.order_type === 'pickup' && step.key === 'Out for Delivery'
                    ? 'Ready for Pickup'
                    : step.label;

                  return (
                    <div
                      key={step.key}
                      className={`p-3 rounded-2xl border flex flex-col items-center text-center transition-all ${
                        isCurrent
                          ? 'border-red-600 bg-red-50/60 ring-2 ring-red-600/20'
                          : isDone
                          ? 'border-emerald-200 bg-emerald-50/50'
                          : 'border-zinc-200 bg-zinc-50/50 opacity-60'
                      }`}
                    >
                      <div
                        className={`w-9 h-9 rounded-full flex items-center justify-center mb-2 shadow-xs ${
                          isCurrent
                            ? 'bg-red-700 text-white animate-pulse'
                            : isDone
                            ? 'bg-emerald-600 text-white'
                            : 'bg-zinc-200 text-zinc-500'
                        }`}
                      >
                        <Icon size={18} />
                      </div>
                      <div className="font-bold text-xs text-zinc-900 leading-tight">
                        {label}
                      </div>
                      <div className="text-[10px] text-zinc-500 mt-0.5 leading-tight">
                        {step.desc}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="pt-6 text-center text-xs text-zinc-500">
              This order was cancelled. Please contact us on WhatsApp if you have questions.
            </div>
          )}

          {/* Payment Pending Alert Box */}
          {order.status === 'Payment Pending' && (
            <div className="mt-6 p-4 bg-amber-50 border border-amber-200 rounded-2xl flex items-start gap-3 text-xs text-amber-900">
              <Clock size={18} className="text-amber-700 flex-shrink-0 mt-0.5" />
              <div>
                <strong className="font-bold block text-sm">Payment Verification in Progress</strong>
                <p className="mt-0.5 leading-relaxed">
                  Your payment reference (<strong className="font-mono">{order.payment_reference || 'Submitted'}</strong>) has been sent to our shop manager. Once verified in our Meezan Bank account, status will automatically update to <strong>Confirmed</strong> and the tandoor will be fired up!
                </p>
              </div>
            </div>
          )}
        </div>

        {/* 2 Column Details: Items & Customer Details */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Items Summary */}
          <div className="bg-white rounded-3xl border border-zinc-200 p-5 shadow-xs space-y-4">
            <h2 className="font-bold text-sm text-zinc-900 flex items-center gap-2 pb-3 border-b border-zinc-100">
              <Receipt size={16} className="text-red-700" />
              Order Items ({order.items?.length || 0})
            </h2>

            <div className="divide-y divide-zinc-100 max-h-80 overflow-y-auto pr-1">
              {order.items?.map((item, idx) => (
                <div key={idx} className="py-2.5 flex justify-between items-start text-xs">
                  <div className="flex-1 pr-3">
                    <div className="font-semibold text-zinc-900">
                      {item.quantity}x {item.item_title}
                    </div>
                    {item.notes && (
                      <div className="text-[11px] text-zinc-400 italic">&quot;{item.notes}&quot;</div>
                    )}
                  </div>
                  <div className="font-bold text-zinc-900">
                    Rs. {item.subtotal_price || item.unit_price * item.quantity}
                  </div>
                </div>
              ))}
            </div>

            <div className="pt-3 border-t border-zinc-100 space-y-1.5 text-xs text-zinc-600">
              <div className="flex justify-between">
                <span>Subtotal</span>
                <span className="font-semibold text-zinc-900">Rs. {order.subtotal}</span>
              </div>
              <div className="flex justify-between">
                <span>Delivery Fee</span>
                <span className="font-semibold text-zinc-900">
                  {order.delivery_fee === 0 ? 'FREE' : `Rs. ${order.delivery_fee}`}
                </span>
              </div>
              <div className="flex justify-between text-sm font-black text-zinc-900 pt-2 border-t border-zinc-200">
                <span>Total Paid / Payable</span>
                <span className="text-red-700 text-base">Rs. {order.total_amount}</span>
              </div>
            </div>
          </div>

          {/* Delivery & Payment Details */}
          <div className="bg-white rounded-3xl border border-zinc-200 p-5 shadow-xs space-y-4">
            <h2 className="font-bold text-sm text-zinc-900 flex items-center gap-2 pb-3 border-b border-zinc-100">
              {order.order_type === 'delivery' ? <Bike size={16} className="text-red-700" /> : <Store size={16} className="text-red-700" />}
              {order.order_type === 'delivery' ? 'Delivery Information' : 'Pickup Instructions'}
            </h2>

            <div className="text-xs space-y-3 text-zinc-700">
              <div>
                <span className="text-zinc-400 block text-[10px] uppercase font-semibold">Customer</span>
                <span className="font-bold text-zinc-900">{order.customer_name}</span> &bull; {order.customer_phone}
              </div>

              <div>
                <span className="text-zinc-400 block text-[10px] uppercase font-semibold">
                  {order.order_type === 'delivery' ? 'Delivery Address' : 'Pickup Location'}
                </span>
                <p className="font-medium text-zinc-900 mt-0.5">
                  {order.delivery_address || 'Haq Bahu Naan Shop, Shop # 4, Model Town Link Rd, Lahore'}
                </p>
                {order.distance_km && (
                  <span className="text-[11px] text-emerald-700 font-semibold mt-0.5 block">
                    Verified within {order.distance_km} km of shop
                  </span>
                )}
              </div>

              {order.special_instructions && (
                <div>
                  <span className="text-zinc-400 block text-[10px] uppercase font-semibold">Special Notes</span>
                  <p className="italic text-zinc-600">&quot;{order.special_instructions}&quot;</p>
                </div>
              )}

              <div className="pt-2 border-t border-zinc-100">
                <span className="text-zinc-400 block text-[10px] uppercase font-semibold">Payment Details</span>
                <div className="mt-1 flex items-center justify-between">
                  <span className="font-medium capitalize">{order.payment_method?.replace('_', ' ')}</span>
                  <span className="font-mono text-zinc-600 bg-zinc-100 px-2 py-0.5 rounded text-[11px]">
                    TRX: {order.payment_reference || 'N/A'}
                  </span>
                </div>
              </div>
            </div>

            {/* Direct WhatsApp Support */}
            <div className="pt-2">
              <a
                href={`https://wa.me/923094130285?text=${whatsappHelpMsg}`}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full bg-emerald-700 hover:bg-emerald-600 text-white font-bold py-2.5 px-4 rounded-xl text-xs transition-colors flex items-center justify-center gap-2 shadow-xs"
              >
                <Phone size={14} />
                WhatsApp Shop Support
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
