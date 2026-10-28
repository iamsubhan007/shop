"use client"
import React from 'react'

function Card({ pic, title, address, id, description, genre, price }) {
  return (
    <div className="group bg-white rounded-xl overflow-hidden shadow-sm hover:shadow-md border border-zinc-100 transition-all duration-300 hover:-translate-y-0.5 min-w-[155px] max-w-[200px] flex-shrink-0">
      {/* Image */}
      <div className="relative overflow-hidden">
        <img
          src={pic}
          alt={title}
          className="w-full h-32 object-cover group-hover:scale-105 transition-transform duration-300"
        />
        {price && (
          <span className="absolute top-2 right-2 bg-red-700 text-white text-[11px] font-bold px-2 py-0.5 rounded-full shadow-sm">
            Rs.{price}
          </span>
        )}
      </div>

      {/* Content */}
      <div className="p-3 flex flex-col gap-1.5">
        <h3 className="font-semibold text-sm text-zinc-900 leading-snug line-clamp-2">
          {title}
        </h3>
        {genre && (
          <span className="text-[10px] text-zinc-500 bg-zinc-100 border border-zinc-200 px-2 py-0.5 rounded-full w-fit">
            {genre}
          </span>
        )}
        {description && (
          <p className="text-[11px] text-zinc-400 line-clamp-2 leading-snug">
            {description}
          </p>
        )}
      </div>
    </div>
  );
}

export default Card;