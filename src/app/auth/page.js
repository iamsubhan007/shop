'use client';

import React, { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Mail, ShieldCheck, Loader2, ArrowLeft, Phone, User as UserIcon } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';

function AuthFlow() {
  const router = useRouter();
  const next = useSearchParams().get('next') || '/';
  const { user, loading, profileComplete, requestOtp, verifyOtp, updateProfile } = useAuth();

  const [step, setStep] = useState('email'); // email | code | profile
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [cooldown, setCooldown] = useState(0);

  // Already signed in
  useEffect(() => {
    if (loading || !user) return;
    if (profileComplete) router.replace(next);
    else {
      setName(user.fullName || '');
      setPhone(user.phone || '');
      setStep('profile');
    }
  }, [loading, user, profileComplete, router, next]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const sendCode = async (e) => {
    e?.preventDefault();
    setBusy(true);
    setError('');
    const r = await requestOtp(email.trim());
    setBusy(false);
    if (r.ok) {
      setCooldown(r.cooldownS || 60);
      setStep('code');
    } else {
      if (r.retryAfterS) setCooldown(r.retryAfterS);
      setError(r.error || (r.status >= 500 ? 'The server had a problem. Please try again in a few minutes.' : 'Could not send the code.'));
      if (r.retryAfterS && step === 'email') setStep('code');
    }
  };

  const submitCode = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    const r = await verifyOtp(email.trim(), code.trim());
    setBusy(false);
    if (!r.ok) return setError(r.error || 'Verification failed.');
    if (r.needsProfile) {
      setName(r.user.fullName || '');
      setPhone(r.user.phone || '');
      setStep('profile');
    } else router.replace(next);
  };

  const saveProfile = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    const r = await updateProfile(name, phone);
    setBusy(false);
    if (!r.ok) return setError(r.error || 'Could not save your details.');
    router.replace(next);
  };

  const input = 'w-full rounded-xl border border-zinc-300 bg-white px-3.5 py-3 text-sm text-zinc-900 outline-none focus:border-red-600 focus:ring-2 focus:ring-red-600/20';
  const btn = 'w-full flex items-center justify-center gap-2 rounded-xl bg-red-700 hover:bg-red-600 disabled:opacity-60 text-white font-bold py-3 text-sm transition-colors';

  return (
    <div className="min-h-[80vh] flex items-center justify-center px-4 py-12 bg-zinc-100">
      <div className="w-full max-w-md bg-white rounded-3xl border border-zinc-200 shadow-xl p-6 sm:p-8">
        <div className="text-center mb-6">
          <div className="mx-auto w-12 h-12 rounded-2xl bg-red-700 text-white flex items-center justify-center mb-3">
            <ShieldCheck size={22} />
          </div>
          <h1 className="text-xl font-black text-zinc-900">
            {step === 'profile' ? 'Almost there' : 'Sign in to order'}
          </h1>
          <p className="text-xs text-zinc-500 mt-1">
            {step === 'email' && 'No password needed. We email you a one-time code.'}
            {step === 'code' && `We sent a 6-digit code to ${email}`}
            {step === 'profile' && 'Tell us who to contact about your order.'}
          </p>
        </div>

        {error && (
          <div role="alert" className="mb-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs px-3.5 py-2.5">
            {error}
          </div>
        )}

        {step === 'email' && (
          <form onSubmit={sendCode} className="space-y-4">
            <label className="block text-xs font-semibold text-zinc-700">
              Email address
              <div className="relative mt-1.5">
                <Mail size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400" />
                <input type="email" required autoComplete="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@gmail.com" className={`${input} pl-10`} />
              </div>
            </label>
            <button type="submit" disabled={busy} className={btn}>
              {busy ? <Loader2 size={16} className="animate-spin" /> : 'Send code'}
            </button>
          </form>
        )}

        {step === 'code' && (
          <form onSubmit={submitCode} className="space-y-4">
            <input
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              required
              autoFocus
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              placeholder="••••••"
              aria-label="6-digit code"
              className={`${input} text-center text-2xl tracking-[0.5em] font-bold`}
            />
            <p className="text-xs text-zinc-600 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
              Haven&apos;t received your code yet? Please check your Spam/Junk folder as well.
            </p>
            <button type="submit" disabled={busy || code.length !== 6} className={btn}>
              {busy ? <Loader2 size={16} className="animate-spin" /> : 'Verify & continue'}
            </button>
            <div className="flex items-center justify-between text-xs">
              <button type="button" onClick={() => { setStep('email'); setCode(''); setError(''); }} className="flex items-center gap-1 text-zinc-500 hover:text-zinc-800">
                <ArrowLeft size={13} /> Change email
              </button>
              <button type="button" disabled={cooldown > 0 || busy} onClick={sendCode} className="font-semibold text-red-700 disabled:text-zinc-400">
                {cooldown > 0 ? `Resend code in ${cooldown}s` : 'Resend code'}
              </button>
            </div>
          </form>
        )}

        {step === 'profile' && (
          <form onSubmit={saveProfile} className="space-y-4">
            <label className="block text-xs font-semibold text-zinc-700">
              Full name
              <div className="relative mt-1.5">
                <UserIcon size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400" />
                <input required minLength={2} autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} className={`${input} pl-10`} />
              </div>
            </label>
            <label className="block text-xs font-semibold text-zinc-700">
              Mobile number
              <div className="relative mt-1.5">
                <Phone size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400" />
                <input required type="tel" inputMode="tel" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="03XX XXXXXXX" className={`${input} pl-10`} />
              </div>
            </label>
            <button type="submit" disabled={busy} className={btn}>
              {busy ? <Loader2 size={16} className="animate-spin" /> : 'Save & continue'}
            </button>
          </form>
        )}

        <p className="text-center text-[11px] text-zinc-400 mt-6">
          <Link href="/" className="hover:text-zinc-600">Back to menu</Link>
        </p>
      </div>
    </div>
  );
}

export default function AuthPage() {
  return (
    <Suspense fallback={null}>
      <AuthFlow />
    </Suspense>
  );
}
