'use client';

import { useEffect, useRef } from 'react';
import { useAuthStore } from '@/store/authStore';
import { claimReferral } from '@/lib/api/referrals';
import { trackAction } from '@/lib/api/analyticsEvents';
import { forgetInvite, storedInvite } from '@/lib/referral';

/** Once someone who came from a friend's link is signed in, tell the server who brought them.
 * The server decides if it counts (new account, not their own link...); either way we forget the code. */
export function ReferralClaimer() {
  const user = useAuthStore((s) => s.user);
  const tried = useRef<string | null>(null);

  useEffect(() => {
    if (!user?.id || tried.current === user.id) return;
    const code = storedInvite();
    if (!code) return;
    tried.current = user.id;
    claimReferral(code)
      .then((r) => {
        forgetInvite();
        trackAction('referral_claim', { status: r.status });
      })
      .catch(() => {
        // Network or server trouble: keep the code and try again on the next page load.
        tried.current = null;
      });
  }, [user?.id]);

  return null;
}
