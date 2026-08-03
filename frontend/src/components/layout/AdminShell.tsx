'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  ShieldCheck,
  Store,
  Users,
  BarChart3,
  ExternalLink,
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
  { label: 'Analytics', href: '/admin/analytics', icon: BarChart3 },
];

/* ── Admin Sidebar ───────────────────────────────────────────────── */

function AdminSidebar() {
  const pathname = usePathname();
  const { user, logout } = useAuthStore();

  const initials = user?.fullName
    ? user.fullName.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()
    : 'A';

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

      {/* Nav */}
      <nav className="flex flex-1 flex-col gap-1 px-3 py-4" aria-label="Admin navigation">
        {adminNavItems.map((item) => {
          const isActive =
            item.href === '/admin'
              ? pathname === '/admin'
              : pathname.startsWith(item.href);

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

        <div className="mt-auto">
          <Link
            href="/"
            className="flex items-center gap-2 rounded-xl px-3 py-2.5 text-body-emphasis text-white/40 transition-colors duration-fast hover:bg-white/10 hover:text-white"
          >
            <ExternalLink className="h-4 w-4" />
            <span>Marketplace</span>
          </Link>
        </div>
      </nav>

      {/* User Footer */}
      <div className="border-t border-white/10 px-4 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-caption font-semibold text-white">
            {initials}
          </div>
          <div className="flex flex-col">
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
    </aside>
  );
}

/* ── Exported Shell ──────────────────────────────────────────────── */

export function AdminShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-surface">
      <AdminSidebar />

      {/* Main — offset by sidebar. Admin is desktop-first, no mobile nav */}
      <main className="lg:pl-owner-sidebar">
        <div className="mx-auto w-full max-w-admin px-4 py-6 lg:px-8 lg:py-8">
          {children}
        </div>
      </main>
    </div>
  );
}
