'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Bike,
  Store,
  CreditCard,
  Building2,
  Copy,
  Check,
  Upload,
  AlertCircle,
  Loader2,
  ShieldCheck,
  ShoppingBag,
} from 'lucide-react';
import { useCart } from '@/context/CartContext';
import { useAuth } from '@/context/AuthContext';
import { initialBankDetails, initialShopSettings } from '@/lib/data/initialData';
import LocationRadiusChecker from '@/components/delivery/LocationRadiusChecker';

export default function CheckoutPage() {
  const router = useRouter();
  const { items, subtotal, deliveryFee, total, orderType, setOrderType, customerLocation, clearCart } = useCart();
  const { user, profile } = useAuth();

  // Form states
  const [customerName, setCustomerName] = useState(profile?.full_name || '');
  const [customerPhone, setCustomerPhone] = useState(profile?.phone || '');
  const [customerEmail, setCustomerEmail] = useState(user?.email || '');
  const [specialInstructions, setSpecialInstructions] = useState('');

  // Payment states
  const [paymentMethod, setPaymentMethod] = useState('bank_transfer'); // 'bank_transfer' | 'easypaisa' | 'jazzcash'
  const [paymentReference, setPaymentReference] = useState('');
  const [senderAccount, setSenderAccount] = useState('');
  const [paymentProofUrl, setPaymentProofUrl] = useState('');
  const [copiedField, setCopiedField] = useState(null);
  const [bankDetails, setBankDetails] = useState(initialBankDetails);

  useEffect(() => {
    async function loadSettings() {
      try {
        const res = await fetch('/api/settings');
        if (res.ok) {
          const data = await res.json();
          if (data.bankSettings) {
            setBankDetails(data.bankSettings);
          }
        }
      } catch (e) {
        console.warn('Using initial bank details fallback:', e);
      }
    }
    loadSettings();
  }, []);

  // Status
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');

  const copyToClipboard = (text, fieldName) => {
    navigator.clipboard.writeText(text);
    setCopiedField(fieldName);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const handlePlaceOrder = async (e) => {
    e.preventDefault();
    setFormError('');

    if (!customerName.trim() || !customerPhone.trim()) {
      setFormError('Please enter your full name and mobile phone number.');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    if (items.length === 0) {
      setFormError('Your cart is empty. Please add items from our menu.');
      return;
    }

    // Delivery validation
    if (orderType === 'delivery') {
      if (!customerLocation || !customerLocation.lat || !customerLocation.lng) {
        setFormError('Please click "Detect My Location" below to verify you are within our 3 km delivery zone.');
        return;
      }

      if (!customerLocation.isEligible) {
        setFormError('Your detected location is outside our 3 km delivery radius. Please switch your order to Pickup.');
        return;
      }

      if (!customerLocation.address || customerLocation.address.trim().length < 5) {
        setFormError('Please provide your complete street address and house/flat number for delivery.');
        return;
      }
    }

    // Payment verification requirement
    if (!paymentReference.trim()) {
      setFormError('Please enter your Transaction Reference ID (TRX ID) from your bank/wallet transfer.');
      return;
    }

    setSubmitting(true);

    try {
      const payload = {
        customerName,
        customerPhone,
        customerEmail,
        orderType,
        deliveryAddress: customerLocation?.address || '',
        deliveryCoordinates: customerLocation ? { lat: customerLocation.lat, lng: customerLocation.lng } : null,
        items,
        paymentMethod,
        paymentReference,
        paymentProofUrl,
        specialInstructions,
        userId: user?.id || null,
      };

      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to place order.');
      }

      // Clear cart and redirect to order tracking page
      clearCart();
      router.push(`/orders/${data.orderId || data.orderNumber}`);
    } catch (err) {
      console.error('Checkout error:', err);
      setFormError(err.message || 'An error occurred during checkout. Please try again.');
      setSubmitting(false);
    }
  };

  // If cart is empty
  if (items.length === 0) {
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center p-6 text-center">
        <div className="w-20 h-20 bg-red-50 text-red-600 rounded-full flex items-center justify-center mb-4 shadow-sm">
          <ShoppingBag size={40} />
        </div>
        <h1 className="text-2xl font-bold text-zinc-900">Your Cart is Empty</h1>
        <p className="text-zinc-500 text-sm mt-1 max-w-sm">
          Add some hot fresh Tandoori naans or deals before checking out!
        </p>
        <Link
          href="/Menu"
          className="mt-6 px-6 py-2.5 bg-red-700 hover:bg-red-600 text-white font-bold text-xs rounded-full shadow transition-colors"
        >
          View Full Menu
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50/70 pb-20">
      {/* Top Breadcrumb Header */}
      <div className="bg-zinc-950 text-white border-b border-zinc-800">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <Link
            href="/Menu"
            className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-white transition-colors"
          >
            <ArrowLeft size={14} /> Back to Menu
          </Link>
          <div className="text-xs font-semibold text-red-400 uppercase tracking-widest">
            Haq Bahu Naan Checkout
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-6">
        <h1 className="text-2xl sm:text-3xl font-extrabold text-zinc-900 mb-2">
          Review & Place Your Order
        </h1>
        <p className="text-xs sm:text-sm text-zinc-500 mb-6">
          Online payment verification ensures your food is baked fresh and ready right on time.
        </p>

        {formError && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-2xl flex items-start gap-3 text-red-800 text-xs sm:text-sm shadow-sm animate-fade-in">
            <AlertCircle size={20} className="text-red-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1 font-medium">{formError}</div>
          </div>
        )}

        <form onSubmit={handlePlaceOrder} className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left Column: Form Details (8 cols) */}
          <div className="lg:col-span-7 space-y-6">
            {/* Step 1: Order Type */}
            <div className="bg-white rounded-2xl border border-zinc-200 p-5 shadow-xs space-y-3">
              <h2 className="font-bold text-sm text-zinc-900 flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-red-700 text-white text-[11px] flex items-center justify-center">1</span>
                Choose Fulfillment Method
              </h2>

              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setOrderType('delivery')}
                  className={`p-4 rounded-xl border text-left flex flex-col gap-1 transition-all ${
                    orderType === 'delivery'
                      ? 'border-red-600 bg-red-50/50 ring-2 ring-red-600/20'
                      : 'border-zinc-200 hover:border-zinc-300'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-sm text-zinc-900 flex items-center gap-1.5">
                      <Bike size={16} className="text-red-700" /> Delivery
                    </span>
                    <span className="text-[11px] font-semibold text-zinc-500">3 km radius</span>
                  </div>
                  <p className="text-[11px] text-zinc-500">
                    Delivered piping hot to your doorstep in Model Town & vicinity.
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => setOrderType('pickup')}
                  className={`p-4 rounded-xl border text-left flex flex-col gap-1 transition-all ${
                    orderType === 'pickup'
                      ? 'border-red-600 bg-red-50/50 ring-2 ring-red-600/20'
                      : 'border-zinc-200 hover:border-zinc-300'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-sm text-zinc-900 flex items-center gap-1.5">
                      <Store size={16} className="text-red-700" /> Pickup
                    </span>
                    <span className="text-[11px] font-bold text-emerald-700">No Fee</span>
                  </div>
                  <p className="text-[11px] text-zinc-500">
                    Collect directly from Shop #4, Model Town Link Rd, Lahore.
                  </p>
                </button>
              </div>
            </div>

            {/* Step 2: Customer Contact Information */}
            <div className="bg-white rounded-2xl border border-zinc-200 p-5 shadow-xs space-y-4">
              <h2 className="font-bold text-sm text-zinc-900 flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-red-700 text-white text-[11px] flex items-center justify-center">2</span>
                Contact Information
              </h2>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-xs font-semibold text-zinc-700 mb-1">
                    Full Name <span className="text-red-600">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    placeholder="e.g. Ali Ahmed"
                    className="w-full text-xs p-3 border border-zinc-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-600/30 focus:border-red-600 transition-all placeholder-zinc-400"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-700 mb-1">
                    Phone / WhatsApp Number <span className="text-red-600">*</span>
                  </label>
                  <input
                    type="tel"
                    required
                    value={customerPhone}
                    onChange={(e) => setCustomerPhone(e.target.value)}
                    placeholder="0300 1234567"
                    className="w-full text-xs p-3 border border-zinc-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-600/30 focus:border-red-600 transition-all placeholder-zinc-400"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-zinc-700 mb-1">
                    Email Address (Optional, for digital receipt)
                  </label>
                  <input
                    type="email"
                    value={customerEmail}
                    onChange={(e) => setCustomerEmail(e.target.value)}
                    placeholder="youremail@example.com"
                    className="w-full text-xs p-3 border border-zinc-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-600/30 focus:border-red-600 transition-all placeholder-zinc-400"
                  />
                </div>
              </div>
            </div>

            {/* Step 3: Location / Delivery Radius (Only if delivery selected) */}
            {orderType === 'delivery' && (
              <LocationRadiusChecker />
            )}

            {/* Step 4: Bank Transfer & Payment Details */}
            <div className="bg-white rounded-2xl border border-zinc-200 p-5 shadow-xs space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="font-bold text-sm text-zinc-900 flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-red-700 text-white text-[11px] flex items-center justify-center">
                    {orderType === 'delivery' ? '4' : '3'}
                  </span>
                  Online Payment & Transfer Instructions
                </h2>
                <span className="text-[11px] bg-red-50 text-red-700 font-bold px-2 py-0.5 rounded-full border border-red-200">
                  Pre-Payment Required
                </span>
              </div>

              {/* Payment Method Switcher */}
              <div className="grid grid-cols-3 gap-2">
                {[
                  { id: 'bank_transfer', label: 'Meezan Bank', icon: <Building2 size={14} /> },
                  { id: 'easypaisa', label: 'EasyPaisa', icon: <CreditCard size={14} /> },
                  { id: 'jazzcash', label: 'JazzCash', icon: <CreditCard size={14} /> },
                ].map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setPaymentMethod(m.id)}
                    className={`p-2.5 rounded-xl border text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
                      paymentMethod === m.id
                        ? 'bg-zinc-900 text-white border-zinc-900 shadow-xs'
                        : 'border-zinc-200 text-zinc-700 hover:bg-zinc-50'
                    }`}
                  >
                    {m.icon}
                    {m.label}
                  </button>
                ))}
              </div>

              {/* Display Bank/Account Details based on selected tab */}
              <div className="bg-amber-50/60 border border-amber-200 rounded-xl p-4 text-xs space-y-3">
                <div className="font-bold text-amber-950 flex items-center gap-1.5">
                  <ShieldCheck size={16} className="text-amber-700" />
                  Official Account Information for Haq Bahu Naan Shop:
                </div>

                {paymentMethod === 'bank_transfer' && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-zinc-800">
                    <div className="bg-white p-2.5 rounded-lg border border-amber-200/80">
                      <span className="text-[10px] text-zinc-500 uppercase block font-semibold">Bank Name</span>
                      <span className="font-bold text-zinc-900">{bankDetails.bank_name}</span>
                    </div>

                    <div className="bg-white p-2.5 rounded-lg border border-amber-200/80">
                      <span className="text-[10px] text-zinc-500 uppercase block font-semibold">Account Title</span>
                      <span className="font-bold text-zinc-900">{bankDetails.account_title}</span>
                    </div>

                    <div className="bg-white p-2.5 rounded-lg border border-amber-200/80 flex items-center justify-between sm:col-span-2">
                      <div>
                        <span className="text-[10px] text-zinc-500 uppercase block font-semibold">Account Number</span>
                        <span className="font-mono font-bold text-zinc-900 text-xs sm:text-sm">
                          {bankDetails.account_number}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => copyToClipboard(bankDetails.account_number, 'acc')}
                        className="p-1.5 rounded-md hover:bg-zinc-100 text-zinc-600 transition-colors"
                        title="Copy account number"
                      >
                        {copiedField === 'acc' ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} />}
                      </button>
                    </div>

                    <div className="bg-white p-2.5 rounded-lg border border-amber-200/80 flex items-center justify-between sm:col-span-2">
                      <div>
                        <span className="text-[10px] text-zinc-500 uppercase block font-semibold">IBAN</span>
                        <span className="font-mono font-bold text-zinc-900 text-xs truncate">
                          {bankDetails.iban}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => copyToClipboard(bankDetails.iban, 'iban')}
                        className="p-1.5 rounded-md hover:bg-zinc-100 text-zinc-600 transition-colors"
                        title="Copy IBAN"
                      >
                        {copiedField === 'iban' ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} />}
                      </button>
                    </div>
                  </div>
                )}

                {paymentMethod === 'easypaisa' && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-zinc-800">
                    <div className="bg-white p-2.5 rounded-lg border border-amber-200/80">
                      <span className="text-[10px] text-zinc-500 uppercase block font-semibold">EasyPaisa Title</span>
                      <span className="font-bold text-zinc-900">{bankDetails.easypaisa_title}</span>
                    </div>

                    <div className="bg-white p-2.5 rounded-lg border border-amber-200/80 flex items-center justify-between">
                      <div>
                        <span className="text-[10px] text-zinc-500 uppercase block font-semibold">EasyPaisa Mobile #</span>
                        <span className="font-mono font-bold text-zinc-900">{bankDetails.easypaisa_number}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => copyToClipboard(bankDetails.easypaisa_number, 'ep')}
                        className="p-1.5 rounded-md hover:bg-zinc-100 text-zinc-600"
                      >
                        {copiedField === 'ep' ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} />}
                      </button>
                    </div>
                  </div>
                )}

                {paymentMethod === 'jazzcash' && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-zinc-800">
                    <div className="bg-white p-2.5 rounded-lg border border-amber-200/80">
                      <span className="text-[10px] text-zinc-500 uppercase block font-semibold">JazzCash Title</span>
                      <span className="font-bold text-zinc-900">{bankDetails.jazzcash_title}</span>
                    </div>

                    <div className="bg-white p-2.5 rounded-lg border border-amber-200/80 flex items-center justify-between">
                      <div>
                        <span className="text-[10px] text-zinc-500 uppercase block font-semibold">JazzCash Mobile #</span>
                        <span className="font-mono font-bold text-zinc-900">{bankDetails.jazzcash_number}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => copyToClipboard(bankDetails.jazzcash_number, 'jc')}
                        className="p-1.5 rounded-md hover:bg-zinc-100 text-zinc-600"
                      >
                        {copiedField === 'jc' ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} />}
                      </button>
                    </div>
                  </div>
                )}

                <p className="text-[11px] text-amber-900/90 leading-relaxed pt-1">
                  <strong>Instructions:</strong> Transfer exactly <span className="font-extrabold text-red-700">Rs. {total}</span> using your mobile app or ATM. Then enter the Transaction Reference ID below. Our manager verifies each transaction before the tandoor chef prepares your order.
                </p>
              </div>

              {/* Payment Proof Inputs */}
              <div className="space-y-3 pt-2">
                <div>
                  <label className="block text-xs font-semibold text-zinc-800 mb-1">
                    Transaction ID / Reference Number (TRX ID) <span className="text-red-600">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={paymentReference}
                    onChange={(e) => setPaymentReference(e.target.value)}
                    placeholder="e.g. 0293847561 or bank ref"
                    className="w-full text-xs p-3 border border-zinc-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-600/30 focus:border-red-600 transition-all font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-800 mb-1">
                    Payment Receipt Screenshot URL / Image Link (Optional)
                  </label>
                  <input
                    type="text"
                    value={paymentProofUrl}
                    onChange={(e) => setPaymentProofUrl(e.target.value)}
                    placeholder="https://... or payment receipt link"
                    className="w-full text-xs p-3 border border-zinc-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-600/30 focus:border-red-600 transition-all placeholder-zinc-400"
                  />
                </div>
              </div>
            </div>

            {/* Special Instructions */}
            <div className="bg-white rounded-2xl border border-zinc-200 p-5 shadow-xs">
              <label className="block text-xs font-semibold text-zinc-800 mb-1">
                Order Note / Delivery Instructions (Optional)
              </label>
              <textarea
                rows={2}
                value={specialInstructions}
                onChange={(e) => setSpecialInstructions(e.target.value)}
                placeholder="e.g., Ring bell twice, extra napkins, keep naans extra hot..."
                className="w-full text-xs p-3 border border-zinc-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-600/30 focus:border-red-600 transition-all placeholder-zinc-400"
              />
            </div>
          </div>

          {/* Right Column: Order Summary (5 cols) */}
          <div className="lg:col-span-5 space-y-5 lg:sticky lg:top-20">
            <div className="bg-white rounded-2xl border border-zinc-200 p-5 shadow-sm space-y-4">
              <h2 className="font-bold text-sm text-zinc-900 pb-3 border-b border-zinc-100 flex items-center justify-between">
                <span>Order Summary ({items.length} {items.length === 1 ? 'item' : 'items'})</span>
                <span className="text-xs text-red-700 font-semibold">{orderType.toUpperCase()}</span>
              </h2>

              {/* Items List */}
              <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
                {items.map((item) => (
                  <div key={item.cartKey} className="flex items-center gap-3 text-xs">
                    <img
                      src={item.image_url || '/Nutella.jpg'}
                      alt={item.title}
                      className="w-12 h-12 object-cover rounded-lg border border-zinc-100 flex-shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-zinc-900 truncate">{item.title}</div>
                      <div className="text-[11px] text-zinc-400">
                        Qty: {item.quantity} &bull; Rs. {item.price} each
                      </div>
                      {item.notes && (
                        <div className="text-[10px] text-zinc-500 italic truncate">&quot;{item.notes}&quot;</div>
                      )}
                    </div>
                    <div className="font-bold text-zinc-900 flex-shrink-0">
                      Rs. {item.price * item.quantity}
                    </div>
                  </div>
                ))}
              </div>

              {/* Bill Breakdown */}
              <div className="pt-3 border-t border-zinc-100 space-y-2 text-xs text-zinc-600">
                <div className="flex justify-between">
                  <span>Subtotal</span>
                  <span className="font-semibold text-zinc-900">Rs. {subtotal}</span>
                </div>

                <div className="flex justify-between">
                  <span>Delivery Charges</span>
                  <span className="font-semibold text-zinc-900">
                    {deliveryFee === 0 ? (
                      <span className="text-emerald-700 font-bold">FREE</span>
                    ) : (
                      `Rs. ${deliveryFee}`
                    )}
                  </span>
                </div>

                <div className="pt-3 border-t border-zinc-200 flex justify-between items-center text-sm font-extrabold text-zinc-900">
                  <span>Total Payable</span>
                  <span className="text-xl text-red-700">Rs. {total}</span>
                </div>
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={submitting}
                className="w-full bg-red-700 hover:bg-red-600 disabled:bg-zinc-400 text-white font-extrabold py-3.5 px-4 rounded-xl shadow-md transition-all flex items-center justify-center gap-2 text-sm active:scale-98 cursor-pointer"
              >
                {submitting ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    Placing Order & Submitting Payment...
                  </>
                ) : (
                  <>
                    <span>Place Order (Rs. {total})</span>
                  </>
                )}
              </button>

              <p className="text-[11px] text-zinc-400 text-center leading-snug">
                By placing your order, you agree that your payment will be verified by the shop owner before fulfillment.
              </p>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
