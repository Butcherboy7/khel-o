const STORAGE_KEY = 'khelo:seen-alerts';

/** Long enough to cover a push arriving, the 60s dashboard poll surfacing the
 *  same booking, and a reload in between. Short enough that a genuinely new
 *  event reusing an id is not suppressed for the rest of the shift. */
export const ALERT_TTL_MS = 10 * 60 * 1000;

type SeenMap = Record<string, number>;

function read(): SeenMap {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as SeenMap) : {};
  } catch {
    // Private mode, blocked storage, corrupt JSON. Degrading to "always alert"
    // is the right failure: a duplicate chime beats a missed booking.
    return {};
  }
}

function write(map: SeenMap): void {
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    /* ignore */
  }
}

/**
 * True the first time a dedupe key is seen within the TTL window, false after.
 * Prunes expired keys on every call so the map cannot grow without bound.
 */
export function shouldAlert(key: string, now: number = Date.now()): boolean {
  if (!key) return true;

  const seen = read();
  const pruned: SeenMap = {};
  for (const [k, ts] of Object.entries(seen)) {
    if (now - ts < ALERT_TTL_MS) pruned[k] = ts;
  }

  const alreadySeen = pruned[key] !== undefined;
  pruned[key] = now;
  write(pruned);

  return !alreadySeen;
}
