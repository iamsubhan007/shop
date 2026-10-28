'use client';

import { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight, X, ShoppingCart, Phone } from 'lucide-react';
import { useCart } from '@/context/CartContext';
import { initialDeals } from '@/lib/data/initialData';

const images = [
  {
    dealId: 'd1',
    title: 'Crazy Deal 1',
    price: 1050,
    url: 'deal1.png',
    message: `Crazy Deal 1\n2 Pizza Naan + 500 ml Cola Next\nSet Quantity: 1`,
  },
  {
    dealId: 'd2',
    title: 'Crazy Deal 2',
    price: 1400,
    url: 'deal2.png',
    message: `Crazy Deal 2\n5 Beef/Chicken Naan + 500 ml Cola Next\nSet Quantity: 1`,
  },
  {
    dealId: 'd3',
    title: 'Crazy Deal 3',
    price: 950,
    url: 'deal3.png',
    message: `Crazy Deal 3\n5 Aloo Naan + 500 ml Cola Next + 1 Raita\nSet Quantity: 1`,
  },
];

const INTERVAL = 4000;
const WHATSAPP_NUMBER = '923094130285';

export default function ImageCarousel() {
  const { addToCart } = useCart();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [selectedImage, setSelectedImage] = useState(null);

  useEffect(() => {
    if (paused) return;
    const interval = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % images.length);
    }, INTERVAL);
    return () => clearInterval(interval);
  }, [paused]);

  const prevSlide = () => {
    setCurrentIndex((prev) => (prev - 1 + images.length) % images.length);
    setPaused(true);
  };

  const nextSlide = () => {
    setCurrentIndex((prev) => (prev + 1) % images.length);
    setPaused(true);
  };

  const openModal = (image) => {
    setSelectedImage(image);
    setShowModal(true);
    setPaused(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setSelectedImage(null);
    setPaused(false);
  };

  const handleBuyNow = () => {
    if (!selectedImage) return;
    const message = selectedImage.message;
    navigator.clipboard.writeText(message);
    const url = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
    window.open(url, '_blank');
  };

  const handleAddToCart = () => {
    if (!selectedImage) return;
    const matchedDeal = initialDeals.find((d) => d.id === selectedImage.dealId) || {
      id: selectedImage.dealId || 'deal',
      title: selectedImage.title,
      price: selectedImage.price,
      image_url: `/${selectedImage.url}`,
    };

    addToCart(
      {
        id: matchedDeal.id,
        title: matchedDeal.title,
        price: matchedDeal.price,
        image_url: matchedDeal.image_url,
        genre: 'Deal',
        is_deal: true,
      },
      1
    );
    closeModal();
  };

  return (
    <>
      {/* Carousel strip */}
      <div className="relative w-full h-24 sm:h-40 md:h-64 overflow-hidden bg-zinc-900 group">
        {/* Deal badge */}
        <div className="absolute top-2 left-3 z-20">
          <span className="bg-red-700 text-white text-[10px] font-bold px-2.5 py-1 rounded-full uppercase tracking-wide shadow">
            Special Deals
          </span>
        </div>

        {/* Slides */}
        {images.map((image, index) => (
          <div
            key={index}
            onClick={() => openModal(image)}
            className={`absolute inset-0 w-full h-full transition-opacity duration-700 ease-in-out cursor-pointer
              ${index === currentIndex ? 'opacity-100 z-10' : 'opacity-0 z-0'}`}
          >
            <img
              src={image.url}
              alt={`Special Deal ${index + 1}`}
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent" />
          </div>
        ))}

        {/* Nav arrows */}
        <button
          onClick={(e) => { e.stopPropagation(); prevSlide(); }}
          className="absolute left-3 top-1/2 -translate-y-1/2 z-20 w-8 h-8 bg-black/50 hover:bg-black/75 text-white rounded-full flex items-center justify-center transition-all opacity-0 group-hover:opacity-100"
          aria-label="Previous"
        >
          <ChevronLeft size={16} />
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); nextSlide(); }}
          className="absolute right-3 top-1/2 -translate-y-1/2 z-20 w-8 h-8 bg-black/50 hover:bg-black/75 text-white rounded-full flex items-center justify-center transition-all opacity-0 group-hover:opacity-100"
          aria-label="Next"
        >
          <ChevronRight size={16} />
        </button>

        {/* Dot indicators */}
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-20 flex gap-1.5">
          {images.map((_, idx) => (
            <button
              key={idx}
              onClick={(e) => { e.stopPropagation(); setCurrentIndex(idx); setPaused(true); }}
              className={`rounded-full transition-all duration-300 ${
                idx === currentIndex ? 'w-5 h-2 bg-white' : 'w-2 h-2 bg-white/50 hover:bg-white/75'
              }`}
              aria-label={`Go to slide ${idx + 1}`}
            />
          ))}
        </div>
      </div>

      {/* Deal Modal */}
      {showModal && selectedImage && (
        <div
          className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 px-4"
          onClick={closeModal}
        >
          <div
            className="bg-white rounded-2xl overflow-hidden w-full max-w-sm shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-100">
              <span className="font-bold text-sm text-zinc-900">{selectedImage.title}</span>
              <button
                onClick={closeModal}
                className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-zinc-100 text-zinc-500 hover:text-zinc-800 transition-colors"
                aria-label="Close"
              >
                <X size={16} />
              </button>
            </div>

            {/* Deal image */}
            <img
              src={selectedImage.url}
              alt="Selected Deal"
              className="w-full max-h-64 object-contain bg-zinc-50"
            />

            {/* CTAs */}
            <div className="p-4 space-y-2">
              <button
                onClick={handleAddToCart}
                className="w-full bg-red-700 hover:bg-red-600 text-white font-bold py-3 rounded-xl transition-colors text-xs flex items-center justify-center gap-2 shadow-sm"
              >
                <ShoppingCart size={15} />
                Add Deal to Cart (Online Order)
              </button>

              <button
                onClick={handleBuyNow}
                className="w-full bg-zinc-100 hover:bg-zinc-200 text-zinc-800 font-semibold py-2.5 rounded-xl transition-colors text-xs flex items-center justify-center gap-2"
              >
                <Phone size={14} className="text-green-700" />
                Or Order on WhatsApp
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
