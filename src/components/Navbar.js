'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Menu,
  X,
  Flame,
  UtensilsCrossed,
  Phone,
  ShoppingBag,
  Heart,
  User,
  ShieldCheck,
  Receipt,
  Sparkles,
  LogOut,
} from 'lucide-react';
import { SiFoodpanda } from 'react-icons/si';
import { useCart } from '@/context/CartContext';
import { useWishlist } from '@/context/WishlistContext';
import { useAuth } from '@/context/AuthContext';

export default function Navbar() {
  const [isOpen, setIsOpen] = useState(false);
  const [userDropdown, setUserDropdown] = useState(false);
  const pathname = usePathname();

  const { itemCount, subtotal, openCart } = useCart();
  const { wishlistCount } = useWishlist();
  const { user, profile, isAdmin, signOut } = useAuth();

  const navLinks = [
    { href: '/', label: 'Home' },
    { href: '/Menu', label: 'Menu', icon: <UtensilsCrossed size={14} /> },
    { href: '/#deals-section', label: 'Deals', icon: <Sparkles size={14} /> },
    { href: '/orders', label: 'My Orders', icon: <Receipt size={14} /> },
  ];

  return (
    <header className="sticky top-0 z-40 w-full bg-zinc-950/95 backdrop-blur-md border-b border-zinc-800/80 shadow-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-15 flex items-center justify-between gap-3 sm:gap-6">
        {/* Brand Logo */}
        <Link
          href="/"
          className="flex items-center gap-2.5 text-white font-black text-base sm:text-lg hover:text-red-400 transition-colors flex-shrink-0 group"
        >
          <div className="w-8 h-8 rounded-lg bg-red-600 flex items-center justify-center text-white shadow-md group-hover:scale-105 transition-transform">
            <Flame size={20} className="fill-white" />
          </div>
          <div className="flex flex-col">
            <span className="leading-none tracking-tight">Haq Bahu Naan</span>
            <span className="text-[10px] text-red-400 tracking-wider font-semibold uppercase">
              Fresh &bull; Authentic
            </span>
          </div>
        </Link>

        {/* Desktop Navigation Links */}
        <nav className="hidden lg:flex items-center gap-1">
          {navLinks.map(({ href, label, icon }) => {
            const isActive = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all duration-150 ${
                  isActive
                    ? 'bg-red-700 text-white shadow-xs'
                    : 'text-zinc-300 hover:text-white hover:bg-zinc-800/80'
                }`}
              >
                {icon}
                {label}
              </Link>
            );
          })}
        </nav>

        {/* Right side actions */}
        <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
          {/* Foodpanda & WhatsApp links */}
          <div className="hidden xl:flex items-center gap-2 pr-2 border-r border-zinc-800">
            <a
              href="https://www.foodpanda.pk/restaurant/w6kj/haq-bahu-naan-shop"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-pink-400 hover:text-pink-300 text-xs font-semibold px-2 py-1 rounded-md hover:bg-pink-950/30 transition-colors"
            >
              <SiFoodpanda size={14} />
              <span>Foodpanda</span>
            </a>
            <a
              href="https://wa.me/923094130285"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-emerald-400 hover:text-emerald-300 text-xs font-semibold px-2 py-1 rounded-md hover:bg-emerald-950/30 transition-colors"
            >
              <Phone size={13} />
              <span>WhatsApp</span>
            </a>
          </div>

          {/* Wishlist Button */}
          <Link
            href="/Menu?filter=wishlist"
            className="relative p-2 rounded-xl text-zinc-300 hover:text-white hover:bg-zinc-800/70 transition-colors"
            title="Wishlist / Favourites"
          >
            <Heart size={18} />
            {wishlistCount > 0 && (
              <span className="absolute -top-1 -right-1 bg-red-600 text-white text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center ring-2 ring-zinc-950">
                {wishlistCount}
              </span>
            )}
          </Link>

          {/* Cart Drawer Trigger Button */}
          <button
            type="button"
            onClick={openCart}
            className="flex items-center gap-2 bg-red-700 hover:bg-red-600 text-white px-3 sm:px-3.5 py-1.5 sm:py-2 rounded-xl font-bold text-xs shadow-md transition-all active:scale-95"
            aria-label="Open cart"
          >
            <div className="relative">
              <ShoppingBag size={16} />
              {itemCount > 0 && (
                <span className="absolute -top-2 -right-2 bg-white text-red-700 text-[10px] font-extrabold w-4 h-4 rounded-full flex items-center justify-center shadow-xs">
                  {itemCount}
                </span>
              )}
            </div>
            <span className="hidden sm:inline">
              {itemCount > 0 ? `Rs. ${subtotal}` : 'Cart'}
            </span>
          </button>

          {/* User Account / Admin Menu */}
          <div className="relative">
            {user ? (
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setUserDropdown(!userDropdown)}
                  className="flex items-center gap-1.5 p-1.5 rounded-xl text-zinc-300 hover:text-white hover:bg-zinc-800/80 transition-colors border border-zinc-800"
                >
                  <div className="w-6 h-6 rounded-full bg-zinc-700 text-zinc-200 flex items-center justify-center text-xs font-bold">
                    {(profile?.full_name || user.email || 'U')[0].toUpperCase()}
                  </div>
                  <span className="text-xs font-semibold hidden md:inline max-w-[90px] truncate">
                    {profile?.full_name || user.email?.split('@')[0]}
                  </span>
                </button>

                {/* Dropdown */}
                {userDropdown && (
                  <div
                    className="absolute right-0 mt-2 w-52 bg-white rounded-2xl shadow-2xl py-2 border border-zinc-200 z-50 text-zinc-800 text-xs animate-fade-in"
                    onClick={() => setUserDropdown(false)}
                  >
                    <div className="px-3.5 py-2 border-b border-zinc-100">
                      <div className="font-bold text-zinc-900 truncate">
                        {profile?.full_name || 'Customer'}
                      </div>
                      <div className="text-[11px] text-zinc-500 truncate">{user.email}</div>
                    </div>

                    <Link
                      href="/orders"
                      className="flex items-center gap-2 px-3.5 py-2 hover:bg-zinc-50 text-zinc-700"
                    >
                      <Receipt size={14} /> My Orders
                    </Link>

                    {isAdmin && (
                      <Link
                        href="/admin"
                        className="flex items-center gap-2 px-3.5 py-2 hover:bg-red-50 text-red-700 font-bold"
                      >
                        <ShieldCheck size={14} /> Admin Dashboard
                      </Link>
                    )}

                    <div className="border-t border-zinc-100 my-1" />

                    <button
                      type="button"
                      onClick={signOut}
                      className="w-full flex items-center gap-2 px-3.5 py-2 hover:bg-zinc-50 text-red-600 font-semibold"
                    >
                      <LogOut size={14} /> Sign Out
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-1.5">
                <Link
                  href="/auth"
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-zinc-200 hover:text-white bg-zinc-800/80 hover:bg-zinc-800 rounded-xl transition-colors border border-zinc-700/60"
                >
                  <User size={13} />
                  <span>Sign In</span>
                </Link>
              </div>
            )}
          </div>

          {/* Mobile Menu Hamburger */}
          <button
            type="button"
            onClick={() => setIsOpen(!isOpen)}
            className="lg:hidden text-zinc-300 hover:text-white p-1.5 rounded-lg hover:bg-zinc-800 transition-colors"
            aria-label="Toggle menu"
          >
            {isOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </div>

      {/* Mobile Slide-down Menu */}
      {isOpen && (
        <div className="lg:hidden bg-zinc-950 border-t border-zinc-800 px-4 py-4 flex flex-col gap-2 animate-slide-down">
          {navLinks.map(({ href, label, icon }) => (
            <Link
              key={href}
              href={href}
              onClick={() => setIsOpen(false)}
              className="flex items-center gap-2.5 px-3 py-2 text-zinc-200 hover:text-white hover:bg-zinc-800 rounded-xl text-sm font-semibold transition-colors"
            >
              {icon}
              {label}
            </Link>
          ))}

          {isAdmin && (
            <Link
              href="/admin"
              onClick={() => setIsOpen(false)}
              className="flex items-center gap-2 px-3 py-2 text-amber-400 hover:bg-zinc-800 rounded-xl text-sm font-semibold transition-colors"
            >
              <ShieldCheck size={15} />
              Admin / Owner Dashboard
            </Link>
          )}

          {!user && (
            <Link
              href="/auth"
              onClick={() => setIsOpen(false)}
              className="flex items-center justify-center gap-2 bg-red-700 hover:bg-red-600 text-white px-4 py-2.5 rounded-xl text-sm font-bold shadow transition-colors mt-2"
            >
              <User size={15} />
              Customer Login / Register
            </Link>
          )}

          <div className="border-t border-zinc-800 pt-3 mt-1 flex flex-col gap-2">
            <a
              href="https://www.foodpanda.pk/restaurant/w6kj/haq-bahu-naan-shop"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-3 py-2 text-pink-400 hover:text-pink-300 text-xs font-semibold"
            >
              <SiFoodpanda size={15} />
              Order via Foodpanda
            </a>
            <a
              href="https://wa.me/923094130285"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 bg-green-700 hover:bg-green-600 text-white px-4 py-2.5 rounded-xl text-xs font-bold transition-colors"
            >
              <Phone size={14} />
              Direct WhatsApp (+92 309 4130285)
            </a>
          </div>
        </div>
      )}
    </header>
  );
}
