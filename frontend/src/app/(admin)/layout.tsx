import type { ReactNode } from 'react';
import { AuthGuard } from '@/components/layout/AuthGuard';
import { AdminShell } from '@/components/layout/AdminShell';

/**
 * Admin portal layout.
 * Strictly admin role only — any other role redirects to their default portal.
 */
export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <AuthGuard allowedRoles={['admin']}>
      <AdminShell>{children}</AdminShell>
    </AuthGuard>
  );
}
