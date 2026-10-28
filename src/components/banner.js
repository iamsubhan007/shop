import React from 'react'

function Banner() {
  return (
    <section className="relative w-full overflow-hidden bg-zinc-950">
      {/* Background Video */}
      <video
        className="w-full h-52 sm:h-72 md:h-[420px] object-cover opacity-90"
        src="bannerHBT1.mp4"
        autoPlay
        muted
        playsInline
        loop
      />
      {/* Gradient overlay + branding text */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent pointer-events-none" />
      <div className="absolute bottom-0 left-0 right-0 px-5 pb-7 md:px-10 md:pb-10 text-white">
        <p className="text-[10px] md:text-xs font-semibold tracking-widest uppercase text-red-400 mb-1">
          Lahore&apos;s Finest
        </p>
        <h1 className="text-xl sm:text-3xl md:text-5xl font-extrabold leading-tight drop-shadow-sm">
          Haq Bahu Naan Shop
        </h1>
        <p className="text-xs sm:text-sm md:text-base text-zinc-300 mt-1 font-light">
          Fresh &bull; Authentic &bull; Delicious
        </p>
      </div>
    </section>
  );
}

export default Banner;