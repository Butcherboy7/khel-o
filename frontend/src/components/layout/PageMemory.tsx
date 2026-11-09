'use client';

import { Suspense, useEffect } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { rememberPage } from '@/lib/returnTo';

/** Keeps "where was I" up to date for the sign-in pages (see lib/returnTo.ts). */
function Memory() {
  const pathname = usePathname();
  const params = useSearchParams();
  useEffect(() => {
    rememberPage();
    window.addEventListener('hashchange', rememberPage);
    return () => window.removeEventListener('hashchange', rememberPage);
  }, [pathname, params]);
  return null;
}

export function PageMemory() {
  return (
    <Suspense fallback={null}>
      <Memory />
    </Suspense>
  );
}
