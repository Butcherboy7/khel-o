/**
 * What Quick Find remembers, on this device only: the last few searches and
 * how often each result was picked. Nothing here is sent anywhere. Storage can
 * be missing (private window, blocked site data) — every call copes.
 */

const KEY = 'khelo.quickFind.v1';
const MAX_RECENT = 6;
const MAX_USES = 80;

export interface QuickFindMemory {
  recent: string[];
  uses: Record<string, { n: number; at: number }>;
}

const empty = (): QuickFindMemory => ({ recent: [], uses: {} });

export function readMemory(): QuickFindMemory {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return empty();
    const parsed = JSON.parse(raw) as Partial<QuickFindMemory>;
    return {
      recent: Array.isArray(parsed.recent) ? parsed.recent.filter((r) => typeof r === 'string').slice(0, MAX_RECENT) : [],
      uses: parsed.uses && typeof parsed.uses === 'object' ? parsed.uses : {},
    };
  } catch {
    return empty();
  }
}

function write(mem: QuickFindMemory): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(mem));
  } catch {
    // Storage full or blocked: Quick Find still works, it just forgets.
  }
}

/** Remember that a search led somewhere (the query and the item picked). */
export function rememberPick(itemId: string, query: string): QuickFindMemory {
  const mem = readMemory();
  const q = query.trim();
  // Booking codes and long phrases are one-offs; keep short, reusable searches.
  if (q.length >= 2 && q.length <= 40 && !/\d{6,}/.test(q)) {
    mem.recent = [q, ...mem.recent.filter((r) => r.toLowerCase() !== q.toLowerCase())].slice(0, MAX_RECENT);
  }
  // Customer bookings are looked up live, not learned.
  if (!itemId.startsWith('booking:')) {
    const prev = mem.uses[itemId];
    mem.uses[itemId] = { n: (prev?.n ?? 0) + 1, at: Date.now() };
    const ids = Object.keys(mem.uses);
    if (ids.length > MAX_USES) {
      ids.sort((a, b) => mem.uses[a].at - mem.uses[b].at).slice(0, ids.length - MAX_USES).forEach((id) => delete mem.uses[id]);
    }
  }
  write(mem);
  return mem;
}

export function forgetRecent(query: string): QuickFindMemory {
  const mem = readMemory();
  mem.recent = mem.recent.filter((r) => r !== query);
  write(mem);
  return mem;
}

export function clearMemory(): QuickFindMemory {
  write(empty());
  return empty();
}

/** A small lift for things the owner keeps coming back to, never enough to beat a better text match. */
export function usageBoost(mem: QuickFindMemory, id: string, now = Date.now()): number {
  const u = mem.uses[id];
  if (!u) return 0;
  const freq = Math.min(0.12, 0.04 * Math.log2(1 + u.n));
  const days = (now - u.at) / 86_400_000;
  const fresh = days < 1 ? 0.05 : days < 7 ? 0.03 : 0;
  return freq + fresh;
}

/** Most-picked first, ties broken by most recent. */
export function topUsed(mem: QuickFindMemory, limit: number): string[] {
  return Object.entries(mem.uses)
    .sort((a, b) => b[1].n - a[1].n || b[1].at - a[1].at)
    .slice(0, limit)
    .map(([id]) => id);
}
