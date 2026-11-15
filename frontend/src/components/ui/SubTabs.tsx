'use client';

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/cn';

export interface SubTab<K extends string = string> {
  key: K;
  label: string;
  icon?: LucideIcon;
  /** A small red count, e.g. things waiting for you. Hidden when 0. */
  count?: number;
}

/**
 * Which sub-tab is open, kept in the URL as ?tab= so a refresh, the back
 * button or a shared link lands on the same tab. `reveal` maps a Quick Find /
 * Tutorial target name (sent as a `khelo:reveal` event) to the tab that holds it.
 */
export function useSubTab<K extends string>(
  keys: readonly K[],
  fallback: K,
  opts: { param?: string; reveal?: Partial<Record<string, K>> } = {},
): [K, (k: K) => void] {
  const param = opts.param ?? 'tab';
  const [tab, setTab] = useState<K>(fallback);

  // Read the URL after mount: reading it during render would differ between the
  // server and the browser.
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const t = sp.get(param) as K | null;
    if (t && keys.includes(t)) setTab(t);
    else {
      const viaQf = opts.reveal?.[sp.get('qf') ?? ''];
      if (viaQf) setTab(viaQf);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!opts.reveal) return;
    const onReveal = (e: Event) => {
      const t = opts.reveal?.[(e as CustomEvent<string>).detail];
      if (t) setTab(t);
    };
    window.addEventListener('khelo:reveal', onReveal);
    return () => window.removeEventListener('khelo:reveal', onReveal);
  }, [opts.reveal]);

  const pick = useCallback(
    (k: K) => {
      setTab(k);
      const url = new URL(window.location.href);
      url.searchParams.set(param, k);
      window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}`);
    },
    [param],
  );

  return [tab, pick];
}

/**
 * The tab bar that splits one long page into a few short ones (the GTA 6 drop
 * page pattern). Sticks under the top bar so you can switch without scrolling
 * back up; scrolls sideways on a phone when the labels don't fit.
 *
 * `sticky`: 'owner' sits under the owner top bar (56px), 'admin' under the admin
 * phone bar (48px, none on desktop), false doesn't stick (for tabs inside a card).
 */
export function SubTabs<K extends string>({
  tabs,
  value,
  onChange,
  label,
  idPrefix,
  sticky = 'owner',
  className,
}: {
  tabs: SubTab<K>[];
  value: K;
  onChange: (k: K) => void;
  label: string;
  idPrefix: string;
  sticky?: 'owner' | 'admin' | false;
  className?: string;
}) {
  return (
    <div
      role="tablist"
      aria-label={label}
      className={cn(
        '-mx-4 flex gap-1 overflow-x-auto border-b border-border bg-surface/95 px-4 py-2 backdrop-blur [scrollbar-width:none] lg:-mx-8 lg:px-8',
        sticky === 'owner' && 'sticky top-14 z-20',
        sticky === 'admin' && 'sticky top-12 z-20 lg:top-0',
        !sticky && 'mx-0 rounded-xl border bg-card px-1 py-1 lg:mx-0 lg:px-1',
        className,
      )}
    >
      {tabs.map(({ key, label: text, icon: Icon, count }) => {
        const on = key === value;
        return (
          <button
            key={key}
            type="button"
            role="tab"
            id={`${idPrefix}-tab-${key}`}
            aria-selected={on}
            aria-controls={`${idPrefix}-panel-${key}`}
            onClick={() => onChange(key)}
            className={cn(
              'flex min-h-[44px] flex-1 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl px-3 text-body font-semibold transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
              on
                ? 'bg-card text-text-primary shadow-sm ring-1 ring-border'
                : 'text-text-secondary hover:bg-card/60 hover:text-text-primary',
            )}
          >
            {Icon && <Icon className={cn('hidden h-4 w-4 sm:block', on && 'text-primary')} aria-hidden />}
            {text}
            {count ? (
              <span className="rounded-full bg-primary px-1.5 text-[11px] font-bold leading-5 text-white tabular-nums">{count}</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

export function SubTabPanel({
  idPrefix,
  tab,
  children,
  className,
}: {
  idPrefix: string;
  tab: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      role="tabpanel"
      id={`${idPrefix}-panel-${tab}`}
      aria-labelledby={`${idPrefix}-tab-${tab}`}
      className={cn('flex flex-col gap-4', className)}
    >
      {children}
    </div>
  );
}
