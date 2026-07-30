'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';
import api from '@/lib/api';

export default function LoginPage() {
  const router = useRouter();
  const setAuth = useAuthStore((state) => state.setAuth);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await api.post('/api/v1/auth/login', {
        email,
        password,
      });

      const { user, accessToken, refreshToken } = res.data.data;
      setAuth(user, accessToken, refreshToken);
      
      if (user.role === 'cafe_owner') {
        router.push('/owner/dashboard');
      } else if (user.role === 'admin') {
        router.push('/admin');
      } else {
        router.push('/');
      }
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'response' in err) {
        const axiosErr = err as { response?: { data?: { error?: { message?: string } } } };
        setError(axiosErr.response?.data?.error?.message || 'Invalid email or password.');
      } else {
        setError('Login failed. Please check your connection.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = () => {
    setError('Google Sign In relies on Google OAuth Client ID setup in production.');
  };

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-xl font-bold font-heading text-text-primary">Welcome Back</h2>
        <p className="text-sm font-body text-text-secondary">Log in to book your gaming sessions</p>
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-error/20 rounded-2xl text-xs text-error font-body">
          {error}
        </div>
      )}

      {/* Primary: Google Sign In */}
      <button
        type="button"
        onClick={handleGoogleSignIn}
        className="w-full btn-primary flex items-center justify-center space-x-2"
      >
        <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
          <path d="M12.24 10.285V13.4h6.887c-.58 2.765-2.85 4.71-5.647 4.71-3.417 0-6.19-2.774-6.19-6.195 0-3.42 2.773-6.195 6.19-6.195 1.58 0 3.018.59 4.133 1.564l2.456-2.456C18.57 3.655 15.61 2.5 12.24 2.5 6.983 2.5 2.73 6.753 2.73 12.01s4.253 9.51 9.51 9.51c5.5 0 9.14-3.868 9.14-9.303 0-.642-.066-1.268-.176-1.932H12.24z" />
        </svg>
        <span>Continue with Google</span>
      </button>

      <div className="relative flex items-center justify-center">
        <div className="border-t border-border w-full"></div>
        <span className="bg-card px-3 text-xs text-text-secondary font-body uppercase tracking-wider">
          or email
        </span>
      </div>

      {/* Secondary: Email Form */}
      <form onSubmit={handleEmailLogin} className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-text-secondary mb-1">
            Email Address
          </label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="gamer@example.com"
            className="w-full px-4 py-3 bg-surface border border-border rounded-2xl text-sm focus:outline-none focus:border-primary text-text-primary"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-text-secondary mb-1">
            Password
          </label>
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            className="w-full px-4 py-3 bg-surface border border-border rounded-2xl text-sm focus:outline-none focus:border-primary text-text-primary"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full btn-secondary disabled:opacity-50"
        >
          {loading ? 'Logging in...' : 'Sign In with Email'}
        </button>
      </form>

      <div className="text-center text-xs text-text-secondary">
        Don&apos;t have an account?{' '}
        <Link href="/register" className="text-primary font-semibold hover:underline">
          Register here
        </Link>
      </div>
    </div>
  );
}
