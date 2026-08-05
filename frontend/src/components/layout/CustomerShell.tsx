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
import { NotificationCenter, type NotificationItem } from '@/components/customer/NotificationCenter';
import { RoleSwitcher } from '@/components/layout/RoleSwitcher';

const INITIAL_NOTIFICATIONS: NotificationItem[] = [
  {
    id: 'n1',
    title: 'Booking Confirmed! 🎮',
    message: 'Your station at LXG Esports Arena is reserved for today at 4:00 PM.',
    timestamp: '10 mins ago',
    type: 'booking',
    isRead: false,
    link: '/bookings',
  },
  {
    id: 'n2',
    title: '30% Off Afternoon Deal! 🔥',
    message: 'Use code OFFPEAK50 before 5 PM at CyberStorm Arena in New Delhi.',
    timestamp: '1 hour ago',
    type: 'offer',
    isRead: false,
    link: '/cafe/ca893fe293ba463fb0bbc20f9590c0f1',
  },
  {
    id: 'n3',
    title: 'Welcome to KHEL-O 🚀',
    message: 'Explore top gaming cafes, select hardware tiers, and enjoy instant pass check-ins.',
    timestamp: '1 day ago',
    type: 'system',
    isRead: true,
  },
];

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

function CustomerHeader({
  onOpenNotifications,
  hasUnread,
}: {
  onOpenNotifications: () => void;
  hasUnread: boolean;
}) {
  const pathname = usePathname();
  const user = useAuthStore((s) => s.user);

  const initial = user?.fullName ? user.fullName[0].toUpperCase() : 'A';

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
          <RoleSwitcher />
          <button
            onClick={onOpenNotifications}
            className="relative flex h-9 w-9 items-center justify-center rounded-full bg-surface text-text-secondary transition-all hover:bg-border/60 hover:text-text-primary active:scale-95"
            aria-label="Notifications"
          >
            <Bell className="h-4 w-4" />
            {hasUnread && (
              <span className="absolute top-2 right-2 h-2 w-2 rounded-full bg-accent animate-pulse" />
            )}
          </button>

          <Link href="/profile">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-secondary font-heading text-caption font-semibold text-white shadow-card transition-transform hover:scale-105">
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
              'flex flex-col items-center gap-0.5 px-4 py-1.5 transition-all duration-fast relative',
              isActive ? 'text-primary font-bold' : 'text-text-secondary hover:text-text-primary',
            )}
            aria-current={isActive ? 'page' : undefined}
          >
            <item.icon className={cn('h-5 w-5', isActive && 'scale-110')} />
            <span className="text-badge">{item.label}</span>
            {isActive && (
              <span className="absolute bottom-1 h-1 w-1 rounded-full bg-primary" />
            )}
          </Link>
        );
      })}
    </nav>
  );
}

export function CustomerShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>(INITIAL_NOTIFICATIONS);

  const hideBottomNav = pathname.startsWith('/bookings/new');
  const hasUnread = notifications.some((n) => !n.isRead);

  const markAllAsRead = () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
  };

  const markAsRead = (id: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, isRead: true } : n))
    );
  };

  const clearAll = () => {
    setNotifications([]);
  };

  return (
    <div className="min-h-screen bg-surface/40">
      <CustomerHeader
        onOpenNotifications={() => setIsNotificationsOpen(true)}
        hasUnread={hasUnread}
      />

      <main className="mx-auto w-full max-w-content px-4 py-6 md:px-6 md:py-8 pb-24 md:pb-12">
        {children}
      </main>

      {!hideBottomNav && <CustomerBottomNav />}

      <NotificationCenter
        isOpen={isNotificationsOpen}
        onClose={() => setIsNotificationsOpen(false)}
        notifications={notifications}
        onMarkAllAsRead={markAllAsRead}
        onMarkAsRead={markAsRead}
        onClearAll={clearAll}
      />
    </div>
  );
}
