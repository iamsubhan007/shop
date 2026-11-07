'use client';

import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';

const AuthContext = createContext(null);

async function post(url, body, method = 'POST') {
  const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const json = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, ...json };
}

// Customer auth: passwordless email OTP. Sessions are httpOnly cookies managed by the server.
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/me', { cache: 'no-store' });
      const json = await res.json();
      setUser(json.user || null);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const requestOtp = (email) => post('/api/auth/otp/request', { email });
  const verifyOtp = async (email, code) => {
    const r = await post('/api/auth/otp/verify', { email, code });
    if (r.ok) setUser(r.user);
    return r;
  };
  const updateProfile = async (fullName, phone) => {
    const r = await post('/api/auth/me', { fullName, phone }, 'PATCH');
    if (r.ok) setUser(r.user);
    return r;
  };
  const signOut = async () => {
    await post('/api/auth/logout', { scope: 'customer' });
    setUser(null);
  };

  const profileComplete = !!(user?.fullName && user?.phone);

  return (
    <AuthContext.Provider value={{ user, loading, profileComplete, requestOtp, verifyOtp, updateProfile, signOut, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
