'use client';

import { useState, useEffect, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import {
  LayoutDashboard,
  Store,
  Monitor,
  CalendarDays,
  CalendarClock,
  Tag,
  Users,
  Wallet,
  LogOut,
  BarChart3,
  QrCode,
  Settings,
  Menu,
  X,
  MoreHorizontal,
  Bell,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/cn';
import { useAuthStore } from '@/store/authStore';
import { RoleSwitcher } from '@/components/layout/RoleSwitcher';
import { PlatformReconfirmModal } from '@/components/owner/PlatformReconfirmModal';
import { apiClient } from '@/lib/api/client';
import type { User } from '@/types';

/* ── Navigation Items ────────────────────────────────────────────── */

interface NavSection {
  heading: string;
  items: NavItem[];
}

interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
}

const ownerNavSections: NavSection[] = [
  {
    // Day-to-day operating tasks first: this is what an owner opens the
    // portal to do (check the dashboard, scan a pass, look at a booking).
    heading: 'Operations',
    items: [
      { label: 'Dashboard', href: '/owner/dashboard', icon: LayoutDashboard },
      { label: 'Availability', href: '/owner/availability', icon: CalendarClock },
      { label: 'Pass Scanner', href: '/owner/scanner', icon: QrCode },
      { label: 'Bookings', href: '/owner/bookings', icon: CalendarDays },
    ],
  },
  {
    heading: 'Grow & Manage',
    items: [
      { label: 'Hardware Tiers', href: '/owner/tiers', icon: Monitor },
      { label: 'Promotions & Offers', href: '/owner/offers', icon: Tag },
      { label: 'Reviews', href: '/owner/reviews', icon: Store },
      { label: 'Analytics', href: '/owner/analytics', icon: BarChart3 },
      { label: 'Notifications', href: '/owner/notifications', icon: Bell },
    ],
  },
  {
    heading: 'Financials & Settings',
    items: [
      { label: 'Payouts & Razorpay', href: '/owner/payouts', icon: Wallet },
      { label: 'Staff Management', href: '/owner/staff', icon: Users },
      { label: 'Café Settings', href: '/owner/settings', icon: Settings },
    ],
  },
];

// Staff sees a dedicated operational view
const staffNavItems: NavItem[] = [
  { label: 'Dashboard', href: '/owner/dashboard', icon: LayoutDashboard },
  { label: 'Availability', href: '/owner/availability', icon: CalendarClock },
  { label: 'Pass Scanner', href: '/owner/scanner', icon: QrCode },
  { label: 'Bookings', href: '/owner/bookings', icon: CalendarDays },
];

/* ── Desktop Sidebar ─────────────────────────────────────────────── */

function OwnerSidebar({ isStaff }: { isStaff: boolean }) {
  const pathname = usePathname();
  const { user, logout } = useAuthStore();
  const [cachedUser, setCachedUser] = useState<Partial<User> | null>(null);

  useEffect(() => {
    if (!user && typeof window !== 'undefined') {
      const stored = localStorage.getItem('user');
      if (stored) {
        try {
          setCachedUser(JSON.parse(stored));
        } catch {
          // ignore
        }
      }
    }
  }, [user]);

  const activeUser = user || cachedUser;

  const initials = activeUser?.fullName
    ? activeUser.fullName
        .split(' ')
        .map((n: string) => n[0])
        .join('')
        .slice(0, 2)
        .toUpperCase()
    : activeUser?.email
    ? activeUser.email[0].toUpperCase()
    : 'O';

  const sections = isStaff
    ? [{ heading: 'Operations', items: staffNavItems }]
    : ownerNavSections;

  return (
    <aside className="fixed left-0 top-0 z-nav hidden h-screen w-owner-sidebar flex-col border-r border-border bg-secondary lg:flex">
      {/* Brand + Venue */}
      <div className="border-b border-white/10 px-5 py-4">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-accent">
            <span className="font-heading text-body-emphasis text-white">K</span>
          </div>
          <span className="font-heading text-h3 text-white">KHEL-O</span>
        </div>
        <div className="mt-2">
          <p className="text-caption text-white/50 uppercase tracking-wide">
            {isStaff ? 'Staff Portal' : 'Owner Portal'}
          </p>
        </div>
      </div>

      {/* Nav Sections */}
      <nav
        className="flex flex-1 flex-col gap-1 overflow-y-auto px-3 py-4"
        aria-label="Owner navigation"
      >
        {sections.map((section) => (
          <div key={section.heading} className="mb-4">
            <p className="mb-1 px-3 text-overline text-white/40 uppercase tracking-widest">
              {section.heading}
            </p>
            {section.items.map((item) => {
              const isActive = pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    'flex items-center gap-3 rounded-xl px-3 py-2.5 text-body-emphasis transition-colors duration-fast',
                    isActive
                      ? 'bg-white/15 text-white font-bold'
                      : 'text-white/60 hover:bg-white/10 hover:text-white',
                  )}
                  aria-current={isActive ? 'page' : undefined}
                >
                  <item.icon className="h-4 w-4 flex-shrink-0" />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </div>
        ))}

        {/* Role Switcher in Sidebar */}
        <div className="mt-auto pt-4 border-t border-white/10 flex justify-center">
          <RoleSwitcher />
        </div>
      </nav>

      {/* User Footer */}
      <div className="border-t border-white/10 px-4 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-accent text-caption font-semibold text-white">
              {initials}
            </div>
            <div className="flex flex-col">
              <span className="truncate text-body-emphasis text-white">
                {activeUser?.fullName || activeUser?.email || 'Café Owner'}
              </span>
              <span className="truncate text-caption text-white/50">
                {isStaff ? 'Staff' : 'Owner'}
              </span>
            </div>
          </div>
          <button
            onClick={logout}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-white/40 transition-colors duration-fast hover:bg-white/10 hover:text-white"
            aria-label="Log out"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}

/* ── Mobile Navigation Drawer & Bottom Bar ────────────────────────────────────────── */

function OwnerMobileMenu({
  isOpen,
  onClose,
  isStaff,
}: {
  isOpen: boolean;
  onClose: () => void;
  isStaff: boolean;
}) {
  const pathname = usePathname();
  const { user, logout } = useAuthStore();

  const sections = isStaff
    ? [{ heading: 'Operations', items: staffNavItems }]
    : ownerNavSections;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-modal flex lg:hidden">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity"
        onClick={onClose}
      />

      {/* Slide-over Drawer (Left Aligned to match top-left hamburger icon) */}
      <div className="relative mr-auto flex h-full w-4/5 max-w-xs flex-col overflow-y-auto bg-secondary p-5 shadow-2xl text-white animate-in slide-in-from-left duration-200">
        <div className="flex items-center justify-between border-b border-white/10 pb-4">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-accent">
              <span className="font-heading text-body-emphasis text-white">K</span>
            </div>
            <span className="font-heading text-h3 text-white">KHEL-O Menu</span>
          </div>
          <button
            onClick={onClose}
            className="flex h-11 w-11 items-center justify-center rounded-lg text-white/60 hover:text-white hover:bg-white/10 active:scale-95"
            aria-label="Close menu"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        <nav className="flex-1 py-4 space-y-6">
          {sections.map((section) => (
            <div key={section.heading}>
              <p className="mb-2 text-overline text-white/40 uppercase tracking-widest">
                {section.heading}
              </p>
              <div className="space-y-1">
                {section.items.map((item) => {
                  const isActive = pathname.startsWith(item.href);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={onClose}
                      className={cn(
                        'flex items-center gap-3 rounded-xl px-3 py-2.5 text-body-emphasis transition-colors',
                        isActive
                          ? 'bg-white/15 text-white font-bold'
                          : 'text-white/70 hover:bg-white/10 hover:text-white',
                      )}
                    >
                      <item.icon className="h-5 w-5 shrink-0" />
                      <span>{item.label}</span>
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        <div className="border-t border-white/10 pt-4 flex flex-col gap-4">
          <div className="flex justify-center">
            <RoleSwitcher />
          </div>

          <div className="flex items-center justify-between pt-2">
            <span className="text-caption text-white/60 truncate max-w-[180px]">
              {user?.fullName || user?.email || 'Café Owner'}
            </span>
            <button
              onClick={() => {
                onClose();
                logout();
              }}
              className="flex items-center gap-1.5 text-caption font-semibold text-rose-400 hover:text-rose-300"
            >
              <LogOut className="h-4 w-4" />
              <span>Log out</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function OwnerNotificationBell() {
  const { data } = useQuery<{ unreadCount: number }>({
    queryKey: ['unread-count'],
    queryFn: async () => {
      const response = await apiClient.get('/api/v1/notifications/unread-count');
      return response.data;
    },
    staleTime: 60_000,
    refetchInterval: 30_000,
  });
  const unreadCount = data?.unreadCount || 0;

  return (
    <Link
      href="/owner/notifications"
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
  );
}

function OwnerTopBar({
  isStaff,
  onOpenMobileMenu,
}: {
  isStaff: boolean;
  onOpenMobileMenu: () => void;
}) {
  return (
    <header className="sticky top-0 z-nav flex h-14 items-center justify-between border-b border-border bg-card px-4 lg:px-8">
      <div className="flex items-center gap-3 lg:hidden">
        <button
          onClick={onOpenMobileMenu}
          className="flex h-11 w-11 items-center justify-center rounded-lg text-text-primary hover:bg-surface-hover transition-colors active:scale-95"
          aria-label="Open navigation menu"
        >
          <Menu className="h-6 w-6" />
        </button>
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-accent">
            <span className="font-heading text-caption font-bold text-white">K</span>
          </div>
          <span className="font-heading text-h3 text-text-primary">KHEL-O</span>
        </div>
      </div>

      <div className="hidden lg:flex items-center gap-2 text-caption text-text-secondary">
        <span className="font-semibold text-text-primary">
          {isStaff ? 'Café Staff Desk' : 'Café Owner Portal'}
        </span>
        <span>•</span>
        <span>
          {isStaff
            ? 'Desk Operations & Station Check-In'
            : 'Venue Operational Status & Live Management'}
        </span>
      </div>

      <div className="flex items-center gap-3">
        <OwnerNotificationBell />
        <RoleSwitcher />
      </div>
    </header>
  );
}

function OwnerBottomNav({
  isStaff,
  onOpenMobileMenu,
}: {
  isStaff: boolean;
  onOpenMobileMenu: () => void;
}) {
  const pathname = usePathname();

  const ownerQuickItems: (NavItem & { isMenu?: boolean })[] = [
    { label: 'Dashboard', href: '/owner/dashboard', icon: LayoutDashboard },
    { label: 'Bookings', href: '/owner/bookings', icon: CalendarDays },
    { label: 'Availability', href: '/owner/availability', icon: CalendarClock },
    { label: 'Scanner', href: '/owner/scanner', icon: QrCode },
    { label: 'More', href: '#menu', icon: MoreHorizontal, isMenu: true },
  ];

  const staffQuickItems: (NavItem & { isMenu?: boolean })[] = [
    { label: 'Dashboard', href: '/owner/dashboard', icon: LayoutDashboard },
    { label: 'Availability', href: '/owner/availability', icon: CalendarClock },
    { label: 'Scanner', href: '/owner/scanner', icon: QrCode },
    { label: 'Bookings', href: '/owner/bookings', icon: CalendarDays },
    { label: 'More', href: '#menu', icon: MoreHorizontal, isMenu: true },
  ];

  const items = isStaff ? staffQuickItems : ownerQuickItems;

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-nav flex h-bottom-nav items-center justify-around border-t border-border bg-card safe-bottom lg:hidden"
      aria-label="Owner bottom navigation"
    >
      {items.map((item) => {
        if (item.isMenu) {
          return (
            <button
              key="mobile-more-menu"
              onClick={onOpenMobileMenu}
              className="flex flex-col items-center gap-0.5 px-3 py-1.5 text-text-secondary hover:text-primary transition-colors"
            >
              <item.icon className="h-5 w-5" />
              <span className="text-badge">{item.label}</span>
            </button>
          );
        }

        const isActive = pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              'flex flex-col items-center gap-0.5 px-3 py-1.5 transition-colors duration-fast',
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

/* ── Exported Shell ──────────────────────────────────────────────── */

export function OwnerShell({
  children,
  isStaff = false,
}: {
  children: ReactNode;
  isStaff?: boolean;
}) {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  return (
    <div className="min-h-screen bg-surface">
      {/* Owner-only: confirms platform/model on tiers that pre-date this
          redesign. Not shown to staff — the backing endpoint requires a
          cafe_owner (or admin) role and always 403s for a staff-only
          account, and platform identity isn't staff's call to make. */}
      {!isStaff && <PlatformReconfirmModal />}

      <OwnerSidebar isStaff={isStaff} />

      {/* Main content — offset by owner sidebar on desktop */}
      <div className="lg:pl-owner-sidebar">
        <OwnerTopBar
          isStaff={isStaff}
          onOpenMobileMenu={() => setIsMobileMenuOpen(true)}
        />
        <main className="mx-auto w-full max-w-owner px-4 pb-20 pt-4 lg:px-8 lg:pb-8 lg:pt-8">
          {children}
        </main>
      </div>

      <OwnerBottomNav
        isStaff={isStaff}
        onOpenMobileMenu={() => setIsMobileMenuOpen(true)}
      />

      <OwnerMobileMenu
        isOpen={isMobileMenuOpen}
        onClose={() => setIsMobileMenuOpen(false)}
        isStaff={isStaff}
      />
    </div>
  );
}
