'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, Download, Loader2 } from 'lucide-react';

const LABEL = 'Download Menu (PDF)';

const fileName = (header) => /filename="([^"]+)"/.exec(header || '')?.[1] || 'Menu.pdf';

/** Downloads the menu PDF the shop has published (their own file, or one made from the live menu). */
export default function MenuPdfButton({ className = '', messageClassName = 'text-zinc-400' }) {
  const [state, setState] = useState('idle'); // idle | loading | done | error
  const [error, setError] = useState('');
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);

  const download = async () => {
    if (state === 'loading') return;
    clearTimeout(timer.current);
    setState('loading'); setError('');
    try {
      const res = await fetch('/api/menu/pdf', { cache: 'no-store' });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'The menu could not be downloaded.');
      const blob = await res.blob();
      if (blob.type && !blob.type.includes('pdf') && blob.type !== 'application/octet-stream') throw new Error('The menu could not be downloaded.');
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName(res.headers.get('content-disposition'));
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      setState('done');
      timer.current = setTimeout(() => setState('idle'), 4000);
    } catch (e) {
      setError(e instanceof TypeError ? 'Check your connection and try again.' : e.message);
      setState('error');
    }
  };

  return (
    <span className="inline-flex flex-col items-start gap-1">
      <button type="button" onClick={download} disabled={state === 'loading'} aria-busy={state === 'loading'} className={className}>
        {state === 'loading' ? <Loader2 size={14} className="animate-spin" /> : state === 'done' ? <Check size={14} /> : <Download size={14} />}
        <span>{state === 'loading' ? 'Preparing menu…' : state === 'done' ? 'Menu downloaded' : LABEL}</span>
      </button>
      <span role="status" className={`text-[11px] ${messageClassName}`}>{state === 'done' ? 'Check your downloads folder.' : ''}</span>
      {state === 'error' && <span role="alert" className="text-[11px] text-red-500">{error}</span>}
    </span>
  );
}
