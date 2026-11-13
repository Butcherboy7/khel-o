'use client';

import { useState, useEffect, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  ShieldCheck,
  Store,
  Users,
  Clapperboard,
  BarChart3,
  CalendarDays,
  MessageSquare,
  CreditCard,
  Tag,
  UsersRound,
  ScrollText,
  ExternalLink,
  LifeBuoy,
  Settings,
  MoreHorizontal,
  X,
  Activity,
  TrendingUp,
  Share2,
  Monitor,
  MapPin,
  Megaphone,
  Rocket,
  Trophy,
  IndianRupee,
  Banknote,
  Clock,
  type LucideIcon,
  Target,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';
import { cn } from '@/lib/cn';
import { useAuthStore } from '@/store/authStore';

/* ── Navigation Items ────────────────────────────────────────────── */

interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
}

interface NavGroup {
  label: string | null;
  items: NavItem[];
}

const adminNavGroups: NavGroup[] = [
  {
    label: null,
    items: [
      { label: 'Overview', href: '/admin', icon: BarChart3 },
      { label: 'Verification Queue', href: '/admin/verification-queue', icon: ShieldCheck },
    ],
  },
  {
    label: 'Marketplace',
    items: [
      { label: 'Bookings', href: '/admin/bookings', icon: CalendarDays },
      { label: 'Marketplace Health', href: '/admin/marketplace-health', icon: Activity },
    ],
  },
  {
    label: 'Cafés',
    items: [
      { label: 'All Cafés', href: '/admin/cafes', icon: Store },
      { label: 'Booking Soon', href: '/admin/booking-soon', icon: Clock },
      { label: 'Café Demand', href: '/admin/leads', icon: Megaphone },
      { label: 'GTA 6 List', href: '/admin/launch-list', icon: Rocket },
      { label: 'Challenges', href: '/admin/challenges', icon: Trophy },
      { label: 'Drops', href: '/admin/drops', icon: Rocket },
      { label: 'Community', href: '/admin/community', icon: Users },
      { label: 'Community email', href: '/admin/community-email', icon: Megaphone },
      { label: 'Instagram', href: '/admin/instagram', icon: Clapperboard },
    ],
  },
  {
    label: 'Inventory',
    items: [
      { label: 'Setup Performance', href: '/admin/inventory/setups', icon: Monitor },
    ],
  },
  {
    label: 'Analytics',
    items: [
      { label: 'Traffic', href: '/admin/analytics/traffic', icon: TrendingUp },
      { label: 'Campaigns', href: '/admin/analytics/ads', icon: Target },
      { label: 'Shares', href: '/admin/analytics/shares', icon: Share2 },
      { label: 'Areas', href: '/admin/analytics/geography', icon: MapPin },
      { label: 'Revenue', href: '/admin/analytics/revenue', icon: IndianRupee },
    ],
  },
  {
    label: 'Finance',
    items: [
      { label: 'Payments', href: '/admin/payments', icon: CreditCard },
      { label: 'Café Payables', href: '/admin/cafe-payouts', icon: Banknote },
    ],
  },
  {
    label: 'Operations',
    items: [
      { label: 'Support', href: '/admin/support', icon: LifeBuoy },
      { label: 'Audit Log', href: '/admin/audit-log', icon: ScrollText },
    ],
  },
  {
    label: 'Platform',
    items: [
      { label: 'Users', href: '/admin/users', icon: Users },
      { label: 'Staff', href: '/admin/staff', icon: UsersRound },
      { label: 'Promotions', href: '/admin/promotions', icon: Tag },
      { label: 'Reviews', href: '/admin/reviews', icon: MessageSquare },
      { label: 'Settings', href: '/admin/settings', icon: Settings },
    ],
  },
];

/* ── Shared nav body (used by both the desktop sidebar and the mobile drawer) ── */

function AdminNavBody({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const { user, logout } = useAuthStore();
  const { data: openTickets } = useQuery({
    queryKey: ['admin', 'support', 'open-count'],
    queryFn: async () => (await apiClient.get('/api/v1/admin/support/open-count')).data?.data?.count as number,
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  const initials = user?.fullName
    ? user.fullName.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()
    : 'A';

  return (
    <>
      {/* Nav */}
      <nav className="flex flex-1 flex-col gap-1 overflow-y-auto px-3 py-4" aria-label="Admin navigation">
        {adminNavGroups.map((group, groupIdx) => (
          <div key={group.label ?? `ungrouped-${groupIdx}`} className={groupIdx > 0 ? 'mt-4' : ''}>
            {group.label && (
              <div className="px-3 pb-1 text-overline text-white/40 uppercase tracking-wider font-semibold">
                {group.label}
              </div>
            )}
            {group.items.map((item) => {
              const isActive =
                item.href === '/admin'
                  ? pathname === '/admin'
                  : pathname.startsWith(item.href);

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onNavigate}
                  className={cn(
                    'flex min-h-[44px] items-center gap-3 rounded-xl px-3 py-2.5 text-body-emphasis transition-colors duration-fast',
                    isActive
                      ? 'bg-white/15 text-white font-bold'
                      : 'text-white/60 hover:bg-white/10 hover:text-white',
                  )}
                  aria-current={isActive ? 'page' : undefined}
                >
                  <item.icon className="h-4 w-4 flex-shrink-0" />
                  <span>{item.label}</span>
                  {item.href === '/admin/support' && (openTickets ?? 0) > 0 && (
                    <span className="ml-auto rounded-full bg-error px-2 py-0.5 text-[11px] font-bold leading-none text-white" aria-label={`${openTickets} open tickets`}>
                      {openTickets}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        ))}

        <div className="mt-auto pt-2">
          <Link
            href="/"
            onClick={onNavigate}
            className="flex min-h-[44px] items-center gap-2 rounded-xl px-3 py-2.5 text-body-emphasis text-white/40 transition-colors duration-fast hover:bg-white/10 hover:text-white"
          >
            <ExternalLink className="h-4 w-4" />
            <span>Marketplace</span>
          </Link>
        </div>
      </nav>

      {/* User Footer */}
      <div className="border-t border-white/10 px-4 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-primary text-caption font-semibold text-white">
            {initials}
          </div>
          <div className="flex min-w-0 flex-col">
            <span className="truncate text-body-emphasis text-white">
              {user?.fullName ?? 'Admin'}
            </span>
            <button
              onClick={logout}
              className="text-left text-caption text-white/50 transition-colors duration-fast hover:text-error"
            >
              Sign out
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

/* The four pages an admin opens most on a phone; everything else is under More. */
const BOTTOM_ITEMS: NavItem[] = [
  { label: 'Home', href: '/admin', icon: BarChart3 },
  { label: 'Bookings', href: '/admin/bookings', icon: CalendarDays },
  { label: 'Community', href: '/admin/community', icon: Users },
  { label: 'Cafés', href: '/admin/cafes', icon: Store },
];

/** Name of the page you are on, for the phone top bar. Longest matching href wins. */
function currentPageLabel(pathname: string): string {
  let best: NavItem | null = null;
  for (const g of adminNavGroups) {
    for (const item of g.items) {
      const hit = item.href === '/admin' ? pathname === '/admin' : pathname.startsWith(item.href);
      if (hit && (!best || item.href.length > best.href.length)) best = item;
    }
  }
  return best?.label ?? 'KHEL-O Admin';
}

/* ── Admin Sidebar (desktop) ─────────────────────────────────────── */

function AdminSidebar() {
  return (
    <aside className="fixed left-0 top-0 z-nav hidden h-screen w-owner-sidebar flex-col border-r border-border bg-secondary lg:flex">
      {/* Brand */}
      <div className="border-b border-white/10 px-5 py-4">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-primary" />
          <span className="font-heading text-h3 text-white">KHEL-O Admin</span>
        </div>
        <div className="mt-1">
          <span className="inline-flex items-center gap-1 rounded-md bg-error/20 px-2 py-0.5 text-caption text-error">
            <ShieldCheck className="h-3 w-3" />
            Admin Role
          </span>
        </div>
      </div>

      <AdminNavBody />
    </aside>
  );
}

/* ── Mobile top bar + slide-in drawer ────────────────────────────────
   The sidebar is lg-only. Without this, an admin on a phone had NO
   navigation whatsoever — no way to reach the other 10 admin pages, and
   no way to sign out. */

function AdminMobileNav() {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);

  // Close the drawer whenever the route changes, so tapping a link doesn't
  // leave the overlay covering the page you just navigated to.
  useEffect(() => {
    setIsOpen(false);
  }, [pathname]);

  // Lock body scroll and wire Escape while the drawer is open.
  useEffect(() => {
    if (!isOpen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKey);
    };
  }, [isOpen]);

  return (
    <>
      <header className="sticky top-0 z-nav flex h-12 items-center justify-between border-b border-white/10 bg-secondary px-4 lg:hidden">
        <div className="flex min-w-0 items-center gap-2">
          <ShieldCheck className="h-4 w-4 flex-shrink-0 text-primary" />
          <span className="truncate font-heading text-body-emphasis font-bold text-white">{currentPageLabel(pathname)}</span>
        </div>
      </header>

      <nav
        className="safe-bottom fixed bottom-0 left-0 right-0 z-nav flex min-h-bottom-nav items-stretch justify-around border-t border-border bg-card lg:hidden"
        aria-label="Admin bottom navigation"
      >
        {BOTTOM_ITEMS.map((item) => {
          const isActive = item.href === '/admin' ? pathname === '/admin' : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex min-h-[48px] flex-1 flex-col items-center justify-center gap-0.5 px-1 py-1.5 transition-colors duration-fast',
                isActive ? 'text-primary' : 'text-text-secondary hover:text-text-primary',
              )}
              aria-current={isActive ? 'page' : undefined}
            >
              <span className={cn('flex items-center justify-center rounded-full px-3.5 py-1 transition-all duration-fast', isActive && 'bg-primary/12')}>
                <item.icon className="h-5 w-5" />
              </span>
              <span className={cn('text-caption', isActive ? 'font-bold' : 'font-medium')}>{item.label}</span>
            </Link>
          );
        })}
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          aria-label="All admin pages"
          className={cn(
            'flex min-h-[48px] flex-1 flex-col items-center justify-center gap-0.5 px-1 py-1.5 transition-colors',
            !BOTTOM_ITEMS.some((i) => (i.href === '/admin' ? pathname === '/admin' : pathname.startsWith(i.href))) ? 'text-primary' : 'text-text-secondary hover:text-text-primary',
          )}
        >
          <span className="flex items-center justify-center rounded-full px-3.5 py-1">
            <MoreHorizontal className="h-5 w-5" />
          </span>
          <span className="text-caption font-medium">More</span>
        </button>
      </nav>

      {isOpen && (
        <div className="fixed inset-0 z-overlay lg:hidden">
          <button
            type="button"
            aria-label="Close admin menu"
            onClick={() => setIsOpen(false)}
            className="absolute inset-0 h-full w-full cursor-default bg-black/60"
          />
          <aside
            className="absolute left-0 top-0 flex h-full w-[82%] max-w-xs flex-col bg-secondary shadow-overlay"
            role="dialog"
            aria-modal="true"
            aria-label="Admin navigation"
          >
            <div className="flex items-start justify-between border-b border-white/10 px-5 py-4">
              <div>
                <div className="flex items-center gap-2">
                  <ShieldCheck className="h-5 w-5 text-primary" />
                  <span className="font-heading text-h3 text-white">KHEL-O Admin</span>
                </div>
                <span className="mt-1 inline-flex items-center gap-1 rounded-md bg-error/20 px-2 py-0.5 text-caption text-error">
                  <ShieldCheck className="h-3 w-3" />
                  Admin Role
                </span>
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                aria-label="Close admin menu"
                className="-mr-2 flex h-11 w-11 items-center justify-center rounded-xl text-white/70 transition-colors hover:bg-white/10 hover:text-white active:scale-95"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <AdminNavBody onNavigate={() => setIsOpen(false)} />
          </aside>
        </div>
      )}
    </>
  );
}

/* ── Exported Shell ──────────────────────────────────────────────── */

export function AdminShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-surface">
      <AdminSidebar />
      <AdminMobileNav />

      {/* Main — offset by the sidebar on lg+; on mobile the sticky top bar
          above provides navigation instead. */}
      <main className="lg:pl-owner-sidebar">
        <div className="mx-auto w-full max-w-admin px-4 pb-[calc(6rem+env(safe-area-inset-bottom,0px))] pt-4 lg:px-8 lg:py-8">
          {children}
        </div>
      </main>
    </div>
  );
}
