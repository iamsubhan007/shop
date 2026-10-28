'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase, isSupabaseConfigured } from '@/lib/supabase/client';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isOtpVerified, setIsOtpVerified] = useState(false);

  // Load OTP verification from sessionStorage (cleared when browser session ends)
  useEffect(() => {
    try {
      const verified = sessionStorage.getItem('hbt_admin_otp_verified');
      if (verified === 'true') {
        setIsOtpVerified(true);
      }
    } catch {
      // ignore
    }
  }, []);

  // Listen to Supabase Auth state
  useEffect(() => {
    if (!isSupabaseConfigured()) {
      setLoading(false);
      return;
    }

    const checkSession = async () => {
      try {
        const { data: { session }, error } = await supabase.auth.getSession();
        if (error) throw error;

        if (session?.user) {
          setUser(session.user);
          await fetchProfile(session.user.id, session.user);
        } else {
          setUser(null);
          setProfile(null);
          setIsOtpVerified(false);
          sessionStorage.removeItem('hbt_admin_otp_verified');
        }
      } catch (err) {
        console.error('Error fetching auth session:', err);
      } finally {
        setLoading(false);
      }
    };

    checkSession();

    const { data: authListener } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (session?.user) {
          setUser(session.user);
          await fetchProfile(session.user.id, session.user);
        } else {
          setUser(null);
          setProfile(null);
          setIsOtpVerified(false);
          sessionStorage.removeItem('hbt_admin_otp_verified');
        }
        setLoading(false);
      }
    );

    return () => {
      authListener?.subscription?.unsubscribe();
    };
  }, []);

  const fetchProfile = async (userId, userObj = null) => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (!error && data) {
        setProfile(data);
        return data;
      }
    } catch (err) {
      console.warn('Could not load profile from table:', err);
    }

    // Fallback: derive profile from user metadata
    const u = userObj || user;
    if (u) {
      const isSuper =
        u.email?.toLowerCase().trim() === 'bsubhan542@gmail.com' ||
        u.user_metadata?.role === 'super_admin';
      const derived = {
        id: userId,
        email: u.email,
        full_name: u.user_metadata?.full_name || (isSuper ? 'Subhan Butt' : u.email?.split('@')[0]),
        phone: u.user_metadata?.phone || '',
        role: isSuper ? 'super_admin' : (u.user_metadata?.role || 'customer'),
      };
      setProfile(derived);
      return derived;
    }
  };

  const signIn = async (email, password) => {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (error) {
        return { data: null, error };
      }

      if (data?.user) {
        setUser(data.user);
        await fetchProfile(data.user.id, data.user);
      }
      return { data, error: null };
    } catch (error) {
      console.error('Sign in exception:', error);
      return { data: null, error };
    }
  };

  const signUp = async (email, password, fullName, phone) => {
    try {
      // 1. Call server API: All new sign ups are strictly customer (user) only
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim(),
          password,
          fullName: fullName?.trim(),
          phone: phone?.trim(),
        }),
      });

      const resData = await res.json();
      if (!res.ok) {
        throw new Error(resData.error || 'Registration failed');
      }

      // 2. Immediately sign in as user
      return await signIn(email, password);
    } catch (error) {
      console.error('Sign up error:', error);
      return { data: null, error };
    }
  };

  const signOut = async () => {
    try {
      const userEmail = user?.email;
      if (userEmail) {
        // Expire server OTP record immediately on logout
        await fetch('/api/auth/logout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: userEmail }),
        }).catch(() => {});
      }

      if (isSupabaseConfigured()) {
        await supabase.auth.signOut();
      }
    } catch (e) {
      console.warn('Sign out error:', e);
    } finally {
      setUser(null);
      setProfile(null);
      setIsOtpVerified(false);
      try {
        sessionStorage.removeItem('hbt_admin_otp_verified');
        sessionStorage.removeItem('hbt_admin_session_token');
      } catch {}
    }
  };

  // Send Super Admin OTP
  const sendAdminOtp = async (email, password = null) => {
    try {
      const res = await fetch('/api/auth/send-admin-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to send verification code');
      return { success: true, data };
    } catch (err) {
      return { success: false, error: err.message };
    }
  };

  // Verify Super Admin OTP
  const verifyAdminOtp = async (email, otp) => {
    try {
      const res = await fetch('/api/auth/verify-admin-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, otp }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Invalid verification code');

      setIsOtpVerified(true);
      try {
        sessionStorage.setItem('hbt_admin_otp_verified', 'true');
        if (data.sessionToken) {
          sessionStorage.setItem('hbt_admin_session_token', data.sessionToken);
        }
      } catch {}

      return { success: true, data };
    } catch (err) {
      return { success: false, error: err.message };
    }
  };

  // Change Super Admin password
  const changePassword = async (newPassword) => {
    try {
      if (!user?.email) throw new Error('Not authenticated');
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: user.email, newPassword }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to change password');
      return { success: true, message: data.message };
    } catch (err) {
      return { success: false, error: err.message };
    }
  };

  const isSuperAdmin =
    user?.email?.toLowerCase().trim() === 'bsubhan542@gmail.com' ||
    profile?.role === 'super_admin' ||
    user?.user_metadata?.role === 'super_admin';

  const isAdmin = isSuperAdmin || profile?.role === 'admin' || user?.user_metadata?.role === 'admin';

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        isAdmin,
        isSuperAdmin,
        isOtpVerified,
        setIsOtpVerified,
        loading,
        signIn,
        signUp,
        signOut,
        sendAdminOtp,
        verifyAdminOtp,
        changePassword,
        refreshProfile: () => user && fetchProfile(user.id, user),
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
