'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Search,
  UtensilsCrossed,
  Sparkles,
  MapPin,
  Bike,
  Store,
  Phone,
  Clock,
  Heart,
  ShieldCheck,
} from 'lucide-react';
import Banner from '@/components/banner';
import Footer from '@/components/footer';
import ImageCarousel from '@/components/ImageCarousel';
import FoodCard from '@/components/menu/FoodCard';
import ProductModal from '@/components/menu/ProductModal';
import DealCard from '@/components/deals/DealCard';
import { initialProducts, initialDeals, initialShopSettings } from '@/lib/data/initialData';
import { useWishlist } from '@/context/WishlistContext';

export default function Homepage() {
  const [products, setProducts] = useState(initialProducts);
  const [deals, setDeals] = useState(initialDeals);
  const [showChatMsg, setShowChatMsg] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedGenre, setSelectedGenre] = useState('All');
  const [selectedProduct, setSelectedProduct] = useState(null);

  const { wishlist } = useWishlist();

  // Fetch live products and deals from Supabase if table exists
  useEffect(() => {
    async function loadLiveData() {
      try {
        const { supabase, isSupabaseConfigured } = await import('@/lib/supabase/client');
        if (isSupabaseConfigured()) {
          const { data: dbProducts } = await supabase.from('products').select('*');
          if (dbProducts && dbProducts.length > 0) {
            setProducts(dbProducts);
          }
          const { data: dbDeals } = await supabase.from('deals').select('*');
          if (dbDeals && dbDeals.length > 0) {
            setDeals(dbDeals);
          }
        }
      } catch (e) {
        console.warn('Using initial product catalog fallback:', e);
      }
    }
    loadLiveData();
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      setShowChatMsg(false);
    }, 10000);
    return () => clearTimeout(timer);
  }, []);

  const genres = [
    'All',
    'Special',
    'Chicken',
    'Beef',
    'Mutton',
    'Aloo',
    'Besaan',
    'Rogni',
    'Pratha',
    'Regular',
    'Side',
    'Favorites',
  ];

  const filteredItems = products.filter((item) => {
    const matchesSearch =
      (item.name || item.title || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (item.genre && item.genre.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (item.description && item.description.toLowerCase().includes(searchTerm.toLowerCase()));

    let matchesGenre = true;
    if (selectedGenre === 'Favorites') {
      matchesGenre = wishlist.includes(item.id);
    } else if (selectedGenre !== 'All') {
      matchesGenre = item.genre?.toLowerCase() === selectedGenre.toLowerCase();
    }

    return matchesSearch && matchesGenre;
  });

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Video Banner with Lahore Branding */}
      <Banner />

      {/* Delivery Radius & Timing Highlight Banner */}
      <div className="bg-zinc-900 border-b border-zinc-800 text-zinc-300 text-xs py-2.5 px-4 sm:px-6">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="flex h-2 w-2 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            <span className="font-semibold text-white">Tandoor Live:</span>
            <span>Baking hot naans in Model Town, Lahore</span>
          </div>

          <div className="flex items-center gap-4 text-[11px] text-zinc-400">
            <span className="flex items-center gap-1 text-red-400">
              <Bike size={13} /> 3 km Delivery Zone
            </span>
            <span className="hidden sm:flex items-center gap-1">
              <Clock size={13} /> {initialShopSettings.operating_hours}
            </span>
            <span className="text-emerald-400 font-semibold">
              Free Delivery &gt; Rs. 2500
            </span>
          </div>
        </div>
      </div>

      {/* Featured Deals Carousel Section */}
      <section id="deals-section">
        <ImageCarousel />
      </section>

      {/* Search Bar Section */}
      <div className="bg-background px-4 pt-6 pb-2">
        <div className="max-w-2xl mx-auto relative">
          <Search
            className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none"
            size={18}
          />
          <input
            type="text"
            placeholder="Search freshly baked naans, pizza naan, mutton qeema..."
            className="w-full pl-11 pr-4 py-3 bg-white border border-zinc-200 rounded-full text-sm text-zinc-900 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-red-600/30 focus:border-red-600 transition-all shadow-sm"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      {/* Sticky Category Filter Tabs Bar */}
      <div className="w-full overflow-x-auto sticky top-14 z-20 bg-zinc-950/95 backdrop-blur-md border-b border-zinc-800 scrollbar-none py-2.5 px-4 sm:px-6 shadow-sm">
        <div className="max-w-7xl mx-auto flex gap-2 min-w-max">
          {genres.map((genre) => {
            const isFav = genre === 'Favorites';
            return (
              <button
                key={genre}
                onClick={() => setSelectedGenre(genre)}
                className={`px-4 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all duration-200 flex items-center gap-1.5 ${
                  selectedGenre === genre
                    ? 'bg-red-700 text-white shadow-md'
                    : 'bg-zinc-800/90 text-zinc-300 hover:bg-zinc-700 hover:text-white'
                }`}
              >
                {isFav && <Heart size={12} className={wishlist.length ? 'fill-red-400 text-red-400' : ''} />}
                {genre}
                {isFav && wishlist.length > 0 && ` (${wishlist.length})`}
              </button>
            );
          })}
        </div>
      </div>

      {/* Value Combo Deals Section */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-8">
        <div className="flex items-end justify-between mb-4">
          <div>
            <div className="flex items-center gap-1.5 text-xs font-bold text-red-700 uppercase tracking-widest">
              <Sparkles size={14} /> Value Packs
            </div>
            <h2 className="text-xl sm:text-2xl font-black text-zinc-900">
              Crazy Deals & Combos
            </h2>
          </div>
          <span className="text-xs text-zinc-500 hidden sm:block">Special discount bundles</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {deals.map((deal) => (
            <DealCard key={deal.id} deal={deal} onSelect={(d) => setSelectedProduct(d)} />
          ))}
        </div>
      </div>

      {/* Menu Items Grid Section */}
      <div className="flex-1 bg-background">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-10 pb-4 flex items-end justify-between">
          <div>
            <h2 className="text-xl sm:text-2xl font-extrabold text-zinc-900">
              {selectedGenre === 'All'
                ? 'All Fresh Naans'
                : selectedGenre === 'Favorites'
                ? 'My Favorite Items'
                : `${selectedGenre} Naans`}
            </h2>
            <p className="text-xs text-zinc-500 mt-0.5">
              {filteredItems.length} fresh {filteredItems.length !== 1 ? 'items' : 'item'} available for order
            </p>
          </div>

          <Link
            href="/Menu"
            className="flex items-center gap-1.5 text-xs sm:text-sm font-bold text-red-700 hover:text-red-800 bg-red-50 hover:bg-red-100 border border-red-200 px-4 py-2 rounded-full transition-all"
          >
            <UtensilsCrossed size={14} />
            <span>Full Categorized Menu</span>
          </Link>
        </div>

        {/* Product Cards Grid */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 pb-20">
          {filteredItems.length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-3.5 sm:gap-5">
              {filteredItems.map((item) => (
                <FoodCard
                  key={item.id}
                  product={item}
                  onSelect={(p) => setSelectedProduct(p)}
                />
              ))}
            </div>
          ) : (
            <div className="py-24 flex flex-col items-center text-center">
              <div className="w-16 h-16 bg-zinc-100 rounded-full flex items-center justify-center mb-4">
                <Search size={28} className="text-zinc-400" />
              </div>
              <p className="text-base font-bold text-zinc-700">No items found</p>
              <p className="text-xs text-zinc-400 mt-1">
                {selectedGenre === 'Favorites'
                  ? 'You have not added any items to your favorites yet. Click the heart icon on any naan to save it!'
                  : 'Try searching for something else like "pizza", "cheese", or "rogani".'}
              </p>
              <button
                onClick={() => {
                  setSearchTerm('');
                  setSelectedGenre('All');
                }}
                className="mt-4 text-xs text-red-700 font-bold hover:underline"
              >
                Clear all filters
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Floating Chat Support Button */}
      <div className="fixed bottom-5 right-5 z-40 flex items-center gap-2">
        {showChatMsg && (
          <span className="bg-zinc-950 text-white text-xs px-3.5 py-1.5 rounded-full shadow-xl animate-fade-in whitespace-nowrap border border-zinc-800">
            HBT Chat Assistant
          </span>
        )}
        <Link href="/Chat" title="Chat with AI Assistant">
          <img
            src="/chatbot.png"
            alt="Chat Support"
            className="w-14 h-14 cursor-pointer hover:scale-110 transition-transform drop-shadow-xl"
          />
        </Link>
      </div>

      {/* Interactive Product Customization Modal */}
      {selectedProduct && (
        <ProductModal
          product={selectedProduct}
          onClose={() => setSelectedProduct(null)}
        />
      )}

      {/* Footer */}
      <Footer />
    </div>
  );
}
