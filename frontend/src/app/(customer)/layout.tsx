'use client';

import React, { useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Compass, Calendar, Gift, User, MapPin, Bell } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';

export default function CustomerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { isAuthenticated, isLoading, isHydrated, initializeFromStorage } = useAuthStore();

  useEffect(() => {
    initializeFromStorage();
  }, [initializeFromStorage]);

  useEffect(() => {
    if (isHydrated && !isLoading && !isAuthenticated) {
      router.push('/login');
    }
  }, [isHydrated, isLoading, isAuthenticated, router]);

  if (!isHydrated || isLoading) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center">
        <div className="flex flex-col items-center space-y-3">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
          <p className="text-xs font-data text-text-secondary">Loading KHEL-O...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  const navItems = [
    { label: 'Explore', href: '/', icon: Compass },
    { label: 'Bookings', href: '/bookings', icon: Calendar },
    { label: 'Rewards', href: '/rewards', icon: Gift },
    { label: 'Profile', href: '/profile', icon: User },
  ];

  return (
    <div className="min-h-screen bg-surface flex flex-col justify-between">
      {/* Fixed Top App Bar */}
      <header className="fixed top-0 left-0 right-0 z-40 bg-card border-b border-border shadow-sm">
        <div className="max-w-md mx-auto px-4 h-14 flex items-center justify-between">
          <Link href="/" className="font-heading font-bold text-xl text-primary tracking-tight">
            KHEL-O
          </Link>
          <div className="flex items-center space-x-3">
            <div className="flex items-center space-x-1 px-3 py-1 bg-surface border border-border rounded-full text-xs text-text-secondary font-medium">
              <MapPin className="w-3.5 h-3.5 text-primary" />
              <span>Bengaluru</span>
            </div>
            <button
              type="button"
              className="p-2 text-text-secondary hover:text-text-primary rounded-full hover:bg-surface transition-colors"
              aria-label="Notifications"
            >
              <Bell className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      {/* Scrollable Main Content Area */}
      <main className="flex-1 pt-14 pb-20 max-w-md w-full mx-auto px-4 py-4">
        {children}
      </main>

      {/* Fixed Bottom Navigation Bar */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 bg-card border-t border-border shadow-lg">
        <div className="max-w-md mx-auto px-4 h-16 flex items-center justify-around">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive =
              item.href === '/'
                ? pathname === '/'
                : pathname.startsWith(item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                className="flex flex-col items-center justify-center text-xs font-medium transition-all"
              >
                <div
                  className={`p-2 rounded-full transition-all duration-200 ${
                    isActive
                      ? 'bg-primary text-white shadow-sm'
                      : 'text-text-secondary hover:text-text-primary'
                  }`}
                >
                  <Icon className="w-5 h-5" />
                </div>
                <span
                  className={`mt-0.5 text-[10px] ${
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
