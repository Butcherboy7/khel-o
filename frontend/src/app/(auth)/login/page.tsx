'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';
import api from '@/lib/api';
import { Eye, EyeOff, Lock, Mail, Gamepad2 } from 'lucide-react';

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: { client_id: string; callback: (res: { credential: string }) => void }) => void;
          renderButton: (parent: HTMLElement, options: { theme: string; size: string; width: string }) => void;
          prompt: () => void;
        };
      };
    };
  }
}

export default function LoginPage() {
  const router = useRouter();
  const setAuth = useAuthStore((state) => state.setAuth);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Load Google GIS script dynamically
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => {
      const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || '';
      if (window.google && clientId) {
        window.google.accounts.id.initialize({
          client_id: clientId,
          callback: handleGoogleResponse,
        });

        const buttonParent = document.getElementById('googleBtnContainer');
        if (buttonParent) {
          window.google.accounts.id.renderButton(buttonParent, {
            theme: 'filled_black',
            size: 'large',
            width: '100%',
          });
        }
      }
    };
    document.body.appendChild(script);

    return () => {
      if (script.parentNode) {
        script.parentNode.removeChild(script);
      }
    };
  }, []);

  const handleGoogleResponse = async (response: { credential: string }) => {
    try {
      setLoading(true);
      setError(null);
      const res = await api.post('/api/v1/auth/google', {
        idToken: response.credential,
      });

      const { user, accessToken, refreshToken } = res.data.data;
      setAuth(user, accessToken, refreshToken);
      router.push('/');
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'response' in err) {
        const axiosErr = err as { response?: { data?: { error?: { message?: string } } } };
        setError(axiosErr.response?.data?.error?.message || 'Google sign-in failed.');
      } else {
        setError('Google sign-in failed.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setError('Please fill in all fields.');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const res = await api.post('/api/v1/auth/login', {
        email,
        password,
      });

      const { user, accessToken, refreshToken } = res.data.data;
      setAuth(user, accessToken, refreshToken);
      router.push('/');
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'response' in err) {
        const axiosErr = err as { response?: { data?: { error?: { message?: string } } } };
        setError(axiosErr.response?.data?.error?.message || 'Invalid email or password.');
      } else {
        setError('An unexpected error occurred. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-zinc-950 flex flex-col justify-center items-center px-4 py-8">
      <div className="w-full max-w-md space-y-6 bg-zinc-900/60 backdrop-blur-md p-6 sm:p-8 rounded-2xl border border-zinc-800/80 shadow-2xl">
        {/* Brand Header */}
        <div className="text-center space-y-2">
          <Link href="/" className="inline-flex items-center gap-2 text-purple-500 font-extrabold text-2xl tracking-wide">
            <Gamepad2 className="w-8 h-8" />
            <span>KHEL-O</span>
          </Link>
          <h1 className="text-xl font-bold text-white tracking-tight">Welcome back</h1>
          <p className="text-xs text-zinc-400">Login to access your gaming bookings & offers</p>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="p-3 bg-red-950/60 border border-red-800/80 text-red-300 text-xs rounded-lg text-center font-medium">
            {error}
          </div>
        )}

        {/* Google Sign In Container */}
        <div className="space-y-2">
          <div id="googleBtnContainer" className="w-full min-h-[44px] flex justify-center"></div>
          {/* Fallback Google Button when GIS client_id is not yet configured */}
          <button
            type="button"
            onClick={() => setError('Google Client ID is not configured yet in environment.')}
            className="w-full h-12 bg-zinc-800 hover:bg-zinc-700/80 border border-zinc-700 text-white font-medium text-sm rounded-xl transition flex items-center justify-center gap-3"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path
                fill="#EA4335"
                d="M12 5c1.6 0 3 .6 4.1 1.6l3.1-3.1C17.3 1.7 14.8 1 12 1 7.5 1 3.7 3.6 1.9 7.3l3.7 2.9C6.5 7.3 9 5 12 5z"
              />
              <path
                fill="#4285F4"
                d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5c-.3 1.5-1.1 2.8-2.4 3.7l3.7 2.9c2.2-2 3.7-5 3.7-8.8z"
              />
              <path
                fill="#FBBC05"
                d="M5.6 14.8c-.2-.7-.4-1.5-.4-2.3s.2-1.6.4-2.3L1.9 7.3C.7 9.7 0 12.3 0 15s.7 5.3 1.9 7.7l3.7-2.9c-.4-.7-.6-1.5-.6-2.3z"
              />
              <path
                fill="#34A853"
                d="M12 23c3.2 0 6-1.1 8-3l-3.7-2.9c-1.1.7-2.5 1.2-4.3 1.2-3 0-5.5-2.3-6.4-5.2L1.9 16C3.7 19.7 7.5 23 12 23z"
              />
            </svg>
            Continue with Google
          </button>
        </div>

        {/* Divider */}
        <div className="relative flex items-center justify-center my-4">
          <div className="border-t border-zinc-800 w-full"></div>
          <span className="bg-zinc-900/90 px-3 text-[11px] uppercase tracking-wider text-zinc-500 font-semibold absolute">
            or continue with email
          </span>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-zinc-300">Email Address</label>
            <div className="relative">
              <Mail className="w-4 h-4 text-zinc-500 absolute left-3.5 top-3.5" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="gamer@example.com"
                className="w-full h-12 bg-zinc-950 border border-zinc-800 focus:border-purple-500 text-sm text-white rounded-xl pl-10 pr-4 outline-none transition"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-zinc-300">Password</label>
            <div className="relative">
              <Lock className="w-4 h-4 text-zinc-500 absolute left-3.5 top-3.5" />
              <input
                type={showPassword ? 'text' : 'password'}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full h-12 bg-zinc-950 border border-zinc-800 focus:border-purple-500 text-sm text-white rounded-xl pl-10 pr-10 outline-none transition"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3.5 top-3.5 text-zinc-500 hover:text-zinc-300 transition"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full h-12 bg-purple-600 hover:bg-purple-500 active:bg-purple-700 disabled:opacity-50 text-white font-semibold text-sm rounded-xl transition shadow-lg shadow-purple-600/25 flex items-center justify-center"
          >
            {loading ? 'Logging in...' : 'Login'}
          </button>
        </form>

        {/* Footer Link */}
        <p className="text-center text-xs text-zinc-400 pt-2">
          Don&apos;t have an account?{' '}
          <Link href="/register" className="text-purple-400 hover:text-purple-300 font-semibold underline underline-offset-4">
            Register
          </Link>
        </p>
      </div>
    </main>
  );
}
