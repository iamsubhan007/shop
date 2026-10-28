'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Download, Search, UtensilsCrossed, Sparkles } from 'lucide-react';
import Banner from '@/components/banner';
import Footer from '@/components/footer';
import ImageCarousel from '@/components/ImageCarousel';
import FoodCard from '@/components/menu/FoodCard';
import ProductModal from '@/components/menu/ProductModal';
import { initialProducts, initialCategories } from '@/lib/data/initialData';

export default function MenuPage() {
  const [showChatMsg, setShowChatMsg] = useState(true);
  const [products, setProducts] = useState(initialProducts);
  const [selectedGenre, setSelectedGenre] = useState('All');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedProduct, setSelectedProduct] = useState(null);

  // Fetch live products from Supabase
  useEffect(() => {
    async function loadProducts() {
      try {
        const { supabase, isSupabaseConfigured } = await import('@/lib/supabase/client');
        if (isSupabaseConfigured()) {
          const { data: dbProducts } = await supabase.from('products').select('*');
          if (dbProducts && dbProducts.length > 0) {
            setProducts(dbProducts);
          }
        }
      } catch (e) {
        console.warn('Using fallback menu items:', e);
      }
    }
    loadProducts();
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      setShowChatMsg(false);
    }, 10000);
    return () => clearTimeout(timer);
  }, []);

  // Category mapping
  const categorySections = [
    { title: 'Special Items', genre: 'Special' },
    { title: 'Chicken Naan', genre: 'Chicken' },
    { title: 'Beef Qeema Naan', genre: 'Beef' },
    { title: 'Mutton Naan', genre: 'Mutton' },
    { title: 'Aloo Wala Naan', genre: 'Aloo' },
    { title: 'Besaan Wala Naan', genre: 'Besaan' },
    { title: 'Rogni Naan', genre: 'Rogni' },
    { title: 'Pratha', genre: 'Pratha' },
    { title: 'Regular Items', genre: 'Regular' },
    { title: 'Sides & Sauces', genre: 'Side' },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Banner />
      <ImageCarousel />

      {/* Menu Header Bar */}
      <div className="bg-zinc-950 px-4 sm:px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-800">
        <div>
          <h1 className="text-white font-black text-lg sm:text-xl flex items-center gap-2">
            <UtensilsCrossed size={18} className="text-red-600" />
            Full Tandoor Menu
          </h1>
          <p className="text-zinc-400 text-xs">
            Authentic freshly baked tandoori naans, stuffed parathas, and sides
          </p>
        </div>

        <div className="flex items-center gap-3">
          <a
            href="/Haq-Bahu-MENU.pdf"
            download
            className="flex items-center gap-1.5 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-200 text-xs font-semibold px-3.5 py-2 rounded-xl transition-colors"
          >
            <Download size={13} />
            Download PDF Menu
          </a>
        </div>
      </div>

      {/* Search Input */}
      <div className="bg-background px-4 pt-5 pb-2">
        <div className="max-w-2xl mx-auto relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400" size={16} />
          <input
            type="text"
            placeholder="Search within menu (e.g. mutton, nutella, makhan, rogani)..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-11 pr-4 py-2.5 bg-white border border-zinc-200 rounded-full text-xs text-zinc-800 focus:outline-none focus:ring-2 focus:ring-red-600/30 focus:border-red-600 shadow-xs"
          />
        </div>
      </div>

      {/* Sticky Category Quick Jump Bar */}
      <div className="w-full overflow-x-auto sticky top-14 z-20 bg-zinc-950/95 backdrop-blur-md border-b border-zinc-800/80 scrollbar-none py-2.5 px-4 sm:px-6 shadow-sm">
        <div className="max-w-7xl mx-auto flex gap-2 min-w-max">
          <button
            onClick={() => setSelectedGenre('All')}
            className={`px-3.5 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all ${
              selectedGenre === 'All'
                ? 'bg-red-700 text-white shadow-xs'
                : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700 hover:text-white'
            }`}
          >
            All Categories
          </button>
          {categorySections.map((sec) => (
            <a
              key={sec.genre}
              href={`#${sec.genre}`}
              onClick={() => setSelectedGenre(sec.genre)}
              className={`px-3.5 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all ${
                selectedGenre === sec.genre
                  ? 'bg-red-700 text-white shadow-xs'
                  : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700 hover:text-white'
              }`}
            >
              {sec.title}
            </a>
          ))}
        </div>
      </div>

      {/* Categorized Menu Sections */}
      <div className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 py-8 space-y-10">
        {categorySections.map((sec) => {
          const itemsInSection = products.filter((item) => {
            const matchesGenre = item.genre?.toLowerCase() === sec.genre.toLowerCase();
            const matchesSearch =
              !searchTerm ||
              (item.name || item.title || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
              (item.description && item.description.toLowerCase().includes(searchTerm.toLowerCase()));
            return matchesGenre && matchesSearch;
          });

          if (itemsInSection.length === 0) return null;

          return (
            <section key={sec.genre} id={sec.genre} className="scroll-mt-28 space-y-4">
              <div className="flex items-center justify-between border-b border-zinc-200 pb-2.5">
                <div className="flex items-center gap-2.5">
                  <span className="w-1.5 h-6 bg-red-700 rounded-full inline-block" />
                  <h2 className="text-xl font-bold text-zinc-900 tracking-tight">
                    {sec.title}
                  </h2>
                  <span className="text-xs text-zinc-400 font-medium">
                    ({itemsInSection.length})
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-3.5 sm:gap-4">
                {itemsInSection.map((product) => (
                  <FoodCard
                    key={product.id}
                    product={product}
                    onSelect={(p) => setSelectedProduct(p)}
                  />
                ))}
              </div>
            </section>
          );
        })}
      </div>

      {/* Floating Chat Assistant Button */}
      <div className="fixed bottom-5 right-5 z-40 flex items-center gap-2">
        {showChatMsg && (
          <span className="bg-zinc-950 text-white text-xs px-3.5 py-1.5 rounded-full shadow-xl animate-fade-in whitespace-nowrap border border-zinc-800">
            HBT Chat Support
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

      {/* Product Customization Modal */}
      {selectedProduct && (
        <ProductModal
          product={selectedProduct}
          onClose={() => setSelectedProduct(null)}
        />
      )}

      <Footer />
    </div>
  );
}
