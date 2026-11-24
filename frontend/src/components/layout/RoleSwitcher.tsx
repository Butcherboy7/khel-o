'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore, markRoleSwitch, type UserActiveRole } from '@/store/authStore';
import { Gamepad2, Store, Shield, Headset, RefreshCw, AlertCircle, ArrowLeftRight } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';

const ROLE_META: Record<
  UserActiveRole,
  { label: string; badge: string; icon: typeof Gamepad2; color: string; route: string }
> = {
  gamer: { label: 'Gamer Mode', badge: 'Gamer', icon: Gamepad2, color: 'emerald', route: '/' },
  cafe_owner: { label: 'Owner Portal', badge: 'Owner', icon: Store, color: 'amber', route: '/owner/dashboard' },
  staff: { label: 'Staff Portal', badge: 'Staff', icon: Headset, color: 'sky', route: '/owner/dashboard' },
  admin: { label: 'Admin Panel', badge: 'Admin', icon: Shield, color: 'rose', route: '/admin' },
};

const COLOR_CLASSES: Record<string, string> = {
  emerald: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20',
  amber: 'bg-amber-500/10 border-amber-500/30 text-amber-400 hover:bg-amber-500/20',
  sky: 'bg-sky-500/10 border-sky-500/30 text-sky-400 hover:bg-sky-500/20',
  rose: 'bg-rose-500/10 border-rose-500/30 text-rose-400 hover:bg-rose-500/20',
};

const BADGE_VARIANT: Record<string, 'success' | 'warning' | 'secondary' | 'error'> = {
  emerald: 'success',
  amber: 'warning',
  sky: 'secondary',
  rose: 'error',
};

export function RoleSwitcher({ compact = false }: { compact?: boolean }) {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const activeRole = useAuthStore((s) => s.activeRole);
  const switchActiveRole = useAuthStore((s) => s.switchActiveRole);

  const [isSwitching, setIsSwitching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const away = (e: Event) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', away);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('pointerdown', away); document.removeEventListener('keydown', esc); };
  }, [open]);

  // Every account can use the app as a gamer (the server allows it even when no gamer role row exists, as for
  // owner-only accounts), so Gamer Mode is always on offer from any other mode.
  const availableRoles = Array.from(new Set([...(user?.roles || []), 'gamer'])) as UserActiveRole[];

  // One button for every other mode this account holds, labelled with where it goes. (The old single "cycle" button
  // vanished for accounts that hold only gamer + admin while in admin mode, leaving no way out.)
  // An admin only ever needs Gamer and Admin: Owner/Staff pills are noise for them.
  const isAdmin = availableRoles.includes('admin');
  const targets = (['gamer', 'cafe_owner', 'staff', 'admin'] as UserActiveRole[]).filter(
    (r) => availableRoles.includes(r) && r !== activeRole && !(isAdmin && (r === 'cafe_owner' || r === 'staff')),
  );

  if (!user || targets.length === 0) {
    return null;
  }

  // Entering any mode is a context switch through /auth/switch-role: the backend re-verifies the role and issues a
  // token whose activeRole matches, which AuthGuard needs. A bare link left the old role and bounced the user back out.
  const handleSwitch = async (role: UserActiveRole) => {
    setError(null);
    setIsSwitching(true);
    markRoleSwitch();
    try {
      await switchActiveRole(role);
      router.push(ROLE_META[role].route);
    } catch (err: any) {
      setError(err?.message || "You don't have permission to switch to that mode");
    } finally {
      setIsSwitching(false);
    }
  };

  // Tight headers (the customer top bar on a phone) get one small icon that opens the list, so two or three wide
  // pills never wrap over the logo and the greeting.
  if (compact) {
    return (
      <div ref={box} className="relative">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label="Switch mode"
          title="Switch mode"
          className="flex h-9 w-9 items-center justify-center rounded-full bg-surface text-text-secondary transition hover:bg-border/60 hover:text-text-primary active:scale-95"
        >
          {isSwitching ? <RefreshCw className="h-4 w-4 animate-spin" /> : <ArrowLeftRight className="h-4 w-4" />}
        </button>
        {open && (
          <div role="menu" className="absolute right-0 top-full z-50 mt-2 w-52 overflow-hidden rounded-2xl border border-border bg-card p-1 shadow-overlay">
            <p className="px-3 pb-1 pt-2 text-caption font-semibold text-text-secondary">Switch to</p>
            {targets.map((role) => {
              const meta = ROLE_META[role];
              const Icon = meta.icon;
              return (
                <button
                  key={role}
                  type="button"
                  role="menuitem"
                  disabled={isSwitching}
                  onClick={async () => { setOpen(false); await handleSwitch(role); }}
                  className="flex min-h-[44px] w-full items-center gap-2.5 rounded-xl px-3 text-left text-body font-semibold text-text-primary transition hover:bg-surface active:bg-border/60 disabled:opacity-60"
                >
                  <Icon className="h-4 w-4 text-text-secondary" />
                  {meta.label}
                </button>
              );
            })}
            {error && (
              <p className="flex items-center gap-1 px-3 py-2 text-caption font-medium text-error">
                <AlertCircle className="h-3 w-3" />
                {error}
              </p>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="relative inline-flex flex-wrap items-center gap-1.5">
      {targets.map((role) => {
        const meta = ROLE_META[role];
        const Icon = meta.icon;
        return (
          <button
            key={role}
            type="button"
            onClick={() => handleSwitch(role)}
            disabled={isSwitching}
            className={`flex min-h-[36px] items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-semibold transition-all duration-200 shadow-sm active:scale-95 disabled:opacity-60 [@media(pointer:coarse)]:min-h-[44px] [@media(pointer:coarse)]:px-3.5 ${COLOR_CLASSES[meta.color]}`}
            title={`Switch to ${meta.label}`}
          >
            {isSwitching ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Icon className="h-3.5 w-3.5" />}
            <span className="inline">{meta.label}</span>
            <Badge variant={BADGE_VARIANT[meta.color]} size="sm" className="hidden sm:inline-flex ml-1 py-0 px-1.5">
              {meta.badge}
            </Badge>
          </button>
        );
      })}

      {error && (
        <span className="text-caption text-rose-400 flex items-center gap-1 font-medium">
          <AlertCircle className="h-3 w-3" />
          <span>{error}</span>
        </span>
      )}
    </div>
  );
}
