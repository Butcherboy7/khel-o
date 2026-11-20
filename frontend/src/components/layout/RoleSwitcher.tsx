'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore, markRoleSwitch, type UserActiveRole } from '@/store/authStore';
import { Gamepad2, Store, Shield, Headset, RefreshCw, AlertCircle } from 'lucide-react';
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

export function RoleSwitcher() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const activeRole = useAuthStore((s) => s.activeRole);
  const switchActiveRole = useAuthStore((s) => s.switchActiveRole);

  const [isSwitching, setIsSwitching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Every account can use the app as a gamer (the server allows it even when no gamer role row exists, as for
  // owner-only accounts), so Gamer Mode is always on offer from any other mode.
  const availableRoles = Array.from(new Set([...(user?.roles || []), 'gamer'])) as UserActiveRole[];

  // One button for every other mode this account holds, labelled with where it goes. (The old single "cycle" button
  // vanished for accounts that hold only gamer + admin while in admin mode, leaving no way out.)
  const targets = (['gamer', 'cafe_owner', 'staff', 'admin'] as UserActiveRole[]).filter(
    (r) => availableRoles.includes(r) && r !== activeRole,
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
