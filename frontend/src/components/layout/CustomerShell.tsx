'use client';

import { type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import {
  Search,
  CalendarDays,
  Gift,
  UserCircle,
  Bell,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/cn';
import { useAuthStore } from '@/store/authStore';
import { RoleSwitcher } from '@/components/layout/RoleSwitcher';
import { PhoneNumberPrompt } from '@/components/layout/PhoneNumberPrompt';
import { apiClient } from '@/lib/api/client';

interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  matchPrefix?: boolean;
}

const customerNavItems: NavItem[] = [
  { label: 'Explore', href: '/', icon: Search, matchPrefix: false },
  { label: 'Bookings', href: '/bookings', icon: CalendarDays, matchPrefix: true },
  { label: 'Rewards', href: '/rewards', icon: Gift, matchPrefix: false },
  { label: 'Profile', href: '/profile', icon: UserCircle, matchPrefix: false },
];

function CustomerHeader() {
  const pathname = usePathname();
  const user = useAuthStore((s) => s.user);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  const { data: unreadData } = useQuery<{ unreadCount: number }>({
    queryKey: ['unread-count'],
    queryFn: async () => {
      const response = await apiClient.get('/api/v1/notifications/unread-count');
      return response.data;
    },
    enabled: isAuthenticated,
    staleTime: 60_000,
    refetchInterval: 30_000,
  });

  const initial = user?.fullName ? user.fullName[0].toUpperCase() : 'A';
  const unreadCount = unreadData?.unreadCount || 0;

  return (
    <header className="sticky top-0 z-nav w-full border-b border-border/60 bg-card/95 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-content items-center justify-between px-4 md:px-6">
        {/* Brand Logo */}
        <Link href="/" className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary font-heading font-bold text-white shadow-card">
            k
          </div>
          <span className="font-heading text-h2 font-bold tracking-tight text-text-primary lowercase">
            khel-o
          </span>
        </Link>

        {/* Center Navigation Links with Active State Highlighting */}
        <nav className="hidden items-center gap-1 md:flex" aria-label="Desktop navigation">
          {customerNavItems.map((item) => {
            const isActive = item.matchPrefix
              ? pathname.startsWith(item.href) && item.href !== '/'
              : pathname === item.href;

            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'relative rounded-full px-4 py-2 text-body font-medium transition-all duration-fast',
                  isActive
                    ? 'bg-primary/10 font-bold text-primary shadow-sm'
                    : 'text-text-secondary hover:bg-surface hover:text-text-primary',
                )}
                aria-current={isActive ? 'page' : undefined}
              >
                {item.label}
                {isActive && (
                  <span className="absolute bottom-0 left-1/2 -translate-x-1/2 h-0.5 w-4 rounded-full bg-primary" />
                )}
              </Link>
            );
          })}
        </nav>

        {/* Right Actions */}
        <div className="flex items-center gap-3">
          {isAuthenticated ? (
            <>
              <RoleSwitcher />
              <Link
                href="/notifications"
                className="relative flex h-9 w-9 items-center justify-center rounded-full bg-surface text-text-secondary transition-all hover:bg-border/60 hover:text-text-primary active:scale-95"
                aria-label="Notifications"
              >
                <Bell className="h-4 w-4" />
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-[20px] h-5 flex items-center justify-center rounded-full bg-accent text-white text-badge font-bold">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </Link>

              <Link href="/profile">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-secondary font-heading text-caption font-semibold text-white shadow-card transition-transform hover:scale-105">
                  {initial}
                </div>
              </Link>
            </>
          ) : (
            <Link
              href={`/login?redirect=${encodeURIComponent(pathname)}`}
              className="rounded-full bg-primary px-4 py-2 text-caption font-bold text-white shadow-card hover:bg-primary/90 transition-colors"
            >
              Log in
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}

function CustomerBottomNav() {
  const pathname = usePathname();

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-nav flex h-bottom-nav items-center justify-around border-t border-border bg-card safe-bottom md:hidden shadow-overlay"
      aria-label="Mobile navigation"
    >
      {customerNavItems.map((item) => {
        const isActive = item.matchPrefix
          ? pathname.startsWith(item.href) && item.href !== '/'
          : pathname === item.href;

        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              'flex flex-col items-center gap-0.5 px-4 py-1.5 transition-all duration-fast',
              isActive ? 'text-primary font-bold' : 'text-text-secondary hover:text-text-primary',
            )}
            aria-current={isActive ? 'page' : undefined}
          >
            <span
              className={cn(
                'flex items-center justify-center rounded-full px-3.5 py-1 transition-all duration-fast',
                isActive && 'bg-primary/12',
              )}
            >
              <item.icon className="h-5 w-5" />
            </span>
            <span className="text-badge">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

export function CustomerShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-surface/40">
      <CustomerHeader />

      <main className="mx-auto w-full max-w-content px-4 py-6 md:px-6 md:py-8 pb-24 md:pb-12">
        {children}
      </main>

      <CustomerBottomNav />
      <PhoneNumberPrompt />
    </div>
  );
}
