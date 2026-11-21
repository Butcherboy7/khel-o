/** A friend's invite code from ?inv=<code>, kept in this browser until the person signs in.
 * First touch wins for 30 days, so the friend who actually brought them gets the credit. */
const KEY = 'khelo.inv';
const DAYS = 30;

export function rememberInvite(code: string) {
  if (!/^[0-9a-f]{10}$/.test(code)) return;
  try {
    const old = JSON.parse(localStorage.getItem(KEY) || 'null') as { code: string; at: number } | null;
    if (old && Date.now() - old.at < DAYS * 864e5) return;
    localStorage.setItem(KEY, JSON.stringify({ code, at: Date.now() }));
  } catch {
    /* storage blocked: the link just isn't credited */
  }
}

export function storedInvite(): string | null {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || 'null') as { code: string; at: number } | null;
    return v && Date.now() - v.at < DAYS * 864e5 ? v.code : null;
  } catch {
    return null;
  }
}

export function forgetInvite() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* nothing to clear */
  }
}
