'use client';

import React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { X, Trash2, Plus, Minus, ShoppingBag, ArrowRight, Bike, Store, Sparkles } from 'lucide-react';
import { useCart } from '@/context/CartContext';
import { initialShopSettings } from '@/lib/data/initialData';

export default function CartDrawer() {
  const router = useRouter();
  const {
    items,
    itemCount,
    subtotal,
    deliveryFee,
    total,
    orderType,
    setOrderType,
    isCartOpen,
    closeCart,
    updateQuantity,
    removeFromCart,
    clearCart,
    isFreeDelivery,
  } = useCart();

  if (!isCartOpen) return null;

  const freeDeliveryThreshold = initialShopSettings.free_delivery_threshold_rs;
  const amountNeededForFreeDelivery = Math.max(0, freeDeliveryThreshold - subtotal);
  const freeDeliveryProgress = Math.min(100, Math.round((subtotal / freeDeliveryThreshold) * 100));

  const handleCheckoutClick = () => {
    closeCart();
    router.push('/checkout');
  };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity"
        onClick={closeCart}
      />

      <div className="fixed inset-y-0 right-0 max-w-full flex pl-10">
        <div className="w-screen max-w-md bg-white shadow-2xl flex flex-col">
          {/* Header */}
          <div className="p-4 bg-zinc-950 text-white flex items-center justify-between border-b border-zinc-800">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-red-600/20 text-red-500 flex items-center justify-center">
                <ShoppingBag size={18} />
              </div>
              <div>
                <h2 className="font-bold text-base leading-none">Your Order Cart</h2>
                <span className="text-xs text-zinc-400">
                  {itemCount} {itemCount === 1 ? 'item' : 'items'}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {items.length > 0 && (
                <button
                  onClick={clearCart}
                  className="text-xs text-zinc-400 hover:text-red-400 transition-colors p-1"
                  title="Clear Cart"
                >
                  Clear
                </button>
              )}
              <button
                onClick={closeCart}
                className="w-8 h-8 rounded-full bg-zinc-800 hover:bg-zinc-700 flex items-center justify-center text-zinc-300 transition-colors"
              >
                <X size={18} />
              </button>
            </div>
          </div>

          {/* Delivery / Pickup Switch */}
          <div className="p-3 bg-zinc-50 border-b border-zinc-200">
            <div className="grid grid-cols-2 p-1 bg-zinc-200 rounded-xl">
              <button
                type="button"
                onClick={() => setOrderType('delivery')}
                className={`flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  orderType === 'delivery'
                    ? 'bg-red-700 text-white shadow'
                    : 'text-zinc-600 hover:text-zinc-900'
                }`}
              >
                <Bike size={14} />
                Delivery (3 km)
              </button>
              <button
                type="button"
                onClick={() => setOrderType('pickup')}
                className={`flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  orderType === 'pickup'
                    ? 'bg-red-700 text-white shadow'
                    : 'text-zinc-600 hover:text-zinc-900'
                }`}
              >
                <Store size={14} />
                Pickup
              </button>
            </div>

            {/* Free delivery indicator for delivery orders */}
            {orderType === 'delivery' && (
              <div className="mt-2.5">
                <div className="flex items-center justify-between text-[11px] mb-1">
                  {isFreeDelivery ? (
                    <span className="text-emerald-700 font-semibold flex items-center gap-1">
                      <Sparkles size={12} /> You unlocked FREE delivery!
                    </span>
                  ) : (
                    <span className="text-zinc-600">
                      Add <strong className="text-red-700">Rs.{amountNeededForFreeDelivery}</strong> more for FREE delivery
                    </span>
                  )}
                  <span className="text-zinc-500 font-medium">{freeDeliveryProgress}%</span>
                </div>
                <div className="w-full bg-zinc-200 rounded-full h-1.5 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-300 ${
                      isFreeDelivery ? 'bg-emerald-600' : 'bg-red-600'
                    }`}
                    style={{ width: `${freeDeliveryProgress}%` }}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Cart Items List */}
          <div className="flex-1 overflow-y-auto p-4 divide-y divide-zinc-100">
            {items.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-6">
                <div className="w-20 h-20 bg-red-50 text-red-600 rounded-full flex items-center justify-center mb-4 shadow-inner">
                  <ShoppingBag size={36} />
                </div>
                <h3 className="text-lg font-bold text-zinc-800">Your Cart is Empty</h3>
                <p className="text-xs text-zinc-500 mt-1 max-w-xs">
                  Discover our freshly baked authentic Tandoori naans, loaded cheese naans, and value deals!
                </p>
                <button
                  onClick={closeCart}
                  className="mt-6 px-6 py-2.5 bg-red-700 hover:bg-red-600 text-white text-xs font-semibold rounded-full shadow transition-colors"
                >
                  Explore Menu
                </button>
              </div>
            ) : (
              items.map((item) => (
                <div key={item.cartKey} className="py-3 flex gap-3 items-center">
                  <img
                    src={item.image_url || '/Nutella.jpg'}
                    alt={item.title}
                    className="w-16 h-16 object-cover rounded-xl border border-zinc-100 flex-shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <h4 className="font-semibold text-sm text-zinc-900 truncate">
                      {item.title}
                    </h4>
                    {item.notes && (
                      <p className="text-[11px] text-zinc-400 italic truncate">
                        &quot;{item.notes}&quot;
                      </p>
                    )}
                    <div className="text-xs font-bold text-red-700 mt-0.5">
                      Rs. {item.price}
                    </div>
                  </div>

                  {/* Quantity & Delete */}
                  <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                    <div className="flex items-center gap-1.5 bg-zinc-100 rounded-lg p-1 border border-zinc-200">
                      <button
                        onClick={() => updateQuantity(item.cartKey, item.quantity - 1)}
                        className="w-6 h-6 rounded bg-white hover:bg-zinc-200 flex items-center justify-center text-zinc-700 shadow-xs"
                      >
                        <Minus size={12} />
                      </button>
                      <span className="w-5 text-center text-xs font-bold text-zinc-800">
                        {item.quantity}
                      </span>
                      <button
                        onClick={() => updateQuantity(item.cartKey, item.quantity + 1)}
                        className="w-6 h-6 rounded bg-white hover:bg-zinc-200 flex items-center justify-center text-zinc-700 shadow-xs"
                      >
                        <Plus size={12} />
                      </button>
                    </div>

                    <button
                      onClick={() => removeFromCart(item.cartKey)}
                      className="text-[11px] text-zinc-400 hover:text-red-600 flex items-center gap-0.5"
                    >
                      <Trash2 size={11} /> Remove
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Footer Summary & Checkout */}
          {items.length > 0 && (
            <div className="p-4 bg-zinc-50 border-t border-zinc-200 space-y-3">
              <div className="space-y-1.5 text-xs text-zinc-600">
                <div className="flex justify-between">
                  <span>Subtotal</span>
                  <span className="font-semibold text-zinc-900">Rs. {subtotal}</span>
                </div>
                <div className="flex justify-between">
                  <span>
                    Delivery Fee {orderType === 'pickup' ? '(Pickup)' : '(Model Town)'}
                  </span>
                  <span className="font-semibold text-zinc-900">
                    {deliveryFee === 0 ? (
                      <span className="text-emerald-700 font-bold">FREE</span>
                    ) : (
                      `Rs. ${deliveryFee}`
                    )}
                  </span>
                </div>
                <div className="flex justify-between text-sm font-bold text-zinc-900 pt-2 border-t border-zinc-200">
                  <span>Total Amount</span>
                  <span className="text-red-700 text-base">Rs. {total}</span>
                </div>
              </div>

              <button
                onClick={handleCheckoutClick}
                className="w-full bg-red-700 hover:bg-red-600 text-white font-bold py-3 px-4 rounded-xl shadow-md transition-all flex items-center justify-between text-sm group"
              >
                <span>Proceed to Checkout</span>
                <span className="flex items-center gap-1 text-red-100">
                  Rs. {total}
                  <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" />
                </span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
