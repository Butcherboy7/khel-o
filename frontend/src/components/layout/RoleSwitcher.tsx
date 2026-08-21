'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore, type UserActiveRole } from '@/store/authStore';
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

  const availableRoles = (user?.roles || []) as UserActiveRole[];

  // Admin is deliberately NOT in the cycle: it is not a "mode" a user toggles
  // into. Accounts that hold it get an explicit, separate Admin entry point.
  const cycleOrder: UserActiveRole[] = ['gamer', 'cafe_owner', 'staff'];
  const ownedInOrder = cycleOrder.filter((r) => availableRoles.includes(r));
  const hasAdminRole = availableRoles.includes('admin');
  const hasMultipleCyclableRoles = ownedInOrder.length > 1;

  if (!user || (!hasMultipleCyclableRoles && !hasAdminRole)) {
    return null;
  }

  // Cycle to the next role the account actually has, in a stable order
  const currentIdx = ownedInOrder.indexOf(activeRole);
  const nextRole = ownedInOrder[(currentIdx + 1) % ownedInOrder.length] || ownedInOrder[0];

  const handleCycleRole = async () => {
    setError(null);
    setIsSwitching(true);

    try {
      await switchActiveRole(nextRole);
      router.push(ROLE_META[nextRole].route);
    } catch (err: any) {
      setError(err?.message || 'Failed to switch portal mode');
    } finally {
      setIsSwitching(false);
    }
  };

  // Entering the admin workspace is a CONTEXT switch, not a navigation. It must
  // go through /auth/switch-role so the backend re-verifies the admin
  // entitlement against user_roles and issues a token whose activeRole is
  // 'admin'. A bare <Link href="/admin"> left activeRole as 'cafe_owner', and
  // AuthGuard (which gates on activeRole) bounced the user straight back out —
  // that is why a legitimate admin lost access to /admin entirely.
  const handleEnterAdmin = async () => {
    setError(null);
    setIsSwitching(true);

    try {
      await switchActiveRole('admin');
      router.push(ROLE_META.admin.route);
    } catch (err: any) {
      setError(err?.message || "You don't have permission to access Admin");
    } finally {
      setIsSwitching(false);
    }
  };

  const meta = ROLE_META[activeRole] || ROLE_META.gamer;
  const Icon = meta.icon;
  const adminMeta = ROLE_META.admin;
  const AdminIcon = adminMeta.icon;
  const isInAdminWorkspace = activeRole === 'admin';

  return (
    <div className="relative inline-flex items-center gap-1.5">
      {hasMultipleCyclableRoles && (
        <button
          onClick={handleCycleRole}
          disabled={isSwitching}
          className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-full border text-[11px] sm:text-xs font-semibold transition-all duration-200 shadow-sm active:scale-95 ${COLOR_CLASSES[meta.color]}`}
          title={`Click to switch to ${ROLE_META[nextRole].label}`}
        >
          {isSwitching ? (
            <RefreshCw className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Icon className="h-3.5 w-3.5" />
          )}

          <span className="inline">{meta.label}</span>

          <Badge
            variant={BADGE_VARIANT[meta.color]}
            size="sm"
            className="hidden sm:inline-flex ml-1 text-[10px] uppercase py-0 px-1.5"
          >
            {meta.badge}
          </Badge>
        </button>
      )}

      {hasAdminRole && !isInAdminWorkspace && (
        <button
          type="button"
          onClick={handleEnterAdmin}
          disabled={isSwitching}
          className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-full border text-[11px] sm:text-xs font-semibold transition-all duration-200 shadow-sm active:scale-95 disabled:opacity-60 ${COLOR_CLASSES[adminMeta.color]}`}
          title={adminMeta.label}
        >
          {isSwitching ? (
            <RefreshCw className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <AdminIcon className="h-3.5 w-3.5" />
          )}
          <span className="inline">{adminMeta.label}</span>
          <Badge
            variant={BADGE_VARIANT[adminMeta.color]}
            size="sm"
            className="hidden sm:inline-flex ml-1 text-[10px] uppercase py-0 px-1.5"
          >
            {adminMeta.badge}
          </Badge>
        </button>
      )}

      {error && (
        <span className="text-[10px] text-rose-400 flex items-center gap-1 font-medium">
          <AlertCircle className="h-3 w-3" />
          <span>{error}</span>
        </span>
      )}
    </div>
  );
}
