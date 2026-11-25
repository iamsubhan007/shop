'use client';

import { useEffect, useState } from 'react';

// Shown instead of the bare "Application error" page. It tries again by itself, waiting a little longer each time.
// Styles are inline so it also works when the page's own styles could not load.
const WAITS_S = [3, 6, 12, 20, 30];
let attempts = 0;
let lastAt = 0;

export default function ConnectionError({ error, retry, note }) {
  const [left, setLeft] = useState(() => {
    if (Date.now() - lastAt > 120000) attempts = 0;
    return WAITS_S[Math.min(attempts, WAITS_S.length - 1)];
  });

  useEffect(() => { console.error(error); }, [error]);

  useEffect(() => {
    if (left > 0) {
      const t = setTimeout(() => setLeft((s) => s - 1), 1000);
      return () => clearTimeout(t);
    }
    attempts += 1;
    lastAt = Date.now();
    retry();
    // If the retry fails in the same way, this screen stays and counts down again.
    const again = setTimeout(() => setLeft(WAITS_S[Math.min(attempts, WAITS_S.length - 1)]), 1500);
    return () => clearTimeout(again);
  }, [left, retry]);

  return (
    <div role="alert" style={{ position: 'fixed', inset: 0, zIndex: 70, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, background: '#faf8f5', color: '#18181b', fontFamily: 'system-ui, sans-serif', textAlign: 'center' }}>
      <div style={{ maxWidth: 340 }}>
        <div style={{ fontSize: 20, fontWeight: 800, marginBottom: 8 }}>Connection problem</div>
        <p style={{ fontSize: 14, color: '#52525b', margin: '0 0 6px' }}>We could not reach the server just now. {note}</p>
        <p style={{ fontSize: 13, color: '#71717a', margin: '0 0 18px' }}>{left > 0 ? `Trying again in ${left}s…` : 'Trying again…'}</p>
        <button onClick={() => setLeft(0)} style={{ border: 0, borderRadius: 12, padding: '12px 22px', background: '#b91c1c', color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>Try now</button>
        {error?.digest && <p style={{ fontSize: 11, color: '#a1a1aa', marginTop: 16 }}>Reference: {error.digest}</p>}
      </div>
    </div>
  );
}
