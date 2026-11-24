'use client';

import { useParams } from 'next/navigation';
import { AuthGuard } from '@/components/layout/AuthGuard';
import { TeamScanner } from '@/components/challenge/team/TeamScanner';

/** Door scanner. Signed in as KHELO staff, an admin or the café's owner. */
export default function ScanPage() {
  const { slug } = useParams<{ slug: string }>();
  return (
    <AuthGuard allowedRoles={['cafe_owner', 'staff', 'admin']}>
      <TeamScanner slug={slug} />
    </AuthGuard>
  );
}
