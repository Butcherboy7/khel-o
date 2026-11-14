'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Gamepad2, Search, X } from 'lucide-react';
import type { DropConsole } from '@/lib/api/drops';

export type ConsoleState = 'free' | 'online' | 'walkin' | 'blocked';

const STATE: Record<ConsoleState, { label: string; dot: string; text: string }> = {
  free: { label: 'Free', dot: 'bg-green-500', text: 'text-green-700' },
  online: { label: 'Booked online', dot: 'bg-red-500', text: 'text-red-700' },
  walkin: { label: 'Walk-in', dot: 'bg-violet-500', text: 'text-violet-700' },
  blocked: { label: 'Blocked', dot: 'bg-gray-500', text: 'text-gray-700' },
};

/** What the button says: "All consoles" or the one console, e.g. "PS5 Pro 2". */
export function pickedLabel(consoles: DropConsole[], value: string[]): string {
  if (!value.length) return 'All consoles';
  const names = consoles.filter((c) => value.includes(c.key)).map((c) => c.label);
  return names.length <= 2 ? names.join(', ') : `${names.length} consoles`;
}

/** Choose which console the café is working on: all of them (the overview) or exactly one.
 *  One at a time on purpose: with two picked, the slider and the "taken" message can't say which
 *  of them is free. A dropdown on a computer, a sheet from the bottom on a phone; tapping a row
 *  picks it and closes. Each row says what that console is doing at the picked time. */
export function ConsolePicker({
  consoles,
  value,
  onChange,
  states,
  when,
}: {
  consoles: DropConsole[];
  value: string[];
  onChange: (v: string[]) => void;
  states: Record<string, ConsoleState>;
  when: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const sheet = useRef<HTMLDivElement>(null);
  const opener = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    setQ('');
    const t = window.setTimeout(
      () => (sheet.current?.querySelector<HTMLElement>('[aria-checked="true"]') ?? sheet.current?.querySelector<HTMLElement>('input, button'))?.focus(),
      30,
    );
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', esc);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener('keydown', esc);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const close = () => {
    setOpen(false);
    opener.current?.focus();
  };

  const groups = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const out: { setup: string; items: DropConsole[] }[] = [];
    for (const c of consoles) {
      if (needle && !c.label.toLowerCase().includes(needle)) continue;
      const g = out.find((x) => x.setup === c.setup) ?? out[out.push({ setup: c.setup, items: [] }) - 1];
      g.items.push(c);
    }
    return out;
  }, [consoles, q]);

  const choose = (v: string[]) => {
    onChange(v);
    close();
  };
  const freeCount = consoles.filter((c) => (states[c.key] ?? 'free') === 'free').length;

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-caption font-semibold text-text-secondary">Console</span>
      <button
        ref={opener}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
        className="flex min-h-[48px] w-full items-center justify-between gap-3 rounded-xl border border-border bg-card px-3 text-left transition-colors hover:border-text-secondary"
      >
        <span className="flex min-w-0 items-center gap-2">
          <Gamepad2 className="h-4 w-4 flex-none text-primary" aria-hidden />
          <span className="truncate font-semibold text-text-primary">{pickedLabel(consoles, value)}</span>
        </span>
        <span className="flex flex-none items-center gap-2 text-caption text-text-secondary">
          {!value.length && `${freeCount} of ${consoles.length} free`}
          <ChevronDown className="h-4 w-4" aria-hidden />
        </span>
      </button>

      {open && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center" role="presentation">
          <button type="button" aria-label="Close" className="absolute inset-0 bg-black/40" onClick={close} tabIndex={-1} />
          <div
            ref={sheet}
            role="dialog"
            aria-modal="true"
            aria-label="Pick a console"
            className="relative flex max-h-[85vh] w-full flex-col rounded-t-2xl bg-card shadow-xl sm:max-w-md sm:rounded-2xl"
            style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
          >
            <div className="flex items-start justify-between gap-3 border-b border-border px-4 pb-3 pt-4">
              <div className="min-w-0">
                <p className="font-heading text-body-emphasis font-bold text-text-primary">Which console?</p>
                <p className="text-caption text-text-secondary">What each one is doing {when}</p>
              </div>
              <button type="button" aria-label="Close" onClick={close} className="flex h-11 w-11 flex-none items-center justify-center rounded-full text-text-secondary hover:bg-surface-hover">
                <X className="h-5 w-5" />
              </button>
            </div>

            {consoles.length > 8 && (
              <label className="relative mx-4 mt-3 block">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-secondary" aria-hidden />
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Find a console"
                  aria-label="Find a console"
                  className="h-11 w-full rounded-lg border border-border bg-card pl-9 pr-3 text-body text-text-primary"
                />
              </label>
            )}

            <div className="flex-1 overflow-y-auto px-2 py-2" role="radiogroup" aria-label="Console">
              <button
                type="button"
                role="radio"
                aria-checked={value.length === 0}
                onClick={() => choose([])}
                className="flex min-h-[52px] w-full items-center gap-3 rounded-xl px-2 text-left hover:bg-surface-hover"
              >
                <Dot on={value.length === 0} />
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold text-text-primary">All consoles</span>
                  <span className="block text-caption text-text-secondary">Every console together; sell or block several at once</span>
                </span>
                <span className="text-caption text-text-secondary">
                  {freeCount} of {consoles.length} free
                </span>
              </button>
              {groups.map((g) => (
                <div key={g.setup} className="mt-1">
                  <p className="px-2 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-text-secondary">{g.setup}</p>
                  {g.items.map((c) => {
                    const st = STATE[states[c.key] ?? 'free'];
                    const on = value.length === 1 && value[0] === c.key;
                    return (
                      <button
                        key={c.key}
                        type="button"
                        role="radio"
                        aria-checked={on}
                        onClick={() => choose([c.key])}
                        className={`flex min-h-[52px] w-full items-center gap-3 rounded-xl px-2 text-left hover:bg-surface-hover ${on ? 'bg-primary/5' : ''}`}
                      >
                        <Dot on={on} />
                        <span className="min-w-0 flex-1 truncate font-semibold text-text-primary">{c.label}</span>
                        <span className={`flex flex-none items-center gap-1.5 text-caption font-semibold ${st.text}`}>
                          <span className={`h-2 w-2 rounded-full ${st.dot}`} aria-hidden />
                          {st.label}
                        </span>
                      </button>
                    );
                  })}
                </div>
              ))}
              {!groups.length && <p className="px-2 py-4 text-caption text-text-secondary">No console by that name.</p>}
            </div>

          </div>
        </div>
      )}
    </div>
  );
}

function Dot({ on }: { on: boolean }) {
  return (
    <span
      aria-hidden
      className={`flex h-5 w-5 flex-none items-center justify-center rounded-full border-2 ${on ? 'border-primary' : 'border-border bg-card'}`}
    >
      {on && <span className="h-2.5 w-2.5 rounded-full bg-primary" />}
    </span>
  );
}

/** Every console at the picked time, as small chips: the overview when "All consoles" is on.
 *  Tapping one picks it. */
export function ConsoleStrip({
  consoles,
  states,
  onPick,
}: {
  consoles: DropConsole[];
  states: Record<string, ConsoleState>;
  onPick: (key: string) => void;
}) {
  return (
    <ul className="flex flex-wrap gap-1.5" aria-label="Consoles at the picked time">
      {consoles.map((c) => {
        const st = STATE[states[c.key] ?? 'free'];
        return (
          <li key={c.key}>
            <button
              type="button"
              onClick={() => onPick(c.key)}
              className="flex min-h-[36px] items-center gap-1.5 rounded-full border border-border bg-card px-2.5 text-caption hover:border-text-secondary"
            >
              <span className={`h-2 w-2 rounded-full ${st.dot}`} aria-hidden />
              <span className="font-semibold text-text-primary">{c.label}</span>
              <span className="sr-only">: {st.label}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
