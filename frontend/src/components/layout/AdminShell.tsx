'use client';

import { useState, useEffect, useRef, useCallback, type ReactNode } from 'react';
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
  LayoutGrid,
  LogOut,
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
  BellRing,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { enablePush, resolvePushState, resyncPushSubscription, type PushState } from '@/lib/alerts/subscribe';
import { apiClient } from '@/lib/api/client';
import { cn } from '@/lib/cn';
import { useAuthStore } from '@/store/authStore';
import { RoleSwitcher } from '@/components/layout/RoleSwitcher';
import { NavSheet, initialsOf, useBarLifted, BAR_ABOVE_SHEET } from '@/components/layout/NavSheet';

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
      { label: 'GTA 6 requests', href: '/admin/gta6-requests', icon: Rocket },
      { label: 'Café suggestions', href: '/admin/cafe-suggestions', icon: Store },
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

/** Things waiting for the admin, by page. Drives the red counts so nothing sits unseen. */
function useAdminBadges(): Record<string, number> {
  const tickets = useOpenTickets();
  const requests =
    useQuery({
      queryKey: ['admin', 'gta6-requests', 'waiting-count'],
      queryFn: async () => (await apiClient.get('/api/v1/admin/gta6-requests/waiting-count')).data?.data?.count as number,
      refetchInterval: 30_000,
      staleTime: 15_000,
    }).data ?? 0;
  return { '/admin/support': tickets, '/admin/gta6-requests': requests };
}

const groupBadge = (g: { items: { href: string }[] }, b: Record<string, number>) =>
  g.items.reduce((n, it) => n + (b[it.href] ?? 0), 0);

function Count({ n, className = '' }: { n: number; className?: string }) {
  if (n <= 0) return null;
  return (
    <span
      className={cn('inline-flex min-w-[20px] items-center justify-center rounded-full bg-error px-1.5 text-[11px] font-bold leading-5 text-white', className)}
      aria-label={`${n} waiting`}
    >
      {n > 99 ? '99+' : n}
    </span>
  );
}

function AdminNavBody({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const { user, logout } = useAuthStore();
  const badges = useAdminBadges();
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
                <Count n={groupBadge(group, badges)} className="ml-auto" />
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
                        <Count n={badges[item.href] ?? 0} className="ml-auto" />
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
        <div className="mt-3">
          <RoleSwitcher />
        </div>
      </div>
    </>
  );
}

/* ── Area tabs: the pages inside the current area, across the top ── */

function AdminAreaTabs() {
  const pathname = usePathname();
  const badges = useAdminBadges();
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
            <Count n={badges[it.href] ?? 0} />
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

  const close = useCallback(() => setIsOpen(false), []);
  const lifted = useBarLifted(isOpen);

  // Close the menu whenever the route changes.
  useEffect(() => {
    setIsOpen(false);
  }, [pathname]);

  const bottom = adminNavGroups.filter((g) => BOTTOM_AREAS.includes(g.label ?? ''));
  const badges = useAdminBadges();
  const moreWaiting = adminNavGroups
    .filter((g) => !BOTTOM_AREAS.includes(g.label ?? ''))
    .reduce((n, g) => n + groupBadge(g, badges), 0);

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
        className={cn(
          'safe-bottom fixed bottom-0 left-0 right-0 flex min-h-bottom-nav items-stretch justify-around border-t border-border bg-card lg:hidden',
          lifted ? BAR_ABOVE_SHEET : 'z-nav',
        )}
        aria-label="Admin bottom navigation"
        // Any tap on the bar while the sheet is up also puts the sheet away.
        // (More itself toggles; React re-renders between this and its onClick.)
        onClickCapture={(e) => {
          if (isOpen && !(e.target as Element).closest('[aria-haspopup="dialog"]')) close();
        }}
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
              <span className={cn('relative flex items-center justify-center rounded-full px-3.5 py-1 transition-all duration-fast', active && 'bg-primary/12')}>
                <Icon className="h-5 w-5" aria-hidden />
                {groupBadge(g, badges) > 0 && (
                  <span className="absolute right-1 top-0 h-2.5 w-2.5 rounded-full bg-error ring-2 ring-card" aria-label={`${groupBadge(g, badges)} waiting`} />
                )}
              </span>
              <span className={cn('text-caption', active ? 'font-bold' : 'font-medium')}>{g.label}</span>
            </Link>
          );
        })}
        <button
          type="button"
          onClick={() => setIsOpen((o) => !o)}
          aria-label="All admin areas"
          aria-haspopup="dialog"
          aria-expanded={isOpen}
          className={cn(
            'flex min-h-[48px] flex-1 flex-col items-center justify-center gap-0.5 px-1 py-1.5 transition-colors',
            isOpen || (group && !BOTTOM_AREAS.includes(group.label ?? '')) ? 'text-primary' : 'text-text-secondary hover:text-text-primary',
          )}
        >
          <span
            className={cn(
              'relative flex items-center justify-center rounded-full px-3.5 py-1 transition-all duration-fast',
              (isOpen || (group && !BOTTOM_AREAS.includes(group.label ?? ''))) && 'bg-primary/12',
            )}
          >
            <LayoutGrid className="h-5 w-5" aria-hidden />
            {moreWaiting > 0 && <span className="absolute right-1 top-0 h-2.5 w-2.5 rounded-full bg-error ring-2 ring-card" aria-label={`${moreWaiting} waiting`} />}
          </span>
          <span className={cn('text-caption', group && !BOTTOM_AREAS.includes(group.label ?? '') ? 'font-bold' : 'font-medium')}>More</span>
        </button>
      </nav>

      <NavSheet
        open={isOpen}
        onClose={close}
        label="All admin areas"
        header={
          <div className="flex items-center justify-between px-5 pb-2 pt-1">
            <div>
              <p className="text-overline uppercase tracking-widest text-text-tertiary">KHEL-O Admin</p>
              <h2 className="font-heading text-h3 text-text-primary">Go to</h2>
            </div>
            <button
              type="button"
              onClick={close}
              aria-label="Close menu"
              className="-mr-1 flex h-11 w-11 items-center justify-center rounded-full bg-card text-text-secondary shadow-sm ring-1 ring-border transition-transform hover:text-text-primary active:scale-95"
            >
              <X className="h-5 w-5" aria-hidden />
            </button>
          </div>
        }
      >
        <AdminSheetBody onNavigate={close} />
      </NavSheet>
    </>
  );
}

/** What the phone's More sheet holds: every area as a tile, then you. */
function AdminSheetBody({ onNavigate }: { onNavigate: () => void }) {
  const pathname = usePathname();
  const { user, logout } = useAuthStore();
  const badges = useAdminBadges();
  const here = locate(pathname);

  return (
    <div className="flex flex-col gap-4 pt-2">
      <ul className="grid grid-cols-3 gap-2.5" aria-label="Areas">
        {adminNavGroups.map((g) => {
          const Icon = AREA_ICON[g.label ?? ''] ?? BarChart3;
          const on = here.group === g;
          const badge = groupBadge(g, badges);
          return (
            <li key={g.label}>
              <Link
                href={g.items[0].href}
                onClick={onNavigate}
                aria-current={on ? 'true' : undefined}
                className={cn(
                  'relative flex aspect-[1/0.92] flex-col justify-between rounded-2xl p-3 transition-[transform,box-shadow] duration-fast active:scale-[0.97]',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface',
                  on ? 'bg-secondary text-white shadow-md' : 'bg-card text-text-primary shadow-sm ring-1 ring-border',
                )}
              >
                <span
                  className={cn(
                    'flex h-10 w-10 items-center justify-center rounded-xl',
                    on ? 'bg-primary text-white' : 'bg-primary/10 text-primary',
                  )}
                >
                  <Icon className="h-5 w-5" aria-hidden />
                </span>
                <span className="flex flex-col">
                  <span className="font-heading text-body-emphasis font-bold leading-tight">{g.label}</span>
                  <span className={cn('truncate text-caption', on ? 'text-white/65' : 'text-text-tertiary')}>
                    {on && here.item ? here.item.label : `${g.items.length} pages`}
                  </span>
                </span>
                {badge > 0 && (
                  <span
                    className="absolute right-2.5 top-2.5 rounded-full bg-error px-1.5 text-[11px] font-bold leading-5 text-white"
                    aria-label={`${badge} waiting`}
                  >
                    {badge}
                  </span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>

      {/* You: kept apart from the areas, sign-out last and on its own. */}
      <div className="flex flex-col gap-3 rounded-2xl bg-secondary p-4 text-white">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 flex-none items-center justify-center rounded-full bg-primary text-caption font-bold">
            {initialsOf(user?.fullName, user?.email, 'A')}
          </span>
          <span className="flex min-w-0 flex-col">
            <span className="truncate text-body-emphasis font-semibold">{user?.fullName ?? 'Admin'}</span>
            <span className="text-caption text-white/55">Admin</span>
          </span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Link
            href="/"
            onClick={onNavigate}
            className="flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-white/10 px-3 text-body font-semibold text-white transition-colors hover:bg-white/15"
          >
            <ExternalLink className="h-4 w-4" aria-hidden />
            Open the site
          </Link>
          <button
            type="button"
            onClick={() => {
              onNavigate();
              logout();
            }}
            className="flex min-h-[44px] items-center justify-center gap-2 rounded-xl px-3 text-body font-semibold text-rose-300 ring-1 ring-inset ring-rose-300/30 transition-colors hover:bg-rose-400/10"
          >
            <LogOut className="h-4 w-4" aria-hidden />
            Sign out
          </button>
        </div>
        <RoleSwitcher />
      </div>
    </div>
  );
}

/* ── Phone alerts: nobody is ever subscribed until they tap this once ── */

function AdminAlertsPrompt() {
  const [state, setState] = useState<PushState | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  useEffect(() => {
    let off = false;
    resolvePushState().then((s) => {
      if (off) return;
      setState(s);
      // Heal a browser subscription whose server row was pruned.
      if (s === 'granted') resyncPushSubscription().catch(() => undefined);
    });
    return () => {
      off = true;
    };
  }, []);
  if (state === null || state === 'granted' || state === 'unsupported') return null;
  const turnOn = async () => {
    setBusy(true);
    setNote(null);
    try {
      const r = await enablePush();
      if (r === 'granted') setState('granted');
      else if (r === 'denied') setState('denied');
      else setNote(r === 'unconfigured' ? 'Alerts are not set up on this server.' : 'This phone cannot receive alerts.');
    } catch {
      setNote('Could not turn on alerts. Try again.');
    } finally {
      setBusy(false);
    }
  };
  const denied = state === 'denied';
  return (
    <div className="mb-4 flex items-center gap-3 rounded-2xl bg-card p-3 shadow-sm ring-1 ring-border lg:mt-8">
      <span className="flex h-10 w-10 flex-none items-center justify-center rounded-xl bg-primary/10 text-primary">
        <BellRing className="h-5 w-5" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-body-emphasis font-bold text-text-primary">{denied ? 'Alerts are blocked on this phone' : 'Get alerts on this phone'}</p>
        <p className="text-caption text-text-secondary">
          {note ?? (denied ? 'Allow notifications for KHEL-O in the phone settings, then reload.' : 'New GTA 6 requests and support tickets, with sound.')}
        </p>
      </div>
      {!denied && (
        <button
          type="button"
          onClick={turnOn}
          disabled={busy}
          className="btn-depth min-h-[44px] flex-none rounded-xl bg-primary px-4 text-body font-bold text-white disabled:opacity-60"
        >
          {busy ? 'Turning on…' : 'Turn on'}
        </button>
      )}
    </div>
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
          <AdminAlertsPrompt />
          <AdminAreaTabs />
          {/* Pages without area tabs still need their top gap. */}
          <div className="pt-4 [nav+&]:pt-0 lg:pt-8 lg:[nav+&]:pt-0">{children}</div>
        </div>
      </main>
    </div>
  );
}
