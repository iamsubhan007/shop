'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Flame,
  Lock,
  Mail,
  User,
  Phone,
  ArrowLeft,
  Loader2,
  AlertCircle,
  KeyRound,
  ShieldCheck,
  CheckCircle2,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';

export default function AuthPage() {
  const router = useRouter();
  const { signIn, signUp, user, profile, signOut, sendAdminOtp, verifyAdminOtp, isSuperAdmin, isAdmin } = useAuth();

  const [mode, setMode] = useState('login'); // 'login' | 'register'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // 2FA OTP verification step states (Super Admin & Admins only)
  const [showOtpStep, setShowOtpStep] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [otpLoading, setOtpLoading] = useState(false);
  const [otpSentMsg, setOtpSentMsg] = useState('');
  const [adminTargetEmail, setAdminTargetEmail] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    setLoading(true);

    try {
      if (mode === 'login') {
        const cleanEmail = email.toLowerCase().trim();
        const isTargetAdmin =
          cleanEmail === 'bsubhan542@gmail.com' || cleanEmail.includes('admin');

        // First verify credentials against database
        const { data, error } = await signIn(cleanEmail, password);
        if (error) throw error;

        // Check if logged in user is Super Admin or Admin
        const userRole = data?.user?.user_metadata?.role || '';
        const requiresOtp = isTargetAdmin || userRole === 'super_admin' || userRole === 'admin';

        if (requiresOtp) {
          // Trigger OTP generation and email dispatch
          setAdminTargetEmail(cleanEmail);
          const otpRes = await sendAdminOtp(cleanEmail, password);
          if (!otpRes.success) {
            throw new Error(otpRes.error || 'Failed to dispatch verification code');
          }
          setOtpSentMsg(
            `A 6-digit verification code has been sent to ${cleanEmail}.`
          );
          setShowOtpStep(true);
          return;
        }

        // Regular customer: redirect to homepage
        router.push('/');
      } else {
        // Customer registration: always registered as customer (user) only
        const { error } = await signUp(email, password, fullName, phone);
        if (error) throw error;
        router.push('/');
      }
    } catch (err) {
      console.error('Auth error:', err);
      setErrorMsg(err.message || 'Authentication failed. Please check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    setOtpLoading(true);

    try {
      if (!otpCode || otpCode.trim().length !== 6) {
        throw new Error('Please enter the complete 6-digit verification code.');
      }

      const res = await verifyAdminOtp(adminTargetEmail || email, otpCode);
      if (!res.success) {
        throw new Error(res.error || 'Invalid code');
      }

      // Successfully verified Super Admin: redirect to Admin Dashboard
      router.push('/admin');
    } catch (err) {
      console.error('OTP error:', err);
      setErrorMsg(err.message || 'Invalid verification code');
    } finally {
      setOtpLoading(false);
    }
  };

  const handleResendOtp = async () => {
    setErrorMsg('');
    setOtpLoading(true);
    try {
      const res = await sendAdminOtp(adminTargetEmail || email);
      if (!res.success) throw new Error(res.error || 'Failed to resend code');
      setOtpSentMsg('A new verification code has been sent to your email.');
    } catch (err) {
      setErrorMsg(err.message || 'Failed to resend code');
    } finally {
      setOtpLoading(false);
    }
  };

  // If already logged in
  if (user && !showOtpStep) {
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center p-6 text-center">
        <div className="w-16 h-16 rounded-full bg-red-100 text-red-700 flex items-center justify-center mb-4">
          <User size={30} />
        </div>
        <h1 className="text-xl font-bold text-zinc-900">Signed in as {user.email}</h1>
        <p className="text-xs text-zinc-500 mt-1">
          {isSuperAdmin
            ? 'Super Admin Account with Full Administrative Control'
            : isAdmin
            ? 'Admin Account'
            : 'Customer Account'}
        </p>

        <div className="flex gap-3 mt-6">
          {(isSuperAdmin || isAdmin) && (
            <Link
              href="/admin"
              className="px-5 py-2.5 bg-red-700 text-white rounded-xl text-xs font-bold shadow-xs hover:bg-red-600 transition-colors"
            >
              Admin Dashboard
            </Link>
          )}
          <Link
            href="/orders"
            className="px-5 py-2.5 bg-zinc-900 text-white rounded-xl text-xs font-bold shadow-xs hover:bg-zinc-800 transition-colors"
          >
            My Orders
          </Link>
          <button
            onClick={signOut}
            className="px-5 py-2.5 bg-zinc-200 text-zinc-800 rounded-xl text-xs font-bold hover:bg-zinc-300 transition-colors"
          >
            Sign Out
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md px-4">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-800 transition-colors mb-4"
        >
          <ArrowLeft size={14} /> Back to Store
        </Link>

        <div className="flex justify-center mb-2">
          <div className="w-12 h-12 rounded-2xl bg-red-600 flex items-center justify-center text-white shadow-lg">
            <Flame size={28} className="fill-white" />
          </div>
        </div>

        <h2 className="text-center text-2xl font-black text-zinc-900 tracking-tight">
          {showOtpStep
            ? 'Admin Two-Factor Verification'
            : mode === 'login'
            ? 'Sign in to Your Account'
            : 'Create Customer Account'}
        </h2>
        <p className="mt-1 text-center text-xs text-zinc-500">
          Haq Bahu Naan Shop &bull; Authentic Clay Tandoor
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md px-4">
        <div className="bg-white py-8 px-6 shadow-xl border border-zinc-200/80 rounded-3xl sm:px-10">
          {/* OTP Verification Form */}
          {showOtpStep ? (
            <form onSubmit={handleVerifyOtp} className="space-y-4">
              <div className="w-14 h-14 rounded-2xl bg-red-50 text-red-600 flex items-center justify-center mx-auto mb-2 border border-red-200">
                <ShieldCheck size={28} />
              </div>

              <div className="text-center space-y-1">
                <h3 className="font-bold text-sm text-zinc-900">Enter Security Code</h3>
                <p className="text-xs text-zinc-500 leading-relaxed">
                  {otpSentMsg || `A 6-digit OTP code was sent to ${adminTargetEmail}`}
                </p>
              </div>

              {errorMsg && (
                <div className="p-3 rounded-xl bg-red-50 border border-red-200 flex items-start gap-2 text-xs text-red-700">
                  <AlertCircle size={16} className="shrink-0 mt-0.5" />
                  <span>{errorMsg}</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-zinc-700 mb-1 text-center">
                  6-Digit Verification Code
                </label>
                <div className="relative">
                  <input
                    type="text"
                    required
                    maxLength={6}
                    autoFocus
                    value={otpCode}
                    onChange={(e) => setOtpCode(e.target.value.replace(/[^0-9]/g, ''))}
                    placeholder="123456"
                    className="w-full text-center text-2xl tracking-[0.5em] font-mono font-black py-3 border border-zinc-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-600 focus:border-red-600"
                  />
                </div>
                <p className="text-[11px] text-zinc-400 text-center mt-1.5">
                  Code expires in 10 minutes or immediately when you log out.
                </p>
              </div>

              <button
                type="submit"
                disabled={otpLoading || otpCode.length !== 6}
                className="w-full bg-red-700 hover:bg-red-600 text-white font-bold py-3 rounded-xl text-xs shadow-md transition-all flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {otpLoading ? (
                  <>
                    <Loader2 size={16} className="animate-spin" /> Verifying Code...
                  </>
                ) : (
                  <>
                    <CheckCircle2 size={16} /> Verify & Access Admin
                  </>
                )}
              </button>

              <div className="flex items-center justify-between pt-2 border-t border-zinc-100 text-xs">
                <button
                  type="button"
                  onClick={handleResendOtp}
                  disabled={otpLoading}
                  className="text-red-700 hover:text-red-800 font-semibold transition-colors disabled:opacity-50"
                >
                  Resend Code
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowOtpStep(false);
                    setOtpCode('');
                    setErrorMsg('');
                  }}
                  className="text-zinc-500 hover:text-zinc-700 transition-colors"
                >
                  Back to Sign In
                </button>
              </div>
            </form>
          ) : (
            <>
              {/* Login / Register Tab Switcher */}
              <div className="flex bg-zinc-100 p-1 rounded-xl mb-6">
                <button
                  type="button"
                  onClick={() => {
                    setMode('login');
                    setErrorMsg('');
                  }}
                  className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${
                    mode === 'login' ? 'bg-white text-zinc-900 shadow-xs' : 'text-zinc-500 hover:text-zinc-900'
                  }`}
                >
                  Sign In
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMode('register');
                    setErrorMsg('');
                  }}
                  className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${
                    mode === 'register' ? 'bg-white text-zinc-900 shadow-xs' : 'text-zinc-500 hover:text-zinc-900'
                  }`}
                >
                  Create Account (User)
                </button>
              </div>

              {errorMsg && (
                <div className="mb-4 p-3 rounded-xl bg-red-50 border border-red-200 flex items-start gap-2 text-xs text-red-700">
                  <AlertCircle size={16} className="shrink-0 mt-0.5" />
                  <span>{errorMsg}</span>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                {mode === 'register' && (
                  <>
                    <div>
                      <label className="block text-xs font-semibold text-zinc-700 mb-1">
                        Full Name <span className="text-red-600">*</span>
                      </label>
                      <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-zinc-400">
                          <User size={16} />
                        </div>
                        <input
                          type="text"
                          required
                          value={fullName}
                          onChange={(e) => setFullName(e.target.value)}
                          placeholder="e.g. Ali Ahmed"
                          className="w-full text-xs pl-10 pr-3 py-2.5 border border-zinc-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-600 focus:border-red-600"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-zinc-700 mb-1">
                        Phone Number <span className="text-red-600">*</span>
                      </label>
                      <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-zinc-400">
                          <Phone size={16} />
                        </div>
                        <input
                          type="tel"
                          required
                          value={phone}
                          onChange={(e) => setPhone(e.target.value)}
                          placeholder="0300 1234567"
                          className="w-full text-xs pl-10 pr-3 py-2.5 border border-zinc-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-600 focus:border-red-600"
                        />
                      </div>
                    </div>
                  </>
                )}

                <div>
                  <label className="block text-xs font-semibold text-zinc-700 mb-1">
                    Email Address <span className="text-red-600">*</span>
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-zinc-400">
                      <Mail size={16} />
                    </div>
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="yourname@gmail.com"
                      className="w-full text-xs pl-10 pr-3 py-2.5 border border-zinc-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-600 focus:border-red-600"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-700 mb-1">
                    Password <span className="text-red-600">*</span>
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-zinc-400">
                      <Lock size={16} />
                    </div>
                    <input
                      type="password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full text-xs pl-10 pr-3 py-2.5 border border-zinc-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-600 focus:border-red-600"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-red-700 hover:bg-red-600 text-white font-bold py-2.5 rounded-xl text-xs shadow-md transition-all flex items-center justify-center gap-2 disabled:opacity-50 mt-2"
                >
                  {loading ? (
                    <>
                      <Loader2 size={16} className="animate-spin" /> Processing...
                    </>
                  ) : mode === 'login' ? (
                    'Sign In'
                  ) : (
                    'Create Account'
                  )}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
