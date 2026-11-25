'use client';

import { useEffect, useState } from 'react';
import { countdownText, trackLabels, trackStage } from '@/lib/orderProgress';

// The countdown the shop set, large and centred, with a delivery rider who moves along as the order moves on.
function Rider({ moving }) {
  return (
    <svg viewBox="0 0 64 48" width="56" height="42" aria-hidden="true">
      <g className={moving ? 'hbt-bob' : ''}>
        <rect x="4" y="14" width="17" height="15" rx="3" fill="#b91c1c" />
        <path d="M8 18h9M8 22h9" stroke="#fecaca" strokeWidth="1.6" strokeLinecap="round" />
        <path d="M16 33h22l6-10h7" stroke="#27272a" strokeWidth="4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M49 22l5 15" stroke="#27272a" strokeWidth="3" strokeLinecap="round" />
        <path d="M27 31l-2-11 10-3 4 9 8 1" stroke="#f59e0b" strokeWidth="5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="34" cy="9" r="6" fill="#b91c1c" />
        <path d="M34 8h6" stroke="#fef3c7" strokeWidth="2.4" strokeLinecap="round" />
      </g>
      {[15, 53].map((x) => (
        <g key={x} className={moving ? 'hbt-wheel' : ''} style={{ transformOrigin: `${x}px 38px` }}>
          <circle cx={x} cy="38" r="7" fill="none" stroke="#18181b" strokeWidth="3" />
          <path d={`M${x - 5} 38h10M${x} 33v10`} stroke="#71717a" strokeWidth="1.4" />
        </g>
      ))}
    </svg>
  );
}

export default function OrderProgressHero({ order }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);

  const stage = trackStage(order.status);
  const done = stage === 3;
  const left = new Date(order.etaAt).getTime() - now;
  const minutes = Math.ceil(left / 60000);
  const delivery = order.orderType === 'delivery';
  const at = (Math.max(0, stage) / 3) * 100;

  return (
    <div role="status" aria-live="off" data-testid="order-timer" className="rounded-3xl bg-white border border-amber-200 shadow-sm px-5 py-8 text-center">
      <style>{`
        @keyframes hbt-bob { 50% { transform: translateY(-2px); } }
        @keyframes hbt-spin { to { transform: rotate(360deg); } }
        .hbt-bob { animation: hbt-bob .5s ease-in-out infinite; }
        .hbt-wheel { animation: hbt-spin .7s linear infinite; }
        @media (prefers-reduced-motion: reduce) { .hbt-bob, .hbt-wheel { animation: none; } }
      `}</style>
      <div className={`mx-auto w-44 h-44 rounded-full flex flex-col items-center justify-center border-[10px] ${done ? 'border-emerald-500 bg-emerald-50' : left > 0 ? 'border-amber-400 bg-amber-50' : 'border-red-400 bg-red-50'}`}>
        {done ? (
          <span className="text-2xl font-black text-emerald-700">{delivery ? 'Delivered' : 'Picked up'} ✓</span>
        ) : left > 0 ? (
          <>
            <span className="text-4xl font-black tabular-nums text-zinc-900" data-testid="countdown">{countdownText(left)}</span>
            <span className="text-xs text-zinc-500 mt-1">{delivery ? 'until it is with you' : 'until it is ready'}</span>
          </>
        ) : (
          <span className="text-lg font-black text-red-700 px-3">Almost there</span>
        )}
      </div>
      <p className="mt-4 text-sm text-zinc-600">
        {done ? 'Enjoy your meal!'
          : stage < 0 ? 'Waiting for the shop to confirm your order.'
            : left > 0 ? `About ${minutes} min left.`
              : 'It is taking a little longer than planned. Thank you for your patience.'}
      </p>

      <div className="mt-6 px-7" aria-hidden="true">
        <div className="relative h-14">
          <div className="absolute inset-x-0 bottom-1 h-1.5 rounded-full bg-zinc-200" />
          <div className="absolute left-0 bottom-1 h-1.5 rounded-full bg-emerald-500 transition-all duration-1000" style={{ width: `${at}%` }} />
          <div className="absolute bottom-2 -translate-x-1/2 transition-all duration-1000 ease-in-out" style={{ left: `${at}%`, opacity: stage < 0 ? 0.35 : 1 }}>
            <Rider moving={stage >= 0 && !done} />
          </div>
        </div>
      </div>
      <ol className="mt-2 grid grid-cols-4 text-[11px] font-semibold" aria-label="Order stage">
        {trackLabels(order.orderType).map((label, i) => (
          <li key={label} aria-current={i === stage ? 'step' : undefined} className={i === stage ? 'text-red-700' : i < stage ? 'text-emerald-700' : 'text-zinc-400'}>{label}</li>
        ))}
      </ol>
    </div>
  );
}
