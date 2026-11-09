'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDown, ArrowUp } from 'lucide-react';
import { getCommunitySettings, resetCommunitySettings, saveCommunitySettings, type CommunityPageSettings, type CommunityTabKey } from '@/lib/api/admin';
import { Button } from '@/components/ui';
import { cn } from '@/lib/cn';
import { ConfirmButton, ErrorLine, Panel, SmallButton, Toggle, field, labelText } from './ui';

const ALL_TABS: { key: CommunityTabKey; name: string; what: string }[] = [
  { key: 'week', name: 'This week', what: 'The post on top, members code, what is happening now' },
  { key: 'vote', name: 'Vote', what: 'The running poll and closed results' },
  { key: 'next', name: 'Next up', what: 'The live drop, the next challenge, cafés' },
  { key: 'photos', name: 'Photos', what: 'The photo wall, suggest a café, share photos' },
];

export function PageSetup() {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ['admin', 'community-settings'], queryFn: getCommunitySettings });
  const [s, setS] = useState<CommunityPageSettings | null>(null);
  useEffect(() => {
    if (data) {
      const rest: CommunityPageSettings & { defaults?: unknown } = { ...data };
      delete rest.defaults;
      setS(rest);
    }
  }, [data]);
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['admin', 'community-settings'] });
    qc.invalidateQueries({ queryKey: ['community-week'] });
  };
  const save = useMutation({ mutationFn: () => saveCommunitySettings(s!), onSuccess: refresh });
  const reset = useMutation({ mutationFn: resetCommunitySettings, onSuccess: refresh });

  if (!s) return <div className="h-40 animate-pulse rounded-2xl bg-surface" />;
  const shown = s.tabs;
  const hidden = ALL_TABS.filter((t) => !shown.includes(t.key));
  const moveTab = (i: number, d: -1 | 1) => {
    const next = [...shown];
    const j = i + d;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j], next[i]];
    setS({ ...s, tabs: next });
  };
  const dirty = data && JSON.stringify({ ...data, defaults: undefined }) !== JSON.stringify({ ...s, defaults: undefined });

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title="Top of the page" hint="The words over the big photo, and the Join button.">
          <label className={labelText}>Small line above the headline
            <input className={field} value={s.kicker} maxLength={60} onChange={(e) => setS({ ...s, kicker: e.target.value })} />
          </label>
          <label className={labelText}>Headline
            <input className={field} value={s.headline} maxLength={80} onChange={(e) => setS({ ...s, headline: e.target.value })} />
          </label>
          <label className={labelText}>Line under it
            <textarea className={cn(field, 'min-h-[72px] py-2')} value={s.line} maxLength={200} onChange={(e) => setS({ ...s, line: e.target.value })} />
          </label>
          <label className={labelText}>Join button text
            <input className={field} value={s.joinLabel} maxLength={40} onChange={(e) => setS({ ...s, joinLabel: e.target.value })} />
          </label>
          <p className="text-caption text-text-secondary">The big photo is the one with the star on the Photos tab.</p>
        </Panel>

        <Panel title="Tabs" hint="The first tab is what opens first. Hide a tab to take it off the page.">
          <ol className="flex flex-col gap-1.5">
            {shown.map((k, i) => {
              const t = ALL_TABS.find((x) => x.key === k)!;
              return (
                <li key={k} className="flex items-center gap-2 rounded-xl border border-border px-3 py-2">
                  <span className="w-5 text-caption font-bold tabular-nums text-text-secondary">{i + 1}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-body font-semibold text-text-primary">{t.name}{i === 0 ? <span className="ml-2 rounded-full bg-primary px-2 py-0.5 text-[11px] font-bold text-white">Opens first</span> : null}</span>
                    <span className="block truncate text-caption text-text-secondary">{t.what}</span>
                  </span>
                  <SmallButton onClick={() => moveTab(i, -1)} disabled={i === 0} title="Move up"><ArrowUp className="h-3.5 w-3.5" aria-hidden /></SmallButton>
                  <SmallButton onClick={() => moveTab(i, 1)} disabled={i === shown.length - 1} title="Move down"><ArrowDown className="h-3.5 w-3.5" aria-hidden /></SmallButton>
                  <SmallButton onClick={() => setS({ ...s, tabs: shown.filter((x) => x !== k) })} disabled={shown.length === 1}>Hide</SmallButton>
                </li>
              );
            })}
          </ol>
          {hidden.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-caption text-text-secondary">Hidden:</span>
              {hidden.map((t) => (
                <SmallButton key={t.key} onClick={() => setS({ ...s, tabs: [...shown, t.key] })}>Show {t.name}</SmallButton>
              ))}
            </div>
          )}
        </Panel>
      </div>

      <Panel title="What shows" hint="Turn parts of the page on or off.">
        <div className="grid gap-2 md:grid-cols-2">
          <Toggle checked={s.showMemberCount} onChange={(v) => setS({ ...s, showMemberCount: v })} label="“N gamers are already in”" hint="Only ever shown once there are 10 or more real Join taps." />
          <Toggle checked={s.showMembersCode} onChange={(v) => setS({ ...s, showMembersCode: v })} label="Members-only code card" hint="This week tab. The code itself is set on the Poll tab." />
          <Toggle checked={s.showHappeningNow} onChange={(v) => setS({ ...s, showHappeningNow: v })} label="Happening now" hint="This week tab: the live drop and the next challenge." />
          <Toggle checked={s.showRecap} onChange={(v) => setS({ ...s, showRecap: v })} label="Tekken #01 recap card" hint="Shown on This week while there is no post." />
        </div>
        <div className="flex justify-end border-t border-border pt-3">
          <ConfirmButton onConfirm={() => reset.mutate()} armed="Tap again to reset everything">Reset whole page to the original</ConfirmButton>
        </div>
      </Panel>

      {/* Only floats while there is something to save, so it never covers the form for nothing. */}
      <div className={cn('z-10 flex items-center gap-2 rounded-2xl border border-border bg-card p-2 shadow-float', dirty && 'sticky bottom-3')}>
        <Button onClick={() => save.mutate()} disabled={save.isPending || !dirty} className="flex-1 sm:flex-none">{save.isPending ? 'Saving…' : dirty ? 'Save page setup' : 'Saved'}</Button>
        <a href="/community" target="_blank" rel="noopener noreferrer" className="inline-flex min-h-[44px] items-center rounded-xl border border-border px-4 font-bold text-text-primary">Live page</a>
      </div>
      <ErrorLine error={save.error || reset.error} />
    </div>
  );
}
