'use client';

import { useEffect, type ReactNode } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';
import type { UserRole } from '@/types';
import { Loader2 } from 'lucide-react';

interface AuthGuardProps {
  allowedRoles: UserRole[];
  children: ReactNode;
  fallbackPath?: string;
}

/**
 * AuthGuard protects route groups by role.
 * - Unauthenticated users are redirected to /login.
 * - Authenticated users with wrong role are redirected to their portal.
 * - Renders a minimal loading state during hydration to prevent flash.
 */
export function AuthGuard({
  allowedRoles,
  children,
  fallbackPath,
}: AuthGuardProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, isAuthenticated, isHydrated, isLoading } = useAuthStore();

  useEffect(() => {
    if (!isHydrated || isLoading) return;

    if (!isAuthenticated || !user) {
      router.replace(`/login?redirect=${encodeURIComponent(pathname)}`);
      return;
    }

    if (!allowedRoles.includes(user.role)) {
      const redirect = fallbackPath ?? getRoleDefaultPath(user.role);
      router.replace(redirect);
    }
  }, [isHydrated, isLoading, isAuthenticated, user, allowedRoles, fallbackPath, router, pathname]);

  // Show loading spinner during hydration
  if (!isHydrated || isLoading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-surface">
        <Loader2
          className="h-8 w-8 animate-spin text-primary"
          aria-label="Loading application"
        />
      </div>
    );
  }

  // Not authenticated or wrong role — guard will redirect
  if (!isAuthenticated || !user || !allowedRoles.includes(user.role)) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-surface">
        <Loader2
          className="h-8 w-8 animate-spin text-primary"
          aria-label="Redirecting"
        />
      </div>
    );
  }

  return <>{children}</>;
}

function getRoleDefaultPath(role: UserRole): string {
  switch (role) {
    case 'gamer':
      return '/';
    case 'cafe_owner':
      return '/owner/dashboard';
    case 'staff':
      return '/owner/bookings';
    case 'admin':
      return '/admin';
    default:
      return '/';
  }
}
