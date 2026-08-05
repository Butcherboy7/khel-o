'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Store,
  Monitor,
  CalendarDays,
  Tag,
  Users,
  Wallet,
  LogOut,
  ChevronRight,
  BarChart3,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/cn';
import { useAuthStore } from '@/store/authStore';
import { RoleSwitcher } from '@/components/layout/RoleSwitcher';

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
    heading: 'Overview',
    items: [
      { label: 'Dashboard', href: '/owner/dashboard', icon: LayoutDashboard },
      { label: 'Analytics', href: '/owner/analytics', icon: BarChart3 },
    ],
  },
  {
    heading: 'Operations',
    items: [
      { label: 'Bookings', href: '/owner/bookings', icon: CalendarDays },
      { label: 'Hardware Tiers', href: '/owner/tiers', icon: Monitor },
      { label: 'Promotions & Offers', href: '/owner/offers', icon: Tag },
      { label: 'Reviews', href: '/owner/reviews', icon: Store },
    ],
  },
  {
    heading: 'Financials & Staff',
    items: [
      { label: 'Payouts & Razorpay', href: '/owner/payouts', icon: Wallet },
      { label: 'Staff Management', href: '/owner/staff', icon: Users },
    ],
  },
];

// Staff-only sees a simplified view
const staffNavItems: NavItem[] = [
  { label: 'Bookings', href: '/owner/bookings', icon: CalendarDays },
];

/* ── Desktop Sidebar ─────────────────────────────────────────────── */

function OwnerSidebar({ isStaff }: { isStaff: boolean }) {
  const pathname = usePathname();
  const { user, logout } = useAuthStore();

  const initials = user?.fullName
    ? user.fullName
        .split(' ')
        .map((n) => n[0])
        .join('')
        .slice(0, 2)
        .toUpperCase()
    : '?';

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
          <p className="text-caption text-white/50 uppercase tracking-wide">Owner Portal</p>
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
                      ? 'bg-white/15 text-white'
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
                {user?.fullName ?? 'Owner'}
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

/* ── Mobile Top Bar ──────────────────────────────────────────────── */

function OwnerTopBar() {
  return (
    <header className="sticky top-0 z-nav flex h-nav items-center justify-between border-b border-border bg-secondary px-4 lg:hidden">
      <div className="flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-accent">
          <span className="font-heading text-body-emphasis text-white">K</span>
        </div>
        <span className="font-heading text-h3 text-white">KHEL-O</span>
      </div>
      <RoleSwitcher />
    </header>
  );
}

/* ── Mobile Bottom Nav ───────────────────────────────────────────── */

function OwnerBottomNav({ isStaff }: { isStaff: boolean }) {
  const pathname = usePathname();
  const items = isStaff ? staffNavItems : ownerNavSections.flatMap((s) => s.items).slice(0, 4);

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-nav flex h-bottom-nav items-center justify-around border-t border-border bg-card safe-bottom lg:hidden"
      aria-label="Owner bottom navigation"
    >
      {items.map((item) => {
        const isActive = pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              'flex flex-col items-center gap-0.5 px-3 py-2 transition-colors duration-fast',
              isActive ? 'text-primary' : 'text-text-secondary',
            )}
            aria-current={isActive ? 'page' : undefined}
          >
            <item.icon className="h-5 w-5" />
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
  return (
    <div className="min-h-screen bg-surface">
      <OwnerSidebar isStaff={isStaff} />
      <OwnerTopBar />

      {/* Main content — offset by owner sidebar on desktop */}
      <main className="lg:pl-owner-sidebar">
        <div className="mx-auto w-full max-w-owner px-4 pb-20 pt-4 lg:px-8 lg:pb-8 lg:pt-8">
          {children}
        </div>
      </main>

      <OwnerBottomNav isStaff={isStaff} />
    </div>
  );
}
