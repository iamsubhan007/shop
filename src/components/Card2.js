"use client"
import React from 'react';
import { Info } from 'lucide-react';

function Card({ pic, title, id, description, genre, isActive, onClick }) {
  return (
    <div
      className={`group bg-white rounded-xl overflow-hidden border cursor-pointer transition-all duration-300
        ${isActive
          ? 'ring-2 ring-red-600 shadow-xl scale-[1.02] border-red-200 z-10'
          : 'border-zinc-100 shadow-sm hover:shadow-md hover:-translate-y-0.5 hover:border-zinc-200'
        }`}
      onClick={onClick}
    >
      {/* Image with genre badge */}
      <div className="relative overflow-hidden">
        <img
          src={pic}
          alt={title}
          className="w-full h-40 sm:h-44 object-cover group-hover:scale-105 transition-transform duration-300"
        />
        {genre && (
          <span className="absolute top-2 left-2 bg-black/55 text-white text-[10px] font-medium px-2 py-0.5 rounded-full backdrop-blur-sm">
            {genre}
          </span>
        )}
        {isActive && (
          <div className="absolute inset-0 bg-red-900/10 flex items-center justify-center">
            <span className="bg-red-700 text-white text-xs font-semibold px-3 py-1 rounded-full shadow">
              Selected
            </span>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="p-3 flex flex-col gap-1">
        <h3 className="font-bold text-sm text-zinc-900 leading-snug">{title}</h3>
        {description && (
          <p className="text-[11px] text-zinc-500 line-clamp-2 leading-snug flex items-start gap-1">
            <span className="flex-1">{description}</span>
            <Info size={12} className="text-zinc-400 mt-0.5 flex-shrink-0" />
          </p>
        )}
      </div>
    </div>
  );
}

export default Card;
