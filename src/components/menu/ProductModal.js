'use client';

import React, { useState } from 'react';
import { X, Plus, Minus, ShoppingCart, Heart, Check, AlertCircle } from 'lucide-react';
import { useCart } from '@/context/CartContext';
import { useWishlist } from '@/context/WishlistContext';

export default function ProductModal({ product, onClose }) {
  const { addToCart } = useCart();
  const { isWishlisted, toggleWishlist } = useWishlist();
  const [quantity, setQuantity] = useState(1);
  const [notes, setNotes] = useState('');
  const [activeImageIndex, setActiveImageIndex] = useState(0);

  if (!product) return null;

  const images = product.additional_images?.length
    ? product.additional_images
    : [product.image_url || product.pic || '/Nutella.jpg'];

  const isFavorited = isWishlisted(product.id);
  const isAvailable = product.is_available !== false;

  const handleAdd = () => {
    if (!isAvailable) return;
    addToCart(product, quantity, notes);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="bg-white w-full sm:max-w-lg sm:rounded-2xl rounded-t-2xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Image header */}
        <div className="relative bg-zinc-950 flex-shrink-0">
          <img
            src={images[activeImageIndex] || images[0]}
            alt={product.name || product.title}
            className="w-full h-56 sm:h-64 object-cover"
          />

          {/* Close button */}
          <button
            onClick={onClose}
            className="absolute top-3 left-3 w-8 h-8 rounded-full bg-black/60 hover:bg-black/80 text-white flex items-center justify-center transition-colors"
          >
            <X size={16} />
          </button>

          {/* Wishlist button */}
          <button
            onClick={() => toggleWishlist(product.id)}
            className="absolute top-3 right-3 w-8 h-8 rounded-full bg-white/90 hover:bg-white text-zinc-800 flex items-center justify-center shadow transition-colors"
          >
            <Heart
              size={16}
              className={isFavorited ? 'fill-red-600 text-red-600' : 'text-zinc-600'}
            />
          </button>

          {/* Price badge */}
          <div className="absolute bottom-3 right-3 bg-red-700 text-white text-sm font-extrabold px-3.5 py-1.5 rounded-full shadow-lg">
            Rs. {product.price}
          </div>

          {/* Category chip */}
          <div className="absolute bottom-3 left-3 bg-black/60 backdrop-blur-sm text-white text-xs px-2.5 py-1 rounded-full font-medium">
            {product.category_name || product.genre || 'Specialty Naan'}
          </div>
        </div>

        {/* Thumbnail gallery if multiple images */}
        {images.length > 1 && (
          <div className="flex gap-2 p-2.5 bg-zinc-100 overflow-x-auto border-b border-zinc-200">
            {images.map((img, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => setActiveImageIndex(idx)}
                className={`w-12 h-12 rounded-lg overflow-hidden border-2 flex-shrink-0 transition-all ${
                  activeImageIndex === idx ? 'border-red-600 scale-105' : 'border-transparent opacity-70'
                }`}
              >
                <img src={img} alt="Thumbnail" className="w-full h-full object-cover" />
              </button>
            ))}
          </div>
        )}

        {/* Modal body */}
        <div className="p-5 overflow-y-auto space-y-4">
          <div>
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold text-zinc-900 leading-snug">
                {product.name || product.title}
              </h2>
              {!isAvailable && (
                <span className="text-xs bg-red-100 text-red-700 font-bold px-2.5 py-1 rounded-md">
                  Currently Sold Out
                </span>
              )}
            </div>
            <p className="text-xs text-zinc-500 mt-1 leading-relaxed">
              {product.description || 'Freshly prepared and baked in our traditional tandoor upon order.'}
            </p>
          </div>

          {/* Special Instructions */}
          <div>
            <label className="block text-xs font-semibold text-zinc-700 mb-1">
              Cooking Preferences / Special Instructions (Optional)
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Extra crispy, mild spicy, less butter..."
              className="w-full text-xs p-2.5 border border-zinc-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-600/30 focus:border-red-600 transition-all placeholder-zinc-400"
            />
          </div>

          {/* Quantity selector */}
          <div className="flex items-center justify-between bg-zinc-50 border border-zinc-200 rounded-xl p-3">
            <span className="text-xs font-semibold text-zinc-700">Quantity</span>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                className="w-8 h-8 rounded-full border border-zinc-300 hover:border-red-500 hover:bg-red-50 flex items-center justify-center transition-colors"
              >
                <Minus size={14} className="text-zinc-700" />
              </button>
              <span className="w-8 text-center font-bold text-zinc-900 text-sm">{quantity}</span>
              <button
                type="button"
                onClick={() => setQuantity((q) => q + 1)}
                className="w-8 h-8 rounded-full border border-zinc-300 hover:border-red-500 hover:bg-red-50 flex items-center justify-center transition-colors"
              >
                <Plus size={14} className="text-zinc-700" />
              </button>
            </div>
          </div>
        </div>

        {/* Modal Footer / Add Button */}
        <div className="p-4 bg-zinc-50 border-t border-zinc-200 flex items-center justify-between gap-4">
          <div>
            <span className="text-[11px] text-zinc-500 block">Total Price</span>
            <span className="text-base font-black text-red-700">
              Rs. {Number(product.price) * quantity}
            </span>
          </div>

          <button
            type="button"
            onClick={handleAdd}
            disabled={!isAvailable}
            className="flex-1 bg-red-700 hover:bg-red-600 disabled:bg-zinc-300 disabled:cursor-not-allowed text-white font-bold py-3 px-5 rounded-xl shadow transition-colors flex items-center justify-center gap-2 text-xs sm:text-sm"
          >
            <ShoppingCart size={16} />
            {isAvailable ? 'Add to Cart' : 'Item Sold Out'}
          </button>
        </div>
      </div>
    </div>
  );
}
