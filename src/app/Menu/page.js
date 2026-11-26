'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Search, UtensilsCrossed, Sparkles } from 'lucide-react';
import Footer from '@/components/footer';
import MenuPdfButton from '@/components/MenuPdfButton';
import FoodCard from '@/components/menu/FoodCard';
import DealCard from '@/components/deals/DealCard';
import { dealMatches } from '@/lib/dealSearch';
import dynamic from 'next/dynamic';

// The product pop-up only appears after a tap, so its code is loaded then instead of with the page.
const ProductModal = dynamic(() => import('@/components/menu/ProductModal'));
import { useSite } from '@/context/SiteContext';

export default function MenuPage() {
  const [showChatMsg, setShowChatMsg] = useState(true);
  const { products, deals, loading: siteLoading, error: siteError } = useSite();
  const [selectedGenre, setSelectedGenre] = useState('All');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedProduct, setSelectedProduct] = useState(null);
  const shownDeals = deals.filter((d) => dealMatches(d, searchTerm));

  useEffect(() => {
    const timer = setTimeout(() => {
      setShowChatMsg(false);
    }, 10000);
    return () => clearTimeout(timer);
  }, []);

  // Category mapping
  const baseSections = [
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
  // Categories added later in the admin panel get their own section automatically.
  const known = new Set(baseSections.map((s) => s.genre.toLowerCase()));
  const extraSections = [...new Set(products.map((p) => p.genre).filter((g) => g && !known.has(g.toLowerCase())))].map((g) => ({ title: g, genre: g }));
  const categorySections = [...baseSections, ...extraSections];

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Menu Header Bar */}
      <div className="bg-zinc-950 px-4 sm:px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-800">
        <div>
          <h1 className="text-white font-black text-lg sm:text-xl flex items-center gap-2">
            <UtensilsCrossed size={18} className="text-red-600" />
            Full Tandoor Menu
          </h1>
          <p className="text-zinc-400 text-xs">
            Qeema naan, pizza naan, cheese naan, stuffed parathas and sides, freshly baked in our tandoor in Model Town, Lahore
          </p>
        </div>

        <div className="flex items-center gap-3">
          <MenuPdfButton className="flex items-center gap-1.5 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-200 text-xs font-semibold px-3.5 py-2 rounded-xl transition-colors disabled:opacity-70" />
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
          <a
            href="#deals-section"
            onClick={() => setSelectedGenre('Deals')}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all ${
              selectedGenre === 'Deals'
                ? 'bg-red-700 text-white shadow-xs'
                : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700 hover:text-white'
            }`}
          >
            <Sparkles size={12} />
            Deals
          </a>
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
        {(shownDeals.length > 0 || selectedGenre === 'Deals') && (
          <section id="deals-section" className="scroll-mt-28 space-y-4">
            <div className="flex items-center gap-2.5 border-b border-zinc-200 pb-2.5">
              <span className="w-1.5 h-6 bg-red-700 rounded-full inline-block" />
              <h2 className="text-xl font-bold text-zinc-900 tracking-tight">Crazy Deals &amp; Combos</h2>
              <span className="text-xs text-zinc-400 font-medium">({shownDeals.length})</span>
            </div>
            {shownDeals.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {shownDeals.map((deal, i) => (
                  <DealCard key={deal.id} deal={deal} priority={i === 0} onSelect={(d) => setSelectedProduct(d)} />
                ))}
              </div>
            ) : (
              <p className="text-sm text-zinc-500">{searchTerm ? 'No deals match your search.' : 'No deals right now. Please check back soon.'}</p>
            )}
          </section>
        )}
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

              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 auto-rows-fr gap-3.5 sm:gap-4">
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
      <div className="fixed bottom-24 right-4 z-40 flex items-center gap-2">
        {showChatMsg && (
          <span className="bg-zinc-950 text-white text-xs px-3.5 py-1.5 rounded-full shadow-xl animate-fade-in whitespace-nowrap border border-zinc-800">
            HBT Chat Support
          </span>
        )}
        <Link href="/Chat" title="Chat with AI Assistant">
          <Image
            src="/chatbot.png"
            alt="Chat Support"
            width={56}
            height={56}
            sizes="56px"
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
