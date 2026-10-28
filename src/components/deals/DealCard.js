'use client';

import React from 'react';
import { Sparkles, Check, ShoppingCart } from 'lucide-react';
import { useCart } from '@/context/CartContext';

export default function DealCard({ deal, onSelect }) {
  const { addToCart } = useCart();

  const handleAddDeal = (e) => {
    e.stopPropagation();
    addToCart({
      id: deal.id,
      title: deal.title,
      price: deal.price,
      image_url: deal.image_url,
      genre: 'Deal',
      is_deal: true,
    }, 1);
  };

  return (
    <div
      onClick={() => onSelect && onSelect(deal)}
      className="group bg-white rounded-2xl border border-zinc-200 shadow-sm hover:shadow-xl transition-all duration-300 overflow-hidden flex flex-col justify-between cursor-pointer relative"
    >
      {/* Badge */}
      {deal.badge && (
        <div className="absolute top-3 left-3 z-10 bg-red-700 text-white text-[11px] font-bold px-3 py-1 rounded-full shadow flex items-center gap-1">
          <Sparkles size={12} /> {deal.badge}
        </div>
      )}

      {/* Image */}
      <div className="relative aspect-16/9 overflow-hidden bg-zinc-900">
        <img
          src={deal.image_url}
          alt={deal.title}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
        <div className="absolute bottom-3 left-3 right-3 flex items-end justify-between text-white">
          <span className="text-lg font-black text-amber-300">Rs. {deal.price}</span>
          <span className="text-[11px] bg-white/20 backdrop-blur-sm px-2 py-0.5 rounded-full font-medium">
            Combo Offer
          </span>
        </div>
      </div>

      {/* Body */}
      <div className="p-4 flex flex-col flex-1 justify-between gap-3">
        <div>
          <h3 className="font-bold text-base text-zinc-900 group-hover:text-red-700 transition-colors">
            {deal.title}
          </h3>
          <p className="text-xs text-zinc-500 mt-1 line-clamp-2 leading-relaxed">
            {deal.description}
          </p>

          {/* Items breakdown list */}
          {deal.items && deal.items.length > 0 && (
            <div className="mt-3 space-y-1.5 bg-zinc-50 rounded-xl p-2.5 border border-zinc-100">
              {deal.items.map((item, idx) => (
                <div key={idx} className="flex items-center gap-2 text-xs text-zinc-700 font-medium">
                  <Check size={12} className="text-emerald-600 flex-shrink-0" />
                  <span className="truncate">{item}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* CTA */}
        <button
          type="button"
          onClick={handleAddDeal}
          className="w-full bg-red-700 hover:bg-red-600 text-white font-bold py-2.5 px-4 rounded-xl shadow-xs transition-colors flex items-center justify-center gap-2 text-xs"
        >
          <ShoppingCart size={14} />
          Add Deal to Cart
        </button>
      </div>
    </div>
  );
}
