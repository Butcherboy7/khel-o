'use client';

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BarChart3, ExternalLink, Images, Inbox, LayoutTemplate, Newspaper, UserRound, Users, Vote } from 'lucide-react';
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
  { key: 'overview', label: 'Numbers', icon: BarChart3 },
  { key: 'posts', label: 'Posts', icon: Newspaper },
  { key: 'photos', label: 'Photos', icon: Images },
  { key: 'poll', label: 'Poll', icon: Vote },
  { key: 'setup', label: 'Page setup', icon: LayoutTemplate },
  { key: 'people', label: 'People', icon: UserRound },
  { key: 'suggestions', label: 'Suggestions', icon: Inbox },
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
      <header className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 font-heading text-h3 font-bold text-text-primary md:text-h2"><Users className="h-5 w-5 md:h-6 md:w-6" aria-hidden /> Community page</h1>
          <p className="mt-1 hidden max-w-prose text-body text-text-secondary md:block">Run the public Community page: what it says, the posts, photos and poll, and how people use it.</p>
        </div>
        <a href="/community" target="_blank" rel="noopener noreferrer" className="inline-flex min-h-[40px] flex-shrink-0 items-center gap-1.5 rounded-xl border border-border bg-card px-3 text-caption font-bold text-text-primary hover:border-primary/60 md:min-h-[44px] md:px-4 md:text-body">
          Live page <ExternalLink className="h-4 w-4" aria-hidden />
        </a>
      </header>

      {o?.postIsStale && tab !== 'posts' && (
        <button type="button" onClick={() => pick('posts')} className="flex items-center gap-2 rounded-xl border border-warning/40 bg-warning/10 px-3 py-2 text-left text-caption text-text-primary md:text-body">
          <Newspaper className="h-4 w-4 flex-shrink-0 text-warning" aria-hidden />
          <span><b>No post in 7 days.</b> Write this week&apos;s post →</span>
        </button>
      )}

      {/* Phone: all seven as tiles, nothing hidden off-screen. Wider: one sticky row. */}
      <nav role="tablist" aria-label="Community admin" className="grid grid-cols-4 gap-1 rounded-2xl border border-border bg-surface p-1 md:sticky md:top-0 md:z-20 md:flex md:bg-surface/95 md:backdrop-blur">
        {TABS.map((t) => {
          const Icon = t.icon;
          const on = tab === t.key;
          return (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => pick(t.key)}
              className={cn(
                'relative flex min-h-[56px] flex-col items-center justify-center gap-1 rounded-xl px-1 text-[11px] font-bold leading-tight transition-colors md:min-h-[40px] md:flex-row md:gap-1.5 md:whitespace-nowrap md:px-2.5 md:text-caption lg:px-3.5',
                on ? 'bg-card text-primary shadow-sm md:text-text-primary' : 'text-text-secondary hover:text-text-primary',
              )}
            >
              <Icon className="h-[18px] w-[18px] md:h-4 md:w-4" aria-hidden />
              <span className="text-center">{t.label}</span>
              {t.key === 'suggestions' && toReview > 0 && <span className="absolute right-1 top-1 rounded-full bg-primary px-1.5 py-px text-[10px] text-white md:static">{toReview}</span>}
              {t.key === 'poll' && o?.poll && <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-success md:static" title="Poll is live" />}
            </button>
          );
        })}
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
