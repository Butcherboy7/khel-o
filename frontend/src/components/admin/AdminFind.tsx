'use client';

/**
 * Admin Find: one search for the whole admin. Ctrl/⌘ K or "/" opens it.
 * Type a page ("payables"), a job ("refund"), a person, a phone number,
 * a café, a booking ref or a Razorpay id. A phone number opens everything
 * we hold for it in one panel, with Call / WhatsApp / Copy.
 */
import { createContext, useCallback, useContext, useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeft,
  ArrowUpRight,
  Check,
  ChevronRight,
  Copy,
  CornerDownLeft,
  History,
  Loader2,
  MessageCircle,
  Phone,
  Search,
  X,
  Zap,
} from 'lucide-react';
import { adminPerson, adminSearch, type AdminSearchGroup, type AdminSearchItem } from '@/lib/api/admin';
import { findAdminItems, type AdminFindItem } from '@/lib/adminFind/registry';
import { useDebounce } from '@/hooks/useDebounce';
import { cn } from '@/lib/cn';

const RECENT_KEY = 'khelo.adminFind.recent';
const SUGGESTED = ['users', 'conversion', 'bookings', 'payables', 'gta6-requests', 'applications'];

function readRecent(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string').slice(0, 6) : [];
  } catch {
    return [];
  }
}
function saveRecent(q: string) {
  try {
    const next = [q, ...readRecent().filter((x) => x.toLowerCase() !== q.toLowerCase())].slice(0, 6);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    /* private mode: no history, search still works */
  }
}

/** "9848022338" → "+91 98480 22338"; anything else as typed. */
export function prettyPhone(p: string): string {
  const d = p.replace(/\D/g, '');
  const ten = d.length === 12 && d.startsWith('91') ? d.slice(2) : d.length === 11 && d.startsWith('0') ? d.slice(1) : d;
  return ten.length === 10 ? `+91 ${ten.slice(0, 5)} ${ten.slice(5)}` : p;
}
function waNumber(p: string): string {
  const d = p.replace(/\D/g, '');
  return d.length === 10 ? `91${d}` : d;
}

interface Ctx {
  open: (initial?: string) => void;
}
const AdminFindContext = createContext<Ctx>({ open: () => {} });
export const useAdminFind = () => useContext(AdminFindContext);

export function AdminFindProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{ open: boolean; initial: string }>({ open: false, initial: '' });
  const open = useCallback((initial = '') => setState({ open: true, initial }), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLElement && (e.target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName));
      if ((e.key === 'k' || e.key === 'K') && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setState((s) => ({ open: !s.open, initial: '' }));
      } else if (e.key === '/' && !typing && !document.querySelector('[role="dialog"][aria-modal="true"]')) {
        e.preventDefault();
        setState({ open: true, initial: '' });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <AdminFindContext.Provider value={{ open }}>
      {children}
      {state.open && <AdminFindDialog initial={state.initial} onClose={() => setState({ open: false, initial: '' })} />}
    </AdminFindContext.Provider>
  );
}

type Row =
  | { type: 'nav'; item: AdminFindItem; optionId: string }
  | { type: 'record'; item: AdminSearchItem; group: AdminSearchGroup; optionId: string }
  | { type: 'person'; digits: string; optionId: string }
  | { type: 'recent'; query: string; optionId: string };

function AdminFindDialog({ initial, onClose }: { initial: string; onClose: () => void }) {
  const router = useRouter();
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState(initial);
  const [active, setActive] = useState(0);
  const [person, setPerson] = useState<string | null>(null);
  const [recent, setRecent] = useState<string[]>([]);
  const debounced = useDebounce(query.trim(), 220);
  const q = query.trim();

  useEffect(() => {
    setRecent(readRecent());
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    inputRef.current?.focus();
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const server = useQuery({
    queryKey: ['admin', 'find', debounced],
    queryFn: ({ signal }) => adminSearch(debounced, signal),
    enabled: debounced.length >= 2,
    staleTime: 30_000,
  });

  const nav = useMemo(() => findAdminItems(q), [q]);
  // Only show records for what is in the box now (not a half-typed earlier query).
  const current = debounced === q && server.data ? server.data : null;
  const groups = useMemo(() => current?.groups ?? [], [current]);
  const phoneDigits = current?.kind === 'phone' ? current.digits ?? null : null;
  const waiting = q.length >= 2 && (debounced !== q || server.isFetching);

  const rows: Row[] = useMemo(() => {
    const out: Row[] = [];
    if (!q) {
      recent.forEach((r, i) => out.push({ type: 'recent', query: r, optionId: `${listId}-r${i}` }));
      return out;
    }
    if (phoneDigits && phoneDigits.length >= 7) out.push({ type: 'person', digits: phoneDigits, optionId: `${listId}-p` });
    // A number search shows people first; a word search shows pages first.
    if (!phoneDigits) nav.forEach((item, i) => out.push({ type: 'nav', item, optionId: `${listId}-n${i}` }));
    groups.forEach((g, gi) => g.items.forEach((item, i) => out.push({ type: 'record', item, group: g, optionId: `${listId}-g${gi}-${i}` })));
    return out;
  }, [q, recent, nav, groups, phoneDigits, listId]);

  useEffect(() => setActive(0), [q, groups.length]);

  const go = (href: string) => {
    if (q) saveRecent(q);
    onClose();
    router.push(href);
  };

  const choose = (row: Row | undefined) => {
    if (!row) return;
    if (row.type === 'recent') setQuery(row.query);
    else if (row.type === 'nav') go(row.item.href);
    else if (row.type === 'person') {
      if (q) saveRecent(q);
      setPerson(row.digits);
    } else if (row.item.kind === 'user' || row.item.kind === 'contact') {
      if (row.item.phone && row.item.phone.replace(/\D/g, '').length >= 7) {
        if (q) saveRecent(q);
        setPerson(row.item.phone);
      } else go(row.item.href);
    } else go(row.item.href);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      if (person) setPerson(null);
      else onClose();
    } else if (!person && e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => Math.min(rows.length - 1, a + 1));
    } else if (!person && e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(0, a - 1));
    } else if (!person && e.key === 'Enter') {
      e.preventDefault();
      choose(rows[active]);
    }
  };

  useEffect(() => {
    const el = document.getElementById(rows[active]?.optionId ?? '');
    el?.scrollIntoView({ block: 'nearest' });
  }, [active, rows]);

  let seenGroup = '';
  return (
    <div
      className="fixed inset-0 z-modal flex flex-col lg:items-center lg:justify-start lg:px-6 lg:pt-[10vh]"
      role="dialog"
      aria-modal="true"
      aria-label="Search admin"
      onKeyDown={onKeyDown}
    >
      <div className="qf-fade absolute inset-0 hidden bg-secondary/55 backdrop-blur-[2px] lg:block" onClick={onClose} aria-hidden="true" />
      <div
        className={cn(
          'qf-enter relative flex h-[100dvh] w-full flex-col bg-card',
          'lg:h-auto lg:max-h-[min(680px,80vh)] lg:max-w-[720px] lg:rounded-2xl lg:border lg:border-border lg:shadow-overlay',
        )}
      >
        <div className="flex items-center gap-1 border-b border-border px-2 pb-2 pt-[calc(0.5rem+env(safe-area-inset-top,0px))] lg:gap-2 lg:px-4 lg:py-3">
          <button
            type="button"
            onClick={() => (person ? setPerson(null) : onClose())}
            className={cn(
              'flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl text-text-secondary hover:bg-surface hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
              !person && 'lg:hidden',
            )}
            aria-label={person ? 'Back to results' : 'Close search'}
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          {!person && <Search className="hidden h-5 w-5 flex-shrink-0 text-text-secondary lg:block" aria-hidden />}
          {person ? (
            <p className="flex-1 truncate px-1 text-[16px] font-semibold text-text-primary">{prettyPhone(person)}</p>
          ) : (
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Find a person, number, café, booking or page…"
              role="combobox"
              aria-expanded={rows.length > 0}
              aria-controls={listId}
              aria-activedescendant={rows[active]?.optionId}
              aria-autocomplete="list"
              aria-label="Search admin"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="search"
              className="h-11 min-w-0 flex-1 bg-transparent px-1 text-[16px] font-medium text-text-primary caret-primary placeholder:font-normal placeholder:text-text-secondary/80 focus:outline-none lg:text-[17px]"
            />
          )}
          {waiting && !person && <Loader2 className="h-4 w-4 flex-shrink-0 animate-spin text-text-secondary" aria-label="Searching" />}
          {q && !person && (
            <button
              type="button"
              onClick={() => {
                setQuery('');
                inputRef.current?.focus();
              }}
              className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl text-text-secondary hover:bg-surface hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary lg:h-8 lg:w-8"
              aria-label="Clear search"
            >
              <X className="h-4 w-4" />
            </button>
          )}
          <kbd className="hidden flex-shrink-0 rounded-md border border-border bg-surface px-1.5 py-0.5 font-sans text-[11px] font-semibold text-text-secondary lg:block">Esc</kbd>
        </div>

        <div className="flex-1 overflow-y-auto overscroll-contain px-2 pb-[calc(1rem+env(safe-area-inset-bottom,0px))] pt-1 lg:pb-2">
          {person ? (
            <PersonPanel phone={person} onGo={go} />
          ) : (
            <ul id={listId} role="listbox" aria-label="Results" className="flex flex-col">
              {!q && (
                <>
                  {recent.length > 0 && <GroupLabel>Recent searches</GroupLabel>}
                  {rows.map((row, i) =>
                    row.type === 'recent' ? (
                      <Option key={row.optionId} row={row} active={i === active} onHover={() => setActive(i)} onChoose={() => choose(row)}>
                        <History className="h-4 w-4 text-text-secondary" aria-hidden />
                        <span className="truncate text-body text-text-primary">{row.query}</span>
                      </Option>
                    ) : null,
                  )}
                  <GroupLabel>Jump to</GroupLabel>
                  <div className="flex flex-wrap gap-2 px-2 pb-3">
                    {SUGGESTED.map((id) => {
                      const item = findAdminItems(id)[0];
                      return item ? (
                        <button
                          key={id}
                          type="button"
                          onClick={() => go(item.href)}
                          className="min-h-[36px] rounded-full border border-border bg-surface px-3 text-caption font-semibold text-text-primary hover:border-text-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                        >
                          {item.title}
                        </button>
                      ) : null;
                    })}
                  </div>
                  <p className="px-3 pb-2 text-caption text-text-secondary">
                    Try a name, the last digits of a phone number, a café, a booking ref like KH…, or a Razorpay id.
                  </p>
                </>
              )}
              {q &&
                rows.map((row, i) => {
                  const header =
                    row.type === 'nav'
                      ? 'Pages and actions'
                      : row.type === 'record'
                        ? row.group.label
                        : row.type === 'person'
                          ? 'This number'
                          : '';
                  const showHeader = header !== seenGroup;
                  seenGroup = header;
                  const group = row.type === 'record' ? row.group : null;
                  const lastOfGroup = group && rows[i + 1]?.type === 'record' ? (rows[i + 1] as { group: AdminSearchGroup }).group !== group : !!group;
                  return (
                    <li key={row.optionId} className="contents">
                      {showHeader && <GroupLabel>{header}</GroupLabel>}
                      <Option row={row} active={i === active} onHover={() => setActive(i)} onChoose={() => choose(row)}>
                        <RowBody row={row} />
                      </Option>
                      {lastOfGroup && group && group.more && group.seeAll && (
                        <button
                          type="button"
                          onClick={() => go(group.seeAll!)}
                          className="mx-2 mb-1 flex min-h-[36px] items-center gap-1 rounded-lg px-2 text-caption font-semibold text-primary hover:bg-surface"
                        >
                          See all {group.label.toLowerCase()} <ChevronRight className="h-3.5 w-3.5" aria-hidden />
                        </button>
                      )}
                    </li>
                  );
                })}
              {q.length >= 2 && !waiting && rows.length === 0 && (
                <div className="px-3 py-8 text-center">
                  <p className="text-body font-semibold text-text-primary">Nothing for “{q}”</p>
                  <p className="mt-1 text-caption text-text-secondary">
                    Check the spelling, try fewer words, or the last 4 digits of a number.
                  </p>
                </div>
              )}
              {q.length === 1 && nav.length === 0 && (
                <p className="px-3 py-6 text-center text-caption text-text-secondary">Keep typing…</p>
              )}
              {server.isError && q.length >= 2 && (
                <p className="px-3 py-3 text-caption text-error">Couldn&apos;t search records just now. Pages still work; try again in a moment.</p>
              )}
            </ul>
          )}
        </div>
        {!person && (
          <div className="hidden items-center gap-4 border-t border-border px-4 py-2 text-[11px] text-text-secondary lg:flex">
            <span className="flex items-center gap-1"><CornerDownLeft className="h-3 w-3" aria-hidden /> open</span>
            <span>↑ ↓ move</span>
            <span>Ctrl K anywhere</span>
          </div>
        )}
      </div>
    </div>
  );
}

function GroupLabel({ children }: { children: ReactNode }) {
  return <p className="px-3 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wide text-text-secondary">{children}</p>;
}

function Option({ row, active, onHover, onChoose, children }: { row: Row; active: boolean; onHover: () => void; onChoose: () => void; children: ReactNode }) {
  return (
    <div
      id={row.optionId}
      role="option"
      aria-selected={active}
      onMouseMove={onHover}
      onClick={onChoose}
      className={cn('flex min-h-[48px] cursor-pointer items-center gap-3 rounded-xl px-3 py-2', active ? 'bg-surface' : 'hover:bg-surface/60')}
    >
      {children}
    </div>
  );
}

const KIND_LABEL: Record<AdminSearchItem['kind'], string> = {
  user: 'Account', contact: 'List', cafe: 'Café', booking: 'Booking', drop_seat: 'Drop seat', payment: 'Payment',
  drop: 'Drop', challenge: 'Challenge', offer: 'Offer', link: 'Link',
};

function RowBody({ row }: { row: Row }) {
  if (row.type === 'person') {
    return (
      <>
        <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-primary/12 text-primary"><Phone className="h-4 w-4" aria-hidden /></span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-body font-semibold text-text-primary">Everything for {prettyPhone(row.digits)}</span>
          <span className="block truncate text-caption text-text-secondary">Accounts, bookings, drop seats and every list it is on</span>
        </span>
        <ChevronRight className="h-4 w-4 text-text-secondary" aria-hidden />
      </>
    );
  }
  if (row.type === 'nav') {
    return (
      <>
        <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-surface text-text-secondary">
          {row.item.kind === 'action' ? <Zap className="h-4 w-4" aria-hidden /> : <ArrowUpRight className="h-4 w-4" aria-hidden />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-body font-semibold text-text-primary">{row.item.title}</span>
          <span className="block truncate text-caption text-text-secondary">{row.item.description}</span>
        </span>
        <span className="hidden flex-shrink-0 text-caption text-text-secondary sm:block">{row.item.area}</span>
      </>
    );
  }
  if (row.type !== 'record') return null;
  const it = row.item;
  return (
    <>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="truncate text-body font-semibold text-text-primary">{it.title}</span>
          {it.badge && <span className="flex-shrink-0 rounded-full bg-surface px-2 py-0.5 text-[11px] font-semibold capitalize text-text-secondary">{String(it.badge).replace(/_/g, ' ')}</span>}
          {it.active === false && <span className="flex-shrink-0 rounded-full bg-error/10 px-2 py-0.5 text-[11px] font-semibold text-error">off</span>}
        </span>
        <span className="block truncate text-caption text-text-secondary">
          {[it.phone ? prettyPhone(it.phone) : null, it.subtitle, it.meta].filter(Boolean).join(' · ') || KIND_LABEL[it.kind]}
        </span>
      </span>
      {it.phone && <PhoneButtons phone={it.phone} compact />}
    </>
  );
}

function PhoneButtons({ phone, compact }: { phone: string; compact?: boolean }) {
  const [copied, setCopied] = useState(false);
  const btn = cn(
    'flex flex-shrink-0 items-center justify-center gap-1.5 rounded-lg border border-border bg-card font-semibold text-text-primary hover:border-text-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
    compact ? 'h-9 w-9' : 'h-11 px-4 text-caption',
  );
  const stop = (e: React.MouseEvent) => e.stopPropagation();
  return (
    <span className="flex flex-shrink-0 items-center gap-1.5" onClick={stop}>
      <a href={`tel:${phone.replace(/[^\d+]/g, '')}`} className={btn} aria-label={`Call ${prettyPhone(phone)}`}>
        <Phone className="h-4 w-4" aria-hidden />
        {!compact && 'Call'}
      </a>
      <a href={`https://wa.me/${waNumber(phone)}`} target="_blank" rel="noopener noreferrer" className={btn} aria-label={`WhatsApp ${prettyPhone(phone)}`}>
        <MessageCircle className="h-4 w-4" aria-hidden />
        {!compact && 'WhatsApp'}
      </a>
      {!compact && (
        <button
          type="button"
          className={btn}
          onClick={() => {
            navigator.clipboard?.writeText(prettyPhone(phone)).then(() => {
              setCopied(true);
              window.setTimeout(() => setCopied(false), 1500);
            }).catch(() => {});
          }}
        >
          {copied ? <Check className="h-4 w-4 text-success" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      )}
    </span>
  );
}

function PersonPanel({ phone, onGo }: { phone: string; onGo: (href: string) => void }) {
  const { data, isLoading, isError } = useQuery({ queryKey: ['admin', 'person', phone], queryFn: () => adminPerson(phone), staleTime: 30_000 });
  return (
    <div className="flex flex-col gap-4 px-2 py-3">
      <div className="flex flex-col gap-3">
        <div>
          <p className="text-h3 font-heading text-text-primary">{data?.name || prettyPhone(phone)}</p>
          {data?.name && <p className="text-caption text-text-secondary">{prettyPhone(phone)}</p>}
        </div>
        <PhoneButtons phone={phone} />
      </div>
      {isLoading && <p className="flex items-center gap-2 text-caption text-text-secondary"><Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Looking everywhere…</p>}
      {isError && <p className="text-caption text-error">Couldn&apos;t load this number. Try again.</p>}
      {data && data.groups.length === 0 && <p className="text-body text-text-secondary">We don&apos;t hold this number anywhere.</p>}
      {data?.groups.map((g) => (
        <section key={g.key} className="flex flex-col">
          <GroupLabel>{g.label}</GroupLabel>
          {g.items.map((it) => (
            <button
              key={`${it.kind}-${it.id}`}
              type="button"
              onClick={() => onGo(it.href)}
              className="flex min-h-[48px] items-center gap-3 rounded-xl px-3 py-2 text-left hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="truncate text-body font-semibold text-text-primary">{it.title}</span>
                  {it.badge && <span className="flex-shrink-0 rounded-full bg-surface px-2 py-0.5 text-[11px] font-semibold capitalize text-text-secondary">{String(it.badge).replace(/_/g, ' ')}</span>}
                </span>
                <span className="block truncate text-caption text-text-secondary">{[it.subtitle, it.meta, it.date ? new Date(it.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : null].filter(Boolean).join(' · ')}</span>
              </span>
              <ChevronRight className="h-4 w-4 flex-shrink-0 text-text-secondary" aria-hidden />
            </button>
          ))}
        </section>
      ))}
      <p className="px-3 text-caption text-text-secondary">Opening a number is written to the audit log.</p>
    </div>
  );
}
