'use client';

import React from 'react';
import { Heart, Plus, Check } from 'lucide-react';
import { useCart } from '@/context/CartContext';
import { useWishlist } from '@/context/WishlistContext';

export default function FoodCard({ product, onSelect }) {
  const { addToCart } = useCart();
  const { isWishlisted, toggleWishlist } = useWishlist();

  const isFavorited = isWishlisted(product.id);
  const isAvailable = product.is_available !== false;
  const imageSrc = product.image_url || product.pic || '/Nutella.jpg';
  const title = product.name || product.title;

  const handleQuickAdd = (e) => {
    e.stopPropagation();
    if (!isAvailable) return;
    addToCart(product, 1);
  };

  const handleHeartClick = (e) => {
    e.stopPropagation();
    toggleWishlist(product.id);
  };

  return (
    <div
      onClick={() => onSelect && onSelect(product)}
      className={`group bg-white rounded-2xl overflow-hidden border border-zinc-200/80 shadow-xs hover:shadow-lg hover:-translate-y-1 transition-all duration-300 flex flex-col cursor-pointer relative ${
        !isAvailable ? 'opacity-75' : ''
      }`}
    >
      {/* Food Image & Badges */}
      <div className="relative aspect-4/3 overflow-hidden bg-zinc-100">
        <img
          src={imageSrc}
          alt={title}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 ease-out"
          loading="lazy"
        />

        {/* Favorite Heart Button */}
        <button
          type="button"
          onClick={handleHeartClick}
          aria-label="Add to wishlist"
          className="absolute top-2.5 right-2.5 w-8 h-8 rounded-full bg-white/90 hover:bg-white text-zinc-700 flex items-center justify-center shadow-xs transition-colors backdrop-blur-xs z-10"
        >
          <Heart
            size={15}
            className={isFavorited ? 'fill-red-600 text-red-600' : 'text-zinc-500 group-hover:text-red-500'}
          />
        </button>

        {/* Category / Genre Badge */}
        {(product.genre || product.category_name) && (
          <span className="absolute top-2.5 left-2.5 bg-black/60 backdrop-blur-sm text-white text-[10px] font-semibold px-2.5 py-0.5 rounded-full">
            {product.genre || product.category_name}
          </span>
        )}

        {/* Unavailable overlay */}
        {!isAvailable && (
          <div className="absolute inset-0 bg-black/60 flex items-center justify-center backdrop-blur-xs">
            <span className="bg-red-700 text-white text-xs font-bold px-3 py-1 rounded-full shadow">
              Sold Out
            </span>
          </div>
        )}

        {/* Price tag */}
        <div className="absolute bottom-2.5 left-2.5 bg-red-700/95 text-white font-extrabold text-xs px-2.5 py-1 rounded-lg shadow-sm backdrop-blur-xs">
          Rs. {product.price}
        </div>
      </div>

      {/* Card Content */}
      <div className="p-3.5 flex flex-col flex-1 justify-between gap-2">
        <div>
          <h3 className="font-bold text-sm text-zinc-900 group-hover:text-red-700 transition-colors line-clamp-1 leading-snug">
            {title}
          </h3>
          {product.description && (
            <p className="text-[11px] text-zinc-500 line-clamp-2 mt-1 leading-snug font-normal">
              {product.description}
            </p>
          )}
        </div>

        {/* Action button */}
        <div className="pt-2 border-t border-zinc-100 flex items-center justify-between">
          <span className="text-[11px] text-zinc-400 font-medium">Fresh Tandoor</span>
          <button
            type="button"
            onClick={handleQuickAdd}
            disabled={!isAvailable}
            className="flex items-center gap-1 bg-red-50 hover:bg-red-700 text-red-700 hover:text-white disabled:bg-zinc-100 disabled:text-zinc-400 px-3 py-1.5 rounded-full text-xs font-bold transition-all duration-200"
          >
            <Plus size={13} />
            <span>Add</span>
          </button>
        </div>
      </div>
    </div>
  );
}
