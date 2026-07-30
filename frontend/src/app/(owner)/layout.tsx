'use client';

import React, { useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';
import { LayoutDashboard, Store, Layers, Calendar, Tag, LogOut, ShieldAlert } from 'lucide-react';

export default function OwnerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, isAuthenticated, isLoading, isHydrated, initializeFromStorage } = useAuthStore();

  useEffect(() => {
    initializeFromStorage();
  }, [initializeFromStorage]);

  useEffect(() => {
    if (isHydrated && !isLoading) {
      if (!isAuthenticated) {
        router.push('/login');
      } else if (user?.role !== 'cafe_owner' && user?.role !== 'admin') {
        router.push('/');
      }
    }
  }, [isHydrated, isLoading, isAuthenticated, user, router]);

  if (!isHydrated || isLoading) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center">
        <div className="flex flex-col items-center space-y-3">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
          <p className="text-xs font-data text-text-secondary">Verifying Partner Access...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated || (user?.role !== 'cafe_owner' && user?.role !== 'admin')) {
    return null;
  }

  const ownerNavItems = [
    { label: 'Dashboard', href: '/owner/dashboard', icon: LayoutDashboard },
    { label: 'My Café', href: '/owner/cafe', icon: Store },
    { label: 'Hardware Tiers', href: '/owner/tiers', icon: Layers },
    { label: 'Bookings', href: '/owner/bookings', icon: Calendar },
    { label: 'Promotions', href: '/owner/promotions', icon: Tag },
  ];

  return (
    <div className="min-h-screen bg-surface flex flex-col md:flex-row">
      {/* Sidebar for Desktop (md+) */}
      <aside className="hidden md:flex flex-col w-64 bg-secondary text-white p-6 justify-between border-r border-border">
        <div className="space-y-6">
          <div>
            <h1 className="text-2xl font-bold font-heading text-primary">KHEL-O</h1>
            <p className="text-[10px] font-data text-gray-400 tracking-wider uppercase">Partner Hub</p>
          </div>
          <nav className="space-y-1">
            {ownerNavItems.map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center space-x-3 px-4 py-3 rounded-2xl text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-primary text-white font-semibold'
                      : 'text-gray-300 hover:bg-gray-800 hover:text-white'
                  }`}
                >
                  <Icon className="w-5 h-5" />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>
        </div>

        <Link
          href="/"
          className="flex items-center space-x-2 text-xs text-gray-400 hover:text-white pt-4 border-t border-gray-700"
        >
          <LogOut className="w-4 h-4" />
          <span>Exit to Gamer View</span>
        </Link>
      </aside>

      {/* Top Mobile Bar (under md) */}
      <header className="md:hidden bg-secondary text-white px-4 py-3 flex items-center justify-between border-b border-border">
        <div>
          <h1 className="text-xl font-bold font-heading text-primary">KHEL-O</h1>
          <p className="text-[9px] font-data text-gray-400 uppercase">Partner Hub</p>
        </div>
        <Link href="/" className="text-xs text-primary font-semibold hover:underline">
          Gamer View
        </Link>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 p-4 md:p-8 max-w-5xl mx-auto w-full pb-20 md:pb-8">
        {children}
      </main>

      {/* Bottom Nav for Mobile (under md) */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-card border-t border-border shadow-lg">
        <div className="flex items-center justify-around h-16 px-2">
          {ownerNavItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className="flex flex-col items-center justify-center"
              >
                <div
                  className={`p-2 rounded-full transition-colors ${
                    isActive ? 'bg-primary text-white' : 'text-text-secondary'
                  }`}
                >
                  <Icon className="w-5 h-5" />
                </div>
                <span
                  className={`text-[9px] ${
                    isActive ? 'text-primary font-semibold' : 'text-text-secondary'
                  }`}
                >
                  {item.label}
                </span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
