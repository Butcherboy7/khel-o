'use client';

import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const { user, isAuthenticated, isHydrated, initializeFromStorage } = useAuthStore();

  useEffect(() => {
    initializeFromStorage();
  }, [initializeFromStorage]);

  useEffect(() => {
    if (isHydrated && isAuthenticated) {
      if (user?.role === 'cafe_owner') {
        router.push('/owner/dashboard');
      } else if (user?.role === 'admin') {
        router.push('/admin');
      } else {
        router.push('/');
      }
    }
  }, [isHydrated, isAuthenticated, user, router]);

  return (
    <main className="min-h-screen bg-surface flex flex-col justify-center items-center p-4">
      <div className="w-full max-w-md bg-card rounded-3xl border border-border shadow-lg p-6 sm:p-8">
        <div className="text-center mb-6">
          <h1 className="text-3xl font-bold font-heading text-primary tracking-tight">
            KHEL-O
          </h1>
          <p className="text-xs font-data text-text-secondary mt-1 tracking-wider uppercase">
            Elevated Precision Gaming Marketplace
          </p>
        </div>
        {children}
      </div>
    </main>
  );
}
