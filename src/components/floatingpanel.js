"use client"
import React from 'react';
import { X, ExternalLink } from 'lucide-react';

function FloatingTogglePanel({ toggleItems, onClose }) {
  if (!toggleItems || toggleItems.length === 0) return null;

  return (
    <div
      className="fixed bottom-24 right-5 md:top-20 md:right-8 md:bottom-auto
        w-72 max-h-[360px] bg-zinc-950 text-white rounded-2xl shadow-2xl
        border border-zinc-800 overflow-hidden z-50 flex flex-col"
    >
      {/* Header */}
      <div className="flex justify-between items-center px-4 py-3 border-b border-zinc-800 flex-shrink-0">
        <h3 className="font-semibold text-sm text-zinc-100">Available Options</h3>
        <button
          onClick={onClose}
          className="text-zinc-500 hover:text-white transition-colors p-1 rounded-md hover:bg-zinc-800"
          aria-label="Close options"
        >
          <X size={16} />
        </button>
      </div>

      {/* Options List */}
      <div className="overflow-y-auto p-3 flex flex-col gap-2 flex-1">
        {toggleItems.map((item, i) => (
          <a
            key={i}
            href={item.link}
            className="flex items-center justify-between bg-red-900/70 hover:bg-red-800
              border border-red-800/50 hover:border-red-700
              px-3 py-2.5 rounded-xl transition-all duration-150 group"
            target="_blank"
            rel="noopener noreferrer"
          >
            <span className="text-sm font-medium text-zinc-100 group-hover:text-white">{item.label}</span>
            <ExternalLink size={14} className="text-red-400 group-hover:text-red-300 flex-shrink-0" />
          </a>
        ))}
      </div>
    </div>
  );
}

export default FloatingTogglePanel;