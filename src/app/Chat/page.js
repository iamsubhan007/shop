"use client"
import React from 'react'
import { MessageCircle, ArrowLeft } from 'lucide-react';
import Link from 'next/link'

function ChatSupportPage() {
  return (
    <div className="min-h-[calc(100vh-56px)] bg-zinc-100 flex flex-col">

      {/* Page header */}
      <div className="bg-zinc-950 px-6 py-6 text-center relative">
        <Link
          href="/"
          className="absolute left-4 top-1/2 -translate-y-1/2 flex items-center gap-1.5 text-zinc-400 hover:text-white text-sm transition-colors"
        >
          <ArrowLeft size={16} />
          <span className="hidden sm:inline">Back</span>
        </Link>
        <div className="flex items-center justify-center gap-2 mb-1">
          <div className="w-8 h-8 bg-red-700/20 rounded-full flex items-center justify-center">
            <MessageCircle className="text-red-400" size={18} />
          </div>
          <h1 className="text-lg font-bold text-white">Chat Support</h1>
        </div>
        <p className="text-zinc-400 text-xs">Get instant answers about our menu, orders &amp; more</p>
      </div>

      {/* Chat iframe */}
      <div className="flex-1 flex flex-col items-center justify-start px-4 py-6">
        <div className="w-full max-w-3xl bg-white rounded-2xl overflow-hidden shadow-lg border border-zinc-200 flex-1">
          <iframe
            src="https://app.dante-ai.com/embed/?kb_id=485c1a70-81ae-46e8-8061-114e9486060c&token=9e1df131-9388-4c68-9c62-21718443c521&modeltype=gpt-4-omnimodel-mini&tabs=false"
            allow="clipboard-write; clipboard-read; *;microphone *"
            width="100%"
            height="580"
            style={{ display: 'block', border: 'none' }}
            title="Haq Bahu Chat Support"
          />
        </div>

        {/* Info note */}
        <p className="text-center text-xs text-zinc-400 mt-4">
          Powered by AI &mdash; For urgent orders, call{' '}
          <a href="tel:03094130285" className="text-red-600 hover:underline font-medium">
            03094130285
          </a>
        </p>
      </div>
    </div>
  );
}

export default ChatSupportPage;