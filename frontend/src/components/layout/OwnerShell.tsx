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
  /** Shown under the label in the drawer, where there is room to teach. */
  hint?: string;
}

// Labels are the words a café owner already uses, not ours. "Pass Scanner"
// and "Hardware Tiers" are KHEL-O vocabulary that a first-time owner has no
// way to decode; "Scan & Check-in" and "Stations & Prices" describe the task.
// Section headings say what the group is FOR, in the second person.
const ownerNavSections: NavSection[] = [
  {
    // Day-to-day operating tasks first: this is what an owner opens the
    // portal to do (check the dashboard, scan a pass, look at a booking).
    heading: 'Today',
    items: [
      {
        label: 'Dashboard',
        href: '/owner/dashboard',
        icon: LayoutDashboard,
        hint: "Today's takings and arrivals",
      },
      {
        label: 'Scan & Check-in',
        href: '/owner/scanner',
        icon: QrCode,
        hint: "Scan a customer's booking pass",
      },
      {
        label: 'Bookings',
        href: '/owner/bookings',
        icon: CalendarDays,
        hint: 'Every booking, past and upcoming',
      },
      {
        label: 'Free Seats',
        href: '/owner/availability',
        icon: CalendarClock,
        hint: "What's free right now",
      },
    ],
  },
  {
    heading: 'Your café',
    items: [
      {
        label: 'Stations & Prices',
        href: '/owner/tiers',
        icon: Monitor,
        hint: 'Set up your PCs, consoles and hourly rates',
      },
      { label: 'Discounts', href: '/owner/offers', icon: Tag, hint: 'Run a time-limited offer' },
      { label: 'Reviews', href: '/owner/reviews', icon: Store, hint: 'What customers said' },
      { label: 'Insights', href: '/owner/analytics', icon: BarChart3, hint: 'Busy hours and trends' },
      { label: 'Alerts', href: '/owner/notifications', icon: Bell, hint: 'Updates from KHEL-O' },
    ],
  },
  {
    heading: 'Money & account',
    items: [
      { label: 'Payouts', href: '/owner/payouts', icon: Wallet, hint: 'What you have been paid' },
      { label: 'Your Team', href: '/owner/staff', icon: Users, hint: 'Give staff their own login' },
      { label: 'Café Settings', href: '/owner/settings', icon: Settings, hint: 'Details, hours and pausing' },
    ],
  },
];

// Staff sees a dedicated operational view
const staffNavItems: NavItem[] = [
  { label: 'Dashboard', href: '/owner/dashboard', icon: LayoutDashboard, hint: "Today's arrivals" },
  { label: 'Scan & Check-in', href: '/owner/scanner', icon: QrCode, hint: "Scan a customer's booking pass" },
  { label: 'Bookings', href: '/owner/bookings', icon: CalendarDays, hint: 'Every booking, past and upcoming' },
  { label: 'Free Seats', href: '/owner/availability', icon: CalendarClock, hint: "What's free right now" },
];

/** Resolves the current route to its nav label, for the mobile title bar. */
function useCurrentSectionLabel(isStaff: boolean): string {
  const pathname = usePathname();
  const all = isStaff
    ? staffNavItems
    : ownerNavSections.flatMap((section) => section.items);
  // Longest match wins so /owner/settings never resolves to a shorter sibling.
  const match = all
    .filter((item) => pathname.startsWith(item.href))
    .sort((a, b) => b.href.length - a.href.length)[0];
  return match?.label ?? (isStaff ? 'Staff Desk' : 'Owner Portal');
}

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
                    'flex min-h-[40px] items-center gap-3 rounded-xl px-3 py-2.5 text-body-emphasis transition-colors duration-fast',
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

        {/* The drawer is the one place with room to say what a screen is FOR.
            An owner opening this menu for the first time should be able to pick
            the right destination without tapping through all twelve. */}
        <nav className="flex-1 space-y-6 py-4">
          {sections.map((section) => (
            <div key={section.heading}>
              <p className="mb-2 text-overline uppercase tracking-widest text-white/40">
                {section.heading}
              </p>
              <div className="space-y-0.5">
                {section.items.map((item) => {
                  const isActive = pathname.startsWith(item.href);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={onClose}
                      aria-current={isActive ? 'page' : undefined}
                      className={cn(
                        'flex min-h-[52px] items-start gap-3 rounded-xl px-3 py-2.5 transition-colors',
                        isActive
                          ? 'bg-white/15 text-white'
                          : 'text-white/70 hover:bg-white/10 hover:text-white',
                      )}
                    >
                      <item.icon className="mt-0.5 h-5 w-5 shrink-0" />
                      <span className="flex min-w-0 flex-col">
                        <span className={cn('text-body-emphasis', isActive && 'font-bold')}>
                          {item.label}
                        </span>
                        {item.hint && (
                          <span className="text-caption leading-snug text-white/45">
                            {item.hint}
                          </span>
                        )}
                      </span>
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
      className="relative flex h-9 w-9 items-center justify-center rounded-full bg-surface text-text-secondary transition-all hover:bg-border/60 hover:text-text-primary active:scale-95 [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11"
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
  const sectionLabel = useCurrentSectionLabel(isStaff);

  return (
    <header className="sticky top-0 z-nav flex h-14 items-center justify-between gap-2 border-b border-border bg-card px-2 lg:px-8">
      {/* Mobile: the menu button and the name of where you are. The KHEL-O
          wordmark used to occupy this space on every screen — it told the owner
          nothing they didn't know and left no room to say which of the twelve
          screens they had landed on. */}
      <div className="flex min-w-0 items-center gap-1 lg:hidden">
        <button
          onClick={onOpenMobileMenu}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-text-primary transition-colors hover:bg-surface active:scale-95"
          aria-label="Open navigation menu"
        >
          <Menu className="h-6 w-6" />
        </button>
        <span className="truncate font-heading text-h3 text-text-primary">{sectionLabel}</span>
      </div>

      <div className="hidden items-center gap-2 text-caption text-text-secondary lg:flex">
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

      <div className="flex shrink-0 items-center gap-2">
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

  // Same four destinations, same order, for owner and staff — the desk phone is
  // often shared, and muscle memory shouldn't depend on who is logged in.
  // "Scan" sits centre: it is the one thing done dozens of times a shift.
  const quickItems: (NavItem & { isMenu?: boolean })[] = [
    { label: 'Home', href: '/owner/dashboard', icon: LayoutDashboard },
    { label: 'Bookings', href: '/owner/bookings', icon: CalendarDays },
    { label: 'Scan', href: '/owner/scanner', icon: QrCode },
    { label: 'Seats', href: '/owner/availability', icon: CalendarClock },
    { label: 'More', href: '#menu', icon: MoreHorizontal, isMenu: true },
  ];

  const items = quickItems;

  return (
    <nav
      className="safe-bottom fixed bottom-0 left-0 right-0 z-nav flex min-h-bottom-nav items-stretch justify-around border-t border-border bg-card lg:hidden"
      aria-label="Owner bottom navigation"
    >
      {items.map((item) => {
        if (item.isMenu) {
          return (
            <button
              key="mobile-more-menu"
              onClick={onOpenMobileMenu}
              aria-label="Open navigation menu"
              className="flex min-h-[48px] flex-1 flex-col items-center justify-center gap-0.5 px-1 py-1.5 text-text-secondary transition-colors hover:text-primary"
            >
              <span className="flex items-center justify-center rounded-full px-3.5 py-1">
                <item.icon className="h-5 w-5" />
              </span>
              <span className="text-caption font-medium">{item.label}</span>
            </button>
          );
        }

        const isActive = pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              // flex-1 + a 48px floor: every tab owns an equal, thumb-sized slab
              // of the bar instead of only the width its own label happens to need.
              'flex min-h-[48px] flex-1 flex-col items-center justify-center gap-0.5 px-1 py-1.5 transition-colors duration-fast',
              isActive ? 'text-primary' : 'text-text-secondary hover:text-text-primary',
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
            <span className={cn('text-caption', isActive ? 'font-bold' : 'font-medium')}>
              {item.label}
            </span>
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
        {/* pb clears the bottom nav (64px) plus the home indicator plus a
            breath of space, so the last control on a page is never sitting
            under the bar. Pages must NOT add their own px-* or max-w-* — the
            content column is decided once, here. */}
        <main className="mx-auto w-full max-w-owner px-4 pb-[calc(6rem+env(safe-area-inset-bottom,0px))] pt-4 lg:px-8 lg:pb-10 lg:pt-8">
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
