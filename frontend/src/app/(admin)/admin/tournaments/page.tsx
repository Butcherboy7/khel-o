'use client';

import Link from 'next/link';
import { HostHome } from '@/components/tournaments/host/HostHome';

export default function Page() {
  return (
    <>
      <HostHome base="/admin/tournaments" title="Tournaments" />
      <Link href="/admin/tournaments/organisers" className="mx-auto mt-2 block max-w-5xl text-caption font-semibold text-primary">
        Manage organisers (companies and their staff) →
      </Link>
    </>
  );
}
