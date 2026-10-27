/** Small browser-side memories for the challenge sign-up (all optional, never required). */

/** localStorage key: this browser tapped "Join the community" for a challenge. */
export const communityTappedKey = (slug: string) => `khelo_community_${slug}`;

export function hasTappedCommunity(slug: string): boolean {
  try {
    return localStorage.getItem(communityTappedKey(slug)) === '1';
  } catch {
    return false;
  }
}

export function markCommunityTapped(slug: string): void {
  try {
    localStorage.setItem(communityTappedKey(slug), '1');
  } catch {
    /* private mode: the reminder just shows again */
  }
}

export type SignInMethod = 'google' | 'form';
const LAST_SIGNIN_KEY = 'khelo_last_signup_method';

/** How this browser signed up last time, for the "Last used" tag. */
export function lastSignInMethod(): SignInMethod | null {
  try {
    const v = localStorage.getItem(LAST_SIGNIN_KEY);
    return v === 'google' || v === 'form' ? v : null;
  } catch {
    return null;
  }
}

export function rememberSignInMethod(m: SignInMethod): void {
  try {
    localStorage.setItem(LAST_SIGNIN_KEY, m);
  } catch {
    /* ignore */
  }
}
