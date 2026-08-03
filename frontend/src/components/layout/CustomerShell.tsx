'use client';

import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
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
import { NotificationCenter } from '@/components/customer/NotificationCenter';

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

function CustomerHeader({ onOpenNotifications }: { onOpenNotifications: () => void }) {
  const pathname = usePathname();
  const user = useAuthStore((s) => s.user);

  const initial = user?.fullName ? user.fullName[0].toUpperCase() : 'A';

  return (
    <header className="sticky top-0 z-nav w-full border-b border-border/40 bg-card/80 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-content items-center justify-between px-4 md:px-6">
        {/* Brand Logo */}
        <Link href="/" className="flex items-center gap-2 group">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary font-heading font-bold text-white shadow-float transition-transform group-hover:scale-105 group-active:scale-95">
            k
          </div>
          <span className="font-heading text-h2 font-bold tracking-tight text-text-primary lowercase transition-colors group-hover:text-primary">
            khel-o
          </span>
        </Link>

        {/* Center Navigation Links with Active State Highlighting */}
        <nav className="hidden items-center gap-2 md:flex" aria-label="Desktop navigation">
          {customerNavItems.map((item) => {
            const isActive = item.matchPrefix
              ? pathname.startsWith(item.href) && item.href !== '/'
              : pathname === item.href;

            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'relative flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full px-5 py-2 text-body font-medium transition-all duration-fast hover:-translate-y-0.5',
                  isActive
                    ? 'bg-primary/10 font-bold text-primary shadow-sm'
                    : 'text-text-secondary hover:bg-surface hover:text-text-primary hover:shadow-sm',
                )}
                aria-current={isActive ? 'page' : undefined}
              >
                {item.label}
                {isActive && (
                  <span className="absolute bottom-1 left-1/2 -translate-x-1/2 h-1 w-1 rounded-full bg-primary" />
                )}
              </Link>
            );
          })}
        </nav>

        {/* Right Actions */}
        <div className="flex items-center gap-3">
          <button
            onClick={onOpenNotifications}
            className="relative flex h-11 w-11 items-center justify-center rounded-full bg-surface text-text-secondary transition-all hover:bg-border/60 hover:text-text-primary active:scale-95 shadow-sm hover:shadow-card hover:-translate-y-0.5"
            aria-label="Notifications"
          >
            <Bell className="h-5 w-5" />
            <span className="absolute top-2.5 right-2.5 h-2 w-2 rounded-full border border-card bg-accent animate-pulse" />
          </button>

          <Link href="/profile" className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-full">
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-secondary font-heading text-body font-bold text-white shadow-card transition-all hover:scale-105 active:scale-95 hover:shadow-float">
              {initial}
            </div>
          </Link>
        </div>
      </div>
    </header>
  );
}

function CustomerBottomNav() {
  const pathname = usePathname();

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-nav flex h-bottom-nav items-center justify-around border-t border-border/50 bg-card/95 backdrop-blur-lg safe-bottom md:hidden shadow-overlay pb-safe"
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
              'flex flex-col items-center justify-center gap-1 min-h-[44px] min-w-[64px] px-2 py-1.5 transition-all duration-fast relative group',
              isActive ? 'text-primary font-bold' : 'text-text-secondary hover:text-text-primary',
            )}
            aria-current={isActive ? 'page' : undefined}
          >
            <div className={cn(
              "p-1.5 rounded-full transition-all duration-normal",
              isActive ? "bg-primary/10" : "group-hover:bg-surface"
            )}>
              <item.icon className={cn('h-5 w-5 transition-transform', isActive ? 'scale-110' : 'group-active:scale-90')} />
            </div>
            <span className="text-[10px] font-medium leading-none">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

export function CustomerShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);

  const hideBottomNav = pathname.startsWith('/bookings/new');

  return (
    <div className="min-h-screen bg-surface/40">
      <CustomerHeader onOpenNotifications={() => setIsNotificationsOpen(true)} />

      <main className="mx-auto w-full max-w-content px-4 py-6 md:px-6 md:py-8 pb-24 md:pb-12">
        {children}
      </main>

      {!hideBottomNav && <CustomerBottomNav />}

      <NotificationCenter
        isOpen={isNotificationsOpen}
        onClose={() => setIsNotificationsOpen(false)}
      />
    </div>
  );
}
