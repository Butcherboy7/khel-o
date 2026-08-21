'use client';

import { useState, useEffect, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  ShieldCheck,
  Store,
  Users,
  BarChart3,
  CalendarDays,
  MessageSquare,
  CreditCard,
  UsersRound,
  ScrollText,
  ExternalLink,
  LifeBuoy,
  Settings,
  Menu,
  X,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/cn';
import { useAuthStore } from '@/store/authStore';

/* ── Navigation Items ────────────────────────────────────────────── */

interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
}

const adminNavItems: NavItem[] = [
  { label: 'Verification Queue', href: '/admin', icon: ShieldCheck },
  { label: 'All Cafés', href: '/admin/cafes', icon: Store },
  { label: 'Users', href: '/admin/users', icon: Users },
  { label: 'Staff', href: '/admin/staff', icon: UsersRound },
  { label: 'Bookings', href: '/admin/bookings', icon: CalendarDays },
  { label: 'Payments', href: '/admin/payments', icon: CreditCard },
  { label: 'Reviews', href: '/admin/reviews', icon: MessageSquare },
  { label: 'Analytics', href: '/admin/analytics', icon: BarChart3 },
  { label: 'Support', href: '/admin/support', icon: LifeBuoy },
  { label: 'Audit Log', href: '/admin/audit-log', icon: ScrollText },
  { label: 'Settings', href: '/admin/settings', icon: Settings },
];

/* ── Shared nav body (used by both the desktop sidebar and the mobile drawer) ── */

function AdminNavBody({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const { user, logout } = useAuthStore();

  const initials = user?.fullName
    ? user.fullName.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()
    : 'A';

  return (
    <>
      {/* Nav */}
      <nav className="flex flex-1 flex-col gap-1 overflow-y-auto px-3 py-4" aria-label="Admin navigation">
        {adminNavItems.map((item) => {
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
      <header className="sticky top-0 z-nav flex h-16 items-center justify-between border-b border-white/10 bg-secondary px-4 lg:hidden">
        <div className="flex min-w-0 items-center gap-2">
          <ShieldCheck className="h-5 w-5 flex-shrink-0 text-primary" />
          <span className="truncate font-heading text-h3 text-white">KHEL-O Admin</span>
        </div>
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          aria-label="Open admin menu"
          aria-expanded={isOpen}
          className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl text-white/80 transition-colors hover:bg-white/10 hover:text-white active:scale-95"
        >
          <Menu className="h-5 w-5" />
        </button>
      </header>

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
        <div className="mx-auto w-full max-w-admin px-4 py-6 lg:px-8 lg:py-8">
          {children}
        </div>
      </main>
    </div>
  );
}
