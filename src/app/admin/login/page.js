'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Lock } from 'lucide-react';

export default function AdminLogin() {
  const router = useRouter();
  const [step, setStep] = useState('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const post = async (url, body) => {
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    return { ok: res.ok, ...(await res.json().catch(() => ({}))) };
  };

  const send = async (e) => {
    e?.preventDefault();
    setBusy(true); setError('');
    const r = await post('/api/auth/staff/otp/request', { email });
    setBusy(false);
    if (!r.ok) { if (r.retryAfterS) { setCooldown(r.retryAfterS); setStep('code'); } return setError(r.error || 'Could not send the code.'); }
    setCooldown(r.cooldownS || 60);
    setStep('code');
  };

  const verify = async (e) => {
    e.preventDefault();
    setBusy(true); setError('');
    const r = await post('/api/auth/staff/otp/verify', { email, code });
    setBusy(false);
    if (!r.ok) return setError(r.error || 'Sign in failed.');
    router.replace(r.user.role === 'kitchen' ? '/admin/kitchen' : '/admin');
    router.refresh();
  };

  const input = 'w-full rounded-xl border border-zinc-300 px-3.5 py-3 text-sm outline-none focus:border-red-600 focus:ring-2 focus:ring-red-600/20';
  return (
    <div className="fixed inset-0 z-[60] bg-zinc-950 flex items-center justify-center p-4">
      <form onSubmit={step === 'email' ? send : verify} className="w-full max-w-sm bg-white rounded-3xl p-7 space-y-4">
        <div className="text-center">
          <div className="mx-auto w-12 h-12 rounded-2xl bg-red-700 text-white flex items-center justify-center mb-3"><Lock size={20} /></div>
          <h1 className="text-lg font-black">HBT Staff Sign in</h1>
          <p className="text-xs text-zinc-500 mt-1">{step === 'email' ? 'We email a one-time code to your staff address.' : `Code sent to ${email} (if it is a staff account).`}</p>
        </div>
        {error && <div role="alert" className="text-xs rounded-xl bg-red-50 border border-red-200 text-red-700 px-3 py-2.5">{error}</div>}
        {step === 'email' ? (
          <input type="email" required autoComplete="username" placeholder="Staff email" value={email} onChange={(e) => setEmail(e.target.value)} className={input} />
        ) : (
          <>
            <input inputMode="numeric" autoComplete="one-time-code" maxLength={6} required autoFocus value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} aria-label="6-digit code" placeholder="••••••" className={`${input} text-center text-2xl tracking-[0.5em] font-bold`} />
            <p className="text-xs text-zinc-600 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">Haven&apos;t received your code yet? Please check your Spam/Junk folder as well.</p>
          </>
        )}
        <button disabled={busy || (step === 'code' && code.length !== 6)} className="w-full flex justify-center bg-red-700 hover:bg-red-600 disabled:opacity-60 text-white font-bold py-3 rounded-xl text-sm">
          {busy ? <Loader2 className="animate-spin" size={18} /> : step === 'email' ? 'Send code' : 'Verify & sign in'}
        </button>
        {step === 'code' && (
          <div className="flex justify-between text-xs">
            <button type="button" onClick={() => { setStep('email'); setCode(''); setError(''); }} className="text-zinc-500">Change email</button>
            <button type="button" disabled={cooldown > 0 || busy} onClick={send} className="font-semibold text-red-700 disabled:text-zinc-400">{cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend code'}</button>
          </div>
        )}
      </form>
    </div>
  );
}
