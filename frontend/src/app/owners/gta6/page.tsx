'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';

const GUIDE = '/owner/gta6-guide';

/**
 * The link to send café owners (khel-o.com/owners/gta6). Already signed in as an owner:
 * straight to the GTA 6 guide. Anyone else: the café owner sign-in, which opens the
 * guide right after they log in.
 */
export default function OwnersGta6Link() {
  const router = useRouter();
  const isHydrated = useAuthStore((s) => s.isHydrated);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const roles = useAuthStore((s) => s.user?.roles) as string[] | undefined;
  const role = useAuthStore((s) => s.user?.role) as string | undefined;

  useEffect(() => {
    if (!isHydrated) return;
    const owner = isAuthenticated && (role === 'cafe_owner' || role === 'staff' || roles?.includes('cafe_owner'));
    router.replace(owner ? GUIDE : `/login?owner=1&redirect=${encodeURIComponent(GUIDE)}`);
  }, [isHydrated, isAuthenticated, role, roles, router]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-primary" aria-label="Opening" />
    </div>
  );
}
