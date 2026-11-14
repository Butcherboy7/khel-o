'use client';

/**
 * Quick Find: one search box for the whole owner portal, like the search in
 * Android Settings. Type what you want ("tomorrow's bookings", "PS5 2 broken",
 * "opening hours") and go straight there — or straight into the flow, filled
 * in, ready for you to confirm.
 *
 * Opens from the header (Ctrl/⌘ K or / on a keyboard). Phone: full screen.
 * Desktop: a centred panel. Everything it knows lives in lib/quickFind.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeft,
  Ban,
  BarChart3,
  Bell,
  BookOpen,
  CalendarClock,
  CalendarDays,
  CircleDollarSign,
  Clock,
  CornerDownLeft,
  Eye,
  Gamepad2,
  GraduationCap,
  History,
  IndianRupee,
  Landmark,
  LayoutDashboard,
  LifeBuoy,
  Lock,
  MapPin,
  Monitor,
  OctagonAlert,
  PauseCircle,
  Plus,
  QrCode,
  Search,
  Settings,
  Share2,
  Sparkles,
  Star,
  Store,
  Swords,
  Tag,
  Ticket,
  User,
  Users,
  Wallet,
  Wrench,
  X,
  XCircle,
  Image as ImageIcon,
  Armchair,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/cn';
import { useDebounce } from '@/hooks/useDebounce';
import { getOwnerAvailabilityTimeline } from '@/lib/api/owner';
import { listOwnerDrops } from '@/lib/api/drops';
import { getHostingChallenges } from '@/lib/api/challenges';
import { searchCheckinCandidates } from '@/lib/api/scanner';
import { useOwnerTourStore } from '@/store/ownerTourStore';
import { parseQuery, istToday } from '@/lib/quickFind/parse';
import { buildItems, suggestions, type QFContext, type QFIcon, type QFItem } from '@/lib/quickFind/registry';
import { rank, sections, highlight, type QFSection } from '@/lib/quickFind/search';
import { clearMemory, forgetRecent, readMemory, rememberPick, topUsed, type QuickFindMemory } from '@/lib/quickFind/history';

/* ── Context ───────────────────────────────────────────────────────────── */

interface QuickFindApi {
  open: (initial?: string) => void;
  close: () => void;
  isOpen: boolean;
  isStaff: boolean;
}

const QuickFindContext = createContext<QuickFindApi | null>(null);

export function useQuickFind(): QuickFindApi {
  const ctx = useContext(QuickFindContext);
  return ctx ?? { open: () => {}, close: () => {}, isOpen: false, isStaff: false };
}

const OWNER_HINTS = ['opening time', "tomorrow's bookings", 'PS5 2 broken', 'sell PS5 1 for 2 hours', 'change price', 'new offer', 'add staff', 'payouts', 'pause bookings'];
const STAFF_HINTS = ["today's bookings", 'scan a pass', 'free slots', 'PS5 2 broken', 'not paid'];

/**
 * The search box's placeholder, teaching by example: after a moment it starts
 * cycling real things owners type ("Try “opening time”"), so nobody has to be
 * told what Quick Find can do. Starts on the plain sentence (same on the server).
 */
export function SearchHint({ fallback = 'Search anything or do something…' }: { fallback?: string }) {
  const { isStaff } = useQuickFind();
  const list = isStaff ? STAFF_HINTS : OWNER_HINTS;
  const [i, setI] = useState(-1);
  useEffect(() => {
    let n = -1;
    const first = window.setTimeout(() => setI((n = 0)), 2500);
    const tick = window.setInterval(() => {
      if (n >= 0 && document.visibilityState === 'visible') setI((n = (n + 1) % list.length));
    }, 3200);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(tick);
    };
  }, [list.length]);
  if (i < 0) return <span className="min-w-0 flex-1 truncate">{fallback}</span>;
  return (
    <span key={i} className="qf-fade min-w-0 flex-1 truncate" aria-hidden="true">
      Try <span className="font-semibold text-text-primary">“{list[i]}”</span>
    </span>
  );
}

/** "⌘ K" on a Mac, "Ctrl K" elsewhere. Empty until mounted (no hydration mismatch). */
export function useShortcutLabel(): string {
  const [label, setLabel] = useState('');
  useEffect(() => {
    const mac = typeof navigator !== 'undefined' && /mac|iphone|ipad/i.test(navigator.platform || navigator.userAgent);
    setLabel(mac ? '⌘ K' : 'Ctrl K');
  }, []);
  return label;
}

export function QuickFindProvider({ isStaff, children }: { isStaff: boolean; children: ReactNode }) {
  const [isOpen, setOpen] = useState(false);
  const [initial, setInitial] = useState('');
  const open = useCallback((q?: string) => {
    setInitial(q ?? '');
    setOpen(true);
  }, []);
  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setInitial('');
        setOpen((v) => !v);
        return;
      }
      if (e.key === '/' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const t = e.target as HTMLElement | null;
        const typing = t && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName));
        if (!typing && !document.querySelector('[role="dialog"][aria-modal="true"]')) {
          e.preventDefault();
          setInitial('');
          setOpen(true);
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const api = useMemo(() => ({ open, close, isOpen, isStaff }), [open, close, isOpen, isStaff]);
  return (
    <QuickFindContext.Provider value={api}>
      {children}
      {isOpen && <QuickFindPalette isStaff={isStaff} initial={initial} onClose={close} />}
    </QuickFindContext.Provider>
  );
}

/* ── Icons ─────────────────────────────────────────────────────────────── */

const ICONS: Record<QFIcon, LucideIcon> = {
  dashboard: LayoutDashboard, scan: QrCode, bookings: CalendarDays, calendar: CalendarDays, slots: CalendarClock,
  setups: Monitor, add: Plus, wrench: Wrench, price: IndianRupee, offer: Tag, drop: Ticket, walkin: Users, block: Ban,
  clock: Clock, pause: PauseCircle, emergency: OctagonAlert, team: Users, wallet: Wallet, bank: Landmark,
  settings: Settings, store: Store, map: MapPin, photo: ImageIcon, games: Gamepad2, star: Star, chart: BarChart3,
  bell: Bell, help: LifeBuoy, tutorial: GraduationCap, lock: Lock, share: Share2, cancel: XCircle,
  unpaid: CircleDollarSign, user: User, challenge: Swords, seats: Armchair, guide: BookOpen, eye: Eye,
};

const EXAMPLES = ["tomorrow's bookings", 'PS5 2 broken', 'opening hours', 'change PC price', 'pause bookings'];

/* ── Data ──────────────────────────────────────────────────────────────── */

function useQuickFindData(isStaff: boolean, query: string) {
  const today = istToday();
  const setupsQ = useQuery({
    queryKey: ['quickfind', 'setups', today],
    queryFn: () => getOwnerAvailabilityTimeline({ date: today }),
    staleTime: 60_000,
  });
  const dropsQ = useQuery({
    queryKey: ['owner', 'drops'],
    queryFn: listOwnerDrops,
    enabled: !isStaff,
    staleTime: 60_000,
  });
  const hostingQ = useQuery({
    queryKey: ['owner', 'hosting-challenges'],
    queryFn: getHostingChallenges,
    enabled: !isStaff,
    staleTime: 5 * 60_000,
  });

  // Today's bookings by name or phone, once the owner pauses typing. Only
  // queries that look like a person (letters, or a long number) go to the server.
  const debounced = useDebounce(query.trim(), 260);
  const looksLikePerson = /^[a-z][a-z .]{2,40}$/i.test(debounced) || /^\+?\d{6,13}$/.test(debounced);
  const bookingsQ = useQuery({
    queryKey: ['quickfind', 'bookings', debounced],
    queryFn: () => searchCheckinCandidates(debounced),
    enabled: looksLikePerson,
    staleTime: 20_000,
  });

  const ctx: QFContext = useMemo(
    () => ({
      role: isStaff ? 'staff' : 'owner',
      hostingChallenge: Boolean(hostingQ.data?.length),
      setups: (setupsQ.data?.tiers ?? [])
        .filter((t) => !t.id.startsWith('drop-'))
        .map((t) => ({
          id: t.id,
          name: t.name,
          platform: t.platform,
          model: t.model,
          tierType: t.tierType,
          isRoom: t.isRoom,
          pricePerHour: t.pricePerHour,
          totalSeats: t.totalSeats,
        })),
      drops: (dropsQ.data?.drops ?? []).map((d) => ({
        id: d.id,
        title: d.title,
        game: d.game,
        status: d.status,
        flexible: Boolean(d.maxHours),
        startsOn: d.startsOn,
        endsOn: d.endsOn,
        consoles: (d.consoles ?? []).map((c) => ({ key: c.key, label: c.label, platform: c.platform, setup: c.setup })),
      })),
      bookings: looksLikePerson && bookingsQ.data
        ? bookingsQ.data.slice(0, 5).map((b) => ({
            id: b.id,
            reference: b.bookingReference,
            name: b.gamerName,
            phone: b.gamerPhone,
            startTime: b.startTime,
            endTime: b.endTime,
            status: b.status,
          }))
        : [],
    }),
    [isStaff, hostingQ.data, setupsQ.data, dropsQ.data, bookingsQ.data, looksLikePerson],
  );

  const searchingPeople = looksLikePerson && (bookingsQ.isFetching || debounced !== query.trim());
  const liveFailed = setupsQ.isError || dropsQ.isError;
  return { ctx, searchingPeople, liveFailed, liveLoading: setupsQ.isLoading || (!isStaff && dropsQ.isLoading) };
}

/* ── Palette ───────────────────────────────────────────────────────────── */

interface Row {
  item: QFItem;
  optionId: string;
}

function QuickFindPalette({ isStaff, initial, onClose }: { isStaff: boolean; initial: string; onClose: () => void }) {
  const router = useRouter();
  const startTour = useOwnerTourStore((s) => s.start);
  const [query, setQuery] = useState(initial);
  const [active, setActive] = useState(0);
  const [mem, setMem] = useState<QuickFindMemory>(() => readMemory());
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const previouslyFocused = useRef<HTMLElement | null>(null);
  // After a pick the next page owns focus; only a plain close hands it back.
  const picked = useRef(false);

  const { ctx, searchingPeople, liveFailed, liveLoading } = useQuickFindData(isStaff, query);
  const parsed = useMemo(() => parseQuery(query), [query]);
  const items = useMemo(() => buildItems(ctx, parsed), [ctx, parsed]);
  const byId = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const hasQuery = query.trim().length > 0;

  const resultSections: QFSection[] = useMemo(
    () => (hasQuery ? sections(rank(items, parsed, mem)) : []),
    [hasQuery, items, parsed, mem],
  );

  // Empty box: what this owner uses most, then actions worth knowing about.
  const emptySections = useMemo(() => {
    if (hasQuery) return [];
    const s = suggestions(ctx);
    const used = topUsed(mem, 6).filter((id) => byId.has(id));
    const frequent = Array.from(new Set([...used, ...s.frequent])).slice(0, 4);
    const actions = s.actions.filter((id) => byId.has(id) && !frequent.includes(id)).slice(0, 4);
    const toResults = (ids: string[]) => ids.map((id) => ({ item: byId.get(id)!, score: 0 })).filter((r) => r.item);
    const out: QFSection[] = [];
    if (frequent.length) out.push({ key: 'pages', label: used.length ? 'You use these most' : 'Most used', results: toResults(frequent) });
    if (actions.length) out.push({ key: 'action', label: 'Quick actions', results: toResults(actions) });
    return out;
  }, [hasQuery, ctx, mem, byId]);

  const shown = hasQuery ? resultSections : emptySections;
  const rows: Row[] = useMemo(
    () => shown.flatMap((s) => s.results.map((r) => ({ item: r.item, optionId: `${listId}-${s.key}-${r.item.id}` }))),
    [shown, listId],
  );

  useEffect(() => setActive(0), [query]);
  useEffect(() => {
    if (active >= rows.length) setActive(Math.max(0, rows.length - 1));
  }, [rows.length, active]);

  // Focus, scroll lock and focus return.
  useEffect(() => {
    previouslyFocused.current = document.activeElement as HTMLElement | null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const t = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => {
      window.clearTimeout(t);
      document.body.style.overflow = prevOverflow;
      if (!picked.current) previouslyFocused.current?.focus?.({ preventScroll: true });
    };
  }, []);

  useEffect(() => {
    const el = rows[active] && document.getElementById(rows[active].optionId);
    el?.scrollIntoView({ block: 'nearest' });
  }, [active, rows]);

  const choose = useCallback(
    (item: QFItem) => {
      setMem(rememberPick(item.id, query));
      picked.current = true;
      (document.activeElement as HTMLElement | null)?.blur?.();
      onClose();
      if (item.run === 'tutorial') {
        router.push('/owner/dashboard');
        startTour();
        return;
      }
      router.push(item.href);
    },
    [query, onClose, router, startTour],
  );

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
      return;
    }
    if (e.key === 'ArrowDown' || (e.key === 'n' && e.ctrlKey)) {
      e.preventDefault();
      setActive((a) => (rows.length ? (a + 1) % rows.length : 0));
    } else if (e.key === 'ArrowUp' || (e.key === 'p' && e.ctrlKey)) {
      e.preventDefault();
      setActive((a) => (rows.length ? (a - 1 + rows.length) % rows.length : 0));
    } else if (e.key === 'PageDown') {
      e.preventDefault();
      setActive((a) => Math.min(rows.length - 1, a + 5));
    } else if (e.key === 'PageUp') {
      e.preventDefault();
      setActive((a) => Math.max(0, a - 5));
    } else if (e.key === 'Enter' && document.activeElement === inputRef.current) {
      const row = rows[active];
      if (row) {
        e.preventDefault();
        choose(row.item);
      }
    } else if (e.key === 'Tab') {
      const focusable = panelRef.current?.querySelectorAll<HTMLElement>('input, button:not([disabled]), [href]');
      if (!focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  };

  const activeRow = rows[active];
  let rowIndex = -1;

  return (
    <div
      className="fixed inset-0 z-modal flex flex-col lg:items-center lg:justify-start lg:px-6 lg:pt-[12vh]"
      role="dialog"
      aria-modal="true"
      aria-label="Quick Find"
      onKeyDown={onKeyDown}
    >
      <div
        className="qf-fade absolute inset-0 hidden bg-secondary/55 backdrop-blur-[2px] lg:block"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        ref={panelRef}
        className={cn(
          'qf-enter relative flex h-[100dvh] w-full flex-col bg-card',
          'lg:h-auto lg:max-h-[min(620px,78vh)] lg:max-w-[680px] lg:rounded-2xl lg:border lg:border-border lg:shadow-overlay',
        )}
      >
        {/* Search row */}
        <div className="flex items-center gap-1 border-b border-border px-2 pb-2 pt-[calc(0.5rem+env(safe-area-inset-top,0px))] lg:gap-2 lg:px-4 lg:py-3">
          <button
            type="button"
            onClick={onClose}
            className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl text-text-secondary transition-colors hover:bg-surface hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary lg:hidden"
            aria-label="Close Quick Find"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <Search className="hidden h-5 w-5 flex-shrink-0 text-text-secondary lg:block" aria-hidden />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search anything or do something…"
            role="combobox"
            aria-expanded={rows.length > 0}
            aria-controls={listId}
            aria-activedescendant={activeRow?.optionId}
            aria-autocomplete="list"
            aria-label="Search anything or do something"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="go"
            className="h-11 min-w-0 flex-1 bg-transparent px-1 text-[16px] font-medium text-text-primary caret-primary placeholder:font-normal placeholder:text-text-secondary/80 focus:outline-none lg:text-[17px]"
          />
          {hasQuery && (
            <button
              type="button"
              onClick={() => {
                setQuery('');
                inputRef.current?.focus();
              }}
              className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl text-text-secondary transition-colors hover:bg-surface hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary lg:h-8 lg:w-8"
              aria-label="Clear search"
            >
              <X className="h-4 w-4" />
            </button>
          )}
          <kbd className="hidden flex-shrink-0 rounded-md border border-border bg-surface px-1.5 py-0.5 font-sans text-[11px] font-semibold text-text-secondary lg:block">
            Esc
          </kbd>
        </div>

        {/* Results */}
        <div className="flex-1 overflow-y-auto overscroll-contain px-2 pb-[calc(1rem+env(safe-area-inset-bottom,0px))] pt-1 lg:pb-2">
          {!hasQuery && mem.recent.length > 0 && (
            <div className="px-2 pb-1 pt-3">
              <div className="flex items-center justify-between">
                <h3 className="text-caption font-semibold text-text-secondary">Recent searches</h3>
                <button
                  type="button"
                  onClick={() => setMem(clearMemory())}
                  className="min-h-[32px] rounded-lg px-2 text-caption font-semibold text-text-secondary hover:bg-surface hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  Clear history
                </button>
              </div>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {mem.recent.map((r) => (
                  <span key={r} className="inline-flex items-center rounded-full border border-border bg-card">
                    <button
                      type="button"
                      onClick={() => {
                        setQuery(r);
                        inputRef.current?.focus();
                      }}
                      className="inline-flex min-h-[36px] items-center gap-1.5 rounded-l-full pl-3 pr-1.5 text-caption font-medium text-text-primary hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    >
                      <History className="h-3.5 w-3.5 text-text-secondary" aria-hidden />
                      {r}
                    </button>
                    <button
                      type="button"
                      onClick={() => setMem(forgetRecent(r))}
                      className="flex h-9 w-8 items-center justify-center rounded-r-full text-text-secondary hover:bg-surface hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                      aria-label={`Remove “${r}” from recent searches`}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            </div>
          )}

          <ul id={listId} role="listbox" aria-label="Quick Find results" className="flex flex-col">
            {shown.map((section) => (
              <li key={section.key + section.label} role="presentation" className="pt-2">
                <h3 id={`${listId}-h-${section.key}`} className="px-2 pb-1 pt-1.5 text-caption font-semibold text-text-secondary">
                  {section.label}
                </h3>
                <ul role="group" aria-labelledby={`${listId}-h-${section.key}`}>
                  {section.results.map((r) => {
                    rowIndex += 1;
                    const i = rowIndex;
                    return (
                      <ResultRow
                        key={r.item.id}
                        id={rows[i]?.optionId}
                        item={r.item}
                        best={section.key === 'best'}
                        ranges={hasQuery ? highlight(r.item.title, parsed) : []}
                        active={i === active}
                        onHover={() => setActive(i)}
                        onPick={() => choose(r.item)}
                      />
                    );
                  })}
                </ul>
              </li>
            ))}
          </ul>

          {hasQuery && searchingPeople && (
            <p className="flex items-center gap-2 px-3 py-2.5 text-caption text-text-secondary" role="status">
              <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-border border-t-primary" aria-hidden />
              Looking through today&apos;s bookings…
            </p>
          )}

          {hasQuery && !rows.length && !searchingPeople && (
            <div className="flex flex-col items-start gap-3 px-3 py-6" role="status">
              <p className="text-body-emphasis text-text-primary">Nothing for “{query.trim()}”</p>
              <p className="text-caption text-text-secondary">Try fewer words, or one of these:</p>
              <Examples onPick={setQuery} />
              <button
                type="button"
                onClick={() => choose(byId.get('help') ?? items[0])}
                className="inline-flex min-h-[40px] items-center gap-1.5 text-caption font-semibold text-primary-dark underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <LifeBuoy className="h-4 w-4" aria-hidden /> Ask KHEL-O instead
              </button>
            </div>
          )}

          {!hasQuery && (
            <div className="px-3 pb-2 pt-4">
              <p className="mb-2 flex items-center gap-1.5 text-caption text-text-secondary">
                <Sparkles className="h-3.5 w-3.5" aria-hidden /> Type it the way you&apos;d say it. Try:
              </p>
              <Examples onPick={setQuery} />
            </div>
          )}

          {liveFailed && (
            <p className="px-3 pt-2 text-caption text-text-secondary">
              Couldn&apos;t load your setups and drops just now. Pages and settings still work.
            </p>
          )}
          {liveLoading && hasQuery && !liveFailed && (
            <p className="px-3 pt-2 text-caption text-text-secondary">Loading your setups…</p>
          )}
        </div>

        {/* Keyboard legend (desktop) */}
        <div className="hidden items-center justify-between gap-4 border-t border-border px-4 py-2 text-[12px] text-text-secondary lg:flex">
          <span className="flex items-center gap-3">
            <span className="flex items-center gap-1"><Kbd>↑</Kbd><Kbd>↓</Kbd> move</span>
            <span className="flex items-center gap-1"><Kbd>↵</Kbd> open</span>
            <span className="flex items-center gap-1"><Kbd>Esc</Kbd> close</span>
          </span>
          <span>Nothing changes until you confirm it.</span>
        </div>
      </div>
    </div>
  );
}

function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-flex min-w-[20px] items-center justify-center rounded border border-border bg-surface px-1 font-sans text-[11px] font-semibold text-text-secondary">
      {children}
    </kbd>
  );
}

function Examples({ onPick }: { onPick: (q: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {EXAMPLES.map((e) => (
        <button
          key={e}
          type="button"
          onClick={() => onPick(e)}
          className="min-h-[36px] rounded-full bg-surface px-3 text-caption font-medium text-text-primary transition-colors hover:bg-border/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          {e}
        </button>
      ))}
    </div>
  );
}

function Highlighted({ text, ranges }: { text: string; ranges: [number, number][] }) {
  if (!ranges.length) return <>{text}</>;
  const parts: ReactNode[] = [];
  let at = 0;
  ranges.forEach(([a, b], i) => {
    if (a > at) parts.push(text.slice(at, a));
    parts.push(
      <mark key={i} className="bg-transparent font-bold text-primary-dark">
        {text.slice(a, b)}
      </mark>,
    );
    at = b;
  });
  if (at < text.length) parts.push(text.slice(at));
  return <>{parts}</>;
}

function ResultRow({
  id,
  item,
  best,
  ranges,
  active,
  onHover,
  onPick,
}: {
  id?: string;
  item: QFItem;
  best: boolean;
  ranges: [number, number][];
  active: boolean;
  onHover: () => void;
  onPick: () => void;
}) {
  const Icon = ICONS[item.icon] ?? Search;
  return (
    <li
      id={id}
      role="option"
      aria-selected={active}
      onMouseMove={onHover}
      onClick={onPick}
      className={cn(
        'group flex min-h-[56px] cursor-pointer select-none items-center gap-3 rounded-xl px-2.5 py-2 transition-colors duration-100 lg:min-h-[52px]',
        active ? 'bg-primary/10' : 'hover:bg-surface',
      )}
    >
      <span
        className={cn(
          'flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl transition-colors',
          best || active ? 'bg-primary/15 text-primary-dark' : 'bg-surface text-text-secondary',
        )}
        aria-hidden
      >
        <Icon className="h-[18px] w-[18px]" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-body-emphasis text-text-primary">
          <Highlighted text={item.title} ranges={ranges} />
        </span>
        <span className="line-clamp-2 text-caption text-text-secondary sm:line-clamp-1">
          {item.description}
          <span className="hidden sm:inline"> · {item.where}</span>
        </span>
      </span>
      {item.kind === 'flow' && (
        <span className="hidden flex-shrink-0 rounded-full border border-border px-2 py-0.5 text-[11px] font-semibold text-text-secondary sm:inline">
          You confirm
        </span>
      )}
      <CornerDownLeft
        className={cn('hidden h-4 w-4 flex-shrink-0 text-primary-dark lg:block', active ? 'opacity-100' : 'opacity-0')}
        aria-hidden
      />
    </li>
  );
}
