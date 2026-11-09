'use client';

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ExternalLink, Users } from 'lucide-react';
import { getCommunityContributions, getCommunityOverview } from '@/lib/api/admin';
import { cn } from '@/lib/cn';
import { Overview } from './_parts/Overview';
import { Posts } from './_parts/Posts';
import { Photos } from './_parts/Photos';
import { Poll } from './_parts/Poll';
import { PageSetup } from './_parts/PageSetup';
import { People } from './_parts/People';
import { Suggestions } from './_parts/Suggestions';

const TABS = [
  { key: 'overview', label: 'Numbers' },
  { key: 'posts', label: 'Posts' },
  { key: 'photos', label: 'Photos' },
  { key: 'poll', label: 'Poll' },
  { key: 'setup', label: 'Page setup' },
  { key: 'people', label: 'People' },
  { key: 'suggestions', label: 'Suggestions' },
] as const;
type Tab = (typeof TABS)[number]['key'];

/** Everything that runs the public /community page, one tab per job. The tab sits in the URL (#posts) so a reload keeps it. */
export default function AdminCommunityPage() {
  const [tab, setTab] = useState<Tab>('overview');
  const { data: o } = useQuery({ queryKey: ['admin', 'community'], queryFn: getCommunityOverview });
  const { data: contribs } = useQuery({ queryKey: ['admin', 'community-contribs'], queryFn: getCommunityContributions });
  const toReview = (contribs ?? []).filter((c) => c.status === 'new').length;

  useEffect(() => {
    const h = window.location.hash.replace('#', '') as Tab;
    if (TABS.some((t) => t.key === h)) setTab(h);
  }, []);
  const pick = (t: Tab) => {
    setTab(t);
    history.replaceState(null, '', `#${t}`);
  };

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 font-heading text-h2 font-bold text-text-primary"><Users className="h-6 w-6" aria-hidden /> Community page</h1>
          <p className="mt-1 max-w-prose text-body text-text-secondary">Run the public Community page: what it says, the posts, photos and poll, and how people use it.</p>
        </div>
        <a href="/community" target="_blank" rel="noopener noreferrer" className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-border bg-card px-4 font-bold text-text-primary hover:border-primary/60">
          View live page <ExternalLink className="h-4 w-4" aria-hidden />
        </a>
      </header>

      {o?.postIsStale && (
        <button type="button" onClick={() => pick('posts')} className="rounded-2xl border border-warning/40 bg-warning/10 p-3 text-left text-body text-text-primary">
          <b>No new post in 7 days.</b> The page looks quiet. Tap to write this week&apos;s post.
        </button>
      )}

      <nav role="tablist" aria-label="Community admin" className="sticky top-0 z-20 -mx-1 flex gap-1 overflow-x-auto rounded-2xl border border-border bg-surface/95 p-1 backdrop-blur">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => pick(t.key)}
            className={cn(
              'relative min-h-[40px] flex-shrink-0 whitespace-nowrap rounded-xl px-3.5 text-caption font-bold transition-colors',
              tab === t.key ? 'bg-card text-text-primary shadow-sm' : 'text-text-secondary hover:text-text-primary',
            )}
          >
            {t.label}
            {t.key === 'suggestions' && toReview > 0 && <span className="ml-1.5 rounded-full bg-primary px-1.5 py-px text-[10px] text-white">{toReview}</span>}
            {t.key === 'poll' && o?.poll && <span className="ml-1.5 text-[10px] font-semibold text-success">live</span>}
          </button>
        ))}
      </nav>

      {tab === 'overview' && <Overview />}
      {tab === 'posts' && <Posts />}
      {tab === 'photos' && <Photos />}
      {tab === 'poll' && <Poll />}
      {tab === 'setup' && <PageSetup />}
      {tab === 'people' && <People />}
      {tab === 'suggestions' && <Suggestions />}
    </div>
  );
}
