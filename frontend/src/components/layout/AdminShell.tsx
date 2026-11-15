'use client';

import { useState, useEffect, useRef, type ReactNode } from 'react';
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

/* Six areas instead of 24 links in 7 groups: the sidebar (and the phone menu)
   lists the areas, and the pages inside an area are tabs across the top of the
   page (AdminAreaTabs). Every page keeps its own URL. */
const adminNavGroups: NavGroup[] = [
  {
    label: 'Home',
    items: [
      { label: 'Overview', href: '/admin', icon: BarChart3 },
      { label: 'Applications', href: '/admin/verification-queue', icon: ShieldCheck },
      { label: 'Health', href: '/admin/marketplace-health', icon: Activity },
      { label: 'Support', href: '/admin/support', icon: LifeBuoy },
    ],
  },
  {
    label: 'Cafés',
    items: [
      { label: 'All cafés', href: '/admin/cafes', icon: Store },
      { label: 'Booking soon', href: '/admin/booking-soon', icon: Clock },
      { label: 'Demand', href: '/admin/leads', icon: Megaphone },
      { label: 'Setups', href: '/admin/inventory/setups', icon: Monitor },
      { label: 'Reviews', href: '/admin/reviews', icon: MessageSquare },
    ],
  },
  {
    label: 'Money',
    items: [
      { label: 'Bookings', href: '/admin/bookings', icon: CalendarDays },
      { label: 'Payments', href: '/admin/payments', icon: CreditCard },
      { label: 'Café payables', href: '/admin/cafe-payouts', icon: Banknote },
    ],
  },
  {
    label: 'Growth',
    items: [
      { label: 'Drops', href: '/admin/drops', icon: Rocket },
      { label: 'Offers', href: '/admin/promotions', icon: Tag },
      { label: 'Challenges', href: '/admin/challenges', icon: Trophy },
      { label: 'GTA 6 list', href: '/admin/launch-list', icon: Rocket },
      { label: 'Community', href: '/admin/community', icon: Users },
      { label: 'Emails', href: '/admin/community-email', icon: Megaphone },
      { label: 'Instagram', href: '/admin/instagram', icon: Clapperboard },
    ],
  },
  {
    label: 'Insights',
    items: [
      { label: 'Traffic', href: '/admin/analytics/traffic', icon: TrendingUp },
      { label: 'Campaigns', href: '/admin/analytics/ads', icon: Target },
      { label: 'Revenue', href: '/admin/analytics/revenue', icon: IndianRupee },
      { label: 'Areas', href: '/admin/analytics/geography', icon: MapPin },
      { label: 'Shares', href: '/admin/analytics/shares', icon: Share2 },
    ],
  },
  {
    label: 'Team',
    items: [
      { label: 'Users', href: '/admin/users', icon: Users },
      { label: 'Staff', href: '/admin/staff', icon: UsersRound },
      { label: 'Audit log', href: '/admin/audit-log', icon: ScrollText },
      { label: 'Settings', href: '/admin/settings', icon: Settings },
    ],
  },
];

const AREA_ICON: Record<string, LucideIcon> = {
  Home: BarChart3,
  'Cafés': Store,
  Money: IndianRupee,
  Growth: Rocket,
  Insights: TrendingUp,
  Team: UsersRound,
};

const isOn = (href: string, pathname: string) =>
  href === '/admin' ? pathname === '/admin' : pathname === href || pathname.startsWith(`${href}/`);

/** The page you are on and the area it belongs to. Longest matching href wins
 *  (/admin/analytics/ads beats /admin/analytics). Unlisted pages (old links like
 *  /admin/analytics or /admin/analytics/funnels) fall back by prefix. */
function locate(pathname: string): { group: NavGroup | null; item: NavItem | null } {
  let best: { group: NavGroup; item: NavItem } | null = null;
  for (const group of adminNavGroups) {
    for (const item of group.items) {
      if (isOn(item.href, pathname) && (!best || item.href.length > best.item.href.length)) best = { group, item };
    }
  }
  if (best) return best;
  if (pathname.startsWith('/admin/analytics')) return { group: adminNavGroups.find((g) => g.label === 'Insights') ?? null, item: null };
  return { group: null, item: null };
}

/* ── Shared nav body (used by both the desktop sidebar and the mobile drawer) ── */

function useOpenTickets(): number {
  return (
    useQuery({
      queryKey: ['admin', 'support', 'open-count'],
      queryFn: async () => (await apiClient.get('/api/v1/admin/support/open-count')).data?.data?.count as number,
      refetchInterval: 60_000,
      staleTime: 30_000,
    }).data ?? 0
  );
}

function AdminNavBody({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const { user, logout } = useAuthStore();
  const openTickets = useOpenTickets();
  const here = locate(pathname);

  const initials = user?.fullName
    ? user.fullName.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()
    : 'A';

  return (
    <>
      <nav className="flex flex-1 flex-col gap-1 overflow-y-auto px-3 py-4" aria-label="Admin navigation">
        {adminNavGroups.map((group) => {
          const Icon = AREA_ICON[group.label ?? ''] ?? BarChart3;
          const active = here.group === group;
          return (
            <div key={group.label}>
              <Link
                href={group.items[0].href}
                onClick={onNavigate}
                aria-current={active && !here.item ? 'page' : undefined}
                className={cn(
                  'flex min-h-[44px] items-center gap-3 rounded-xl px-3 py-2.5 text-body-emphasis transition-colors duration-fast',
                  active ? 'bg-white/15 font-bold text-white' : 'text-white/65 hover:bg-white/10 hover:text-white',
                )}
              >
                <Icon className="h-[18px] w-[18px] flex-shrink-0" aria-hidden />
                <span>{group.label}</span>
                {group.label === 'Home' && openTickets > 0 && (
                  <span
                    className="ml-auto rounded-full bg-error px-2 py-0.5 text-[11px] font-bold leading-none text-white"
                    aria-label={`${openTickets} open support tickets`}
                  >
                    {openTickets}
                  </span>
                )}
              </Link>
              {/* The pages inside the open area, so the sidebar still works as a map. */}
              {active && group.items.length > 1 && (
                <div className="ml-[21px] mt-1 flex flex-col border-l border-white/10 pl-3">
                  {group.items.map((item) => {
                    const on = here.item === item;
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={onNavigate}
                        aria-current={on ? 'page' : undefined}
                        className={cn(
                          'flex min-h-[40px] items-center rounded-lg px-2.5 text-caption transition-colors duration-fast',
                          on ? 'font-bold text-white' : 'text-white/55 hover:bg-white/10 hover:text-white',
                        )}
                      >
                        {item.label}
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}

        <div className="mt-auto pt-2">
          <Link
            href="/"
            onClick={onNavigate}
            className="flex min-h-[44px] items-center gap-2 rounded-xl px-3 py-2.5 text-body-emphasis text-white/40 transition-colors duration-fast hover:bg-white/10 hover:text-white"
          >
            <ExternalLink className="h-4 w-4" aria-hidden />
            <span>Open the site</span>
          </Link>
        </div>
      </nav>

      <div className="border-t border-white/10 px-4 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-primary text-caption font-semibold text-white">
            {initials}
          </div>
          <div className="flex min-w-0 flex-col">
            <span className="truncate text-body-emphasis text-white">{user?.fullName ?? 'Admin'}</span>
            <button
              type="button"
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

/* ── Area tabs: the pages inside the current area, across the top ── */

function AdminAreaTabs() {
  const pathname = usePathname();
  const openTickets = useOpenTickets();
  const { group, item } = locate(pathname);
  const activeRef = useRef<HTMLAnchorElement>(null);
  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [pathname]);
  if (!group || group.items.length < 2) return null;
  return (
    <nav
      aria-label={`${group.label} pages`}
      className="sticky top-12 z-20 -mx-4 mb-5 flex gap-1 overflow-x-auto border-b border-border bg-surface/95 px-4 py-2 backdrop-blur [scrollbar-width:none] lg:top-0 lg:-mx-8 lg:mb-6 lg:px-8"
    >
      {group.items.map((it) => {
        const on = it === item;
        return (
          <Link
            key={it.href}
            href={it.href}
            ref={on ? activeRef : undefined}
            aria-current={on ? 'page' : undefined}
            className={cn(
              'flex min-h-[44px] shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl px-3.5 text-body font-semibold transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
              on
                ? 'bg-card text-text-primary shadow-sm ring-1 ring-border'
                : 'text-text-secondary hover:bg-card/60 hover:text-text-primary',
            )}
          >
            <it.icon className={cn('hidden h-4 w-4 sm:block', on && 'text-primary')} aria-hidden />
            {it.label}
            {it.href === '/admin/support' && openTickets > 0 && (
              <span className="rounded-full bg-primary px-1.5 text-[11px] font-bold leading-5 text-white">{openTickets}</span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}

/* The areas an admin opens most on a phone; the rest are under More. */
const BOTTOM_AREAS = ['Home', 'Cafés', 'Money', 'Growth'];

/* ── Admin Sidebar (desktop) ─────────────────────────────────────── */

function AdminSidebar() {
  return (
    <aside className="fixed left-0 top-0 z-nav hidden h-screen w-owner-sidebar flex-col border-r border-border bg-secondary lg:flex">
      <div className="flex items-center gap-2 border-b border-white/10 px-5 py-4">
        <ShieldCheck className="h-5 w-5 text-primary" aria-hidden />
        <span className="font-heading text-h3 text-white">KHEL-O Admin</span>
      </div>
      <AdminNavBody />
    </aside>
  );
}

/* ── Mobile top bar, bottom bar and slide-in menu ─────────────────── */

function AdminMobileNav() {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const { group, item } = locate(pathname);

  // Close the menu whenever the route changes.
  useEffect(() => {
    setIsOpen(false);
  }, [pathname]);

  // Lock body scroll and wire Escape while the menu is open.
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

  const bottom = adminNavGroups.filter((g) => BOTTOM_AREAS.includes(g.label ?? ''));

  return (
    <>
      <header className="sticky top-0 z-nav flex h-12 items-center gap-2 border-b border-white/10 bg-secondary px-4 lg:hidden">
        <ShieldCheck className="h-4 w-4 flex-shrink-0 text-primary" aria-hidden />
        <span className="min-w-0 truncate font-heading text-body-emphasis font-bold text-white">
          {group?.label ?? 'KHEL-O Admin'}
          {item && <span className="font-normal text-white/60"> · {item.label}</span>}
        </span>
      </header>

      <nav
        className="safe-bottom fixed bottom-0 left-0 right-0 z-nav flex min-h-bottom-nav items-stretch justify-around border-t border-border bg-card lg:hidden"
        aria-label="Admin bottom navigation"
      >
        {bottom.map((g) => {
          const Icon = AREA_ICON[g.label ?? ''] ?? BarChart3;
          const active = g === group;
          return (
            <Link
              key={g.label}
              href={g.items[0].href}
              className={cn(
                'flex min-h-[48px] flex-1 flex-col items-center justify-center gap-0.5 px-1 py-1.5 transition-colors duration-fast',
                active ? 'text-primary' : 'text-text-secondary hover:text-text-primary',
              )}
              aria-current={active ? 'page' : undefined}
            >
              <span className={cn('flex items-center justify-center rounded-full px-3.5 py-1 transition-all duration-fast', active && 'bg-primary/12')}>
                <Icon className="h-5 w-5" aria-hidden />
              </span>
              <span className={cn('text-caption', active ? 'font-bold' : 'font-medium')}>{g.label}</span>
            </Link>
          );
        })}
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          aria-label="All admin areas"
          className={cn(
            'flex min-h-[48px] flex-1 flex-col items-center justify-center gap-0.5 px-1 py-1.5 transition-colors',
            group && !BOTTOM_AREAS.includes(group.label ?? '') ? 'text-primary' : 'text-text-secondary hover:text-text-primary',
          )}
        >
          <span className="flex items-center justify-center rounded-full px-3.5 py-1">
            <MoreHorizontal className="h-5 w-5" aria-hidden />
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
            <div className="flex items-center justify-between border-b border-white/10 px-5 py-3">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-primary" aria-hidden />
                <span className="font-heading text-h3 text-white">KHEL-O Admin</span>
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                aria-label="Close admin menu"
                className="-mr-2 flex h-11 w-11 items-center justify-center rounded-xl text-white/70 transition-colors hover:bg-white/10 hover:text-white active:scale-95"
              >
                <X className="h-5 w-5" aria-hidden />
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
      <main className="lg:pl-owner-sidebar">
        <div className="mx-auto w-full max-w-admin px-4 pb-[calc(6rem+env(safe-area-inset-bottom,0px))] lg:px-8 lg:pb-8">
          <AdminAreaTabs />
          {/* Pages without area tabs still need their top gap. */}
          <div className="pt-4 [nav+&]:pt-0 lg:pt-8 lg:[nav+&]:pt-0">{children}</div>
        </div>
      </main>
    </div>
  );
}
