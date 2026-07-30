'use client';

import React, { useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';
import { ShieldCheck, LogOut } from 'lucide-react';

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const { user, isAuthenticated, isLoading, isHydrated, initializeFromStorage } = useAuthStore();

  useEffect(() => {
    initializeFromStorage();
  }, [initializeFromStorage]);

  useEffect(() => {
    if (isHydrated && !isLoading) {
      if (!isAuthenticated) {
        router.push('/login');
      } else if (user?.role !== 'admin') {
        router.push('/');
      }
    }
  }, [isHydrated, isLoading, isAuthenticated, user, router]);

  if (!isHydrated || isLoading) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center">
        <div className="flex flex-col items-center space-y-3">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
          <p className="text-xs font-data text-text-secondary">Verifying Admin Access...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated || user?.role !== 'admin') {
    return null;
  }

  return (
    <div className="min-h-screen bg-surface flex flex-col">
      <header className="bg-secondary text-white px-6 py-4 flex items-center justify-between border-b border-border shadow-md">
        <div className="flex items-center space-x-3">
          <div className="p-2 bg-primary/20 rounded-full text-primary">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold font-heading text-white">KHEL-O Admin Governance</h1>
            <p className="text-[10px] font-data text-gray-400 uppercase">Platform Moderation Portal</p>
          </div>
        </div>
        <Link href="/" className="text-xs text-primary font-semibold hover:underline flex items-center space-x-1">
          <LogOut className="w-4 h-4" />
          <span>Exit to Marketplace</span>
        </Link>
      </header>

      <main className="flex-1 p-6 max-w-5xl mx-auto w-full">
        {children}
      </main>
    </div>
  );
}
