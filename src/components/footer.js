"use client"
import React from 'react'
import { Phone, MapPin, Mail } from 'lucide-react';
import { FaSquareFacebook, FaSquareInstagram } from "react-icons/fa6";
import Link from 'next/link';

function Footer() {
  return (
    <footer className="bg-zinc-950 text-zinc-400 mt-16">
      <div className="max-w-7xl mx-auto px-6 py-12 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-10">

        {/* Brand Column */}
        <div className="sm:col-span-2 md:col-span-1">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-7 h-7 bg-red-700 rounded-lg flex items-center justify-center flex-shrink-0">
              <span className="text-white text-xs font-black">HB</span>
            </div>
            <h3 className="text-white font-bold text-base">Haq Bahu Naan Shop</h3>
          </div>
          <p className="text-sm text-zinc-500 leading-relaxed mb-4">
            Serving authentic, freshly baked naans and more. Visit us in Model Town, Lahore, or order online today.
          </p>
          <div className="flex items-center gap-3">
            <a
              href="#"
              className="w-8 h-8 bg-zinc-800 hover:bg-blue-700 rounded-lg flex items-center justify-center transition-colors"
              aria-label="Facebook"
            >
              <FaSquareFacebook size={16} className="text-zinc-400 hover:text-white" />
            </a>
            <a
              href="#"
              className="w-8 h-8 bg-zinc-800 hover:bg-pink-700 rounded-lg flex items-center justify-center transition-colors"
              aria-label="Instagram"
            >
              <FaSquareInstagram size={16} className="text-zinc-400 hover:text-white" />
            </a>
          </div>
        </div>

        {/* Contact Column */}
        <div>
          <h4 className="text-white font-semibold text-xs uppercase tracking-widest mb-4">Contact</h4>
          <div className="space-y-3.5">
            <Link
              href="https://maps.app.goo.gl/5XFAv67ZhpQVPdje6"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-start gap-2.5 text-sm hover:text-zinc-200 transition-colors group"
            >
              <MapPin size={15} className="text-red-600 mt-0.5 flex-shrink-0 group-hover:text-red-500" />
              <span>16-A, N Block, Model Town Extension, Lahore</span>
            </Link>
            <div className="flex items-start gap-2.5 text-sm">
              <Phone size={15} className="text-red-600 mt-0.5 flex-shrink-0" />
              <div className="flex flex-col gap-0.5">
                <a href="tel:03094130285" className="hover:text-zinc-200 transition-colors">03094130285</a>
                <a href="tel:03334381858" className="hover:text-zinc-200 transition-colors">03334381858</a>
              </div>
            </div>
            <a
              href="mailto:mzain.butt68@gmail.com"
              className="flex items-center gap-2.5 text-sm hover:text-zinc-200 transition-colors group"
            >
              <Mail size={15} className="text-red-600 flex-shrink-0 group-hover:text-red-500" />
              <span>mzain.butt68@gmail.com</span>
            </a>
          </div>
        </div>

        {/* Quick Links Column */}
        <div>
          <h4 className="text-white font-semibold text-xs uppercase tracking-widest mb-4">Quick Links</h4>
          <div className="space-y-2.5">
            <Link href="/" className="block text-sm hover:text-zinc-200 transition-colors">Home</Link>
            <Link href="/Menu" className="block text-sm hover:text-zinc-200 transition-colors">Full Menu</Link>
            <Link href="/Chat" className="block text-sm hover:text-zinc-200 transition-colors">Chat Support</Link>
            <a
              href="https://www.foodpanda.pk/restaurant/w6kj/haq-bahu-naan-shop"
              target="_blank"
              rel="noopener noreferrer"
              className="block text-sm text-pink-400 hover:text-pink-300 transition-colors"
            >
              Order on Foodpanda
            </a>
            <a
              href="https://wa.me/923094130285"
              target="_blank"
              rel="noopener noreferrer"
              className="block text-sm text-green-400 hover:text-green-300 transition-colors"
            >
              Order on WhatsApp
            </a>
          </div>
        </div>

      </div>

      {/* Bottom bar */}
      <div className="border-t border-zinc-800/60">
        <div className="max-w-7xl mx-auto px-6 py-4 flex flex-col sm:flex-row justify-between items-center gap-2">
          <p className="text-xs text-zinc-600">&copy; 2025 Haq Bahu Naan Shop. All rights reserved.</p>
          <p className="text-xs text-zinc-600">Designed &amp; built by Subhan Butt</p>
        </div>
      </div>
    </footer>
  );
}

export default Footer;