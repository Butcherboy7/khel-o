'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Users, Check, X } from 'lucide-react';
import {
  getCommunityOverview,
  getCommunityContributions,
  setContributionStatus,
  startCommunityPoll,
} from '@/lib/api/admin';
import { Button, Card, CardContent, ErrorState, PageSpinner } from '@/components/ui';

const when = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' });

export default function AdminCommunityPage() {
  const qc = useQueryClient();
  const overview = useQuery({ queryKey: ['admin', 'community'], queryFn: getCommunityOverview });
  const contribs = useQuery({ queryKey: ['admin', 'community-contribs'], queryFn: getCommunityContributions });
  const [filter, setFilter] = useState<'new' | 'all'>('new');
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState('');
  const [code, setCode] = useState('');

  const setStatus = useMutation({
    mutationFn: (v: { id: string; status: 'approved' | 'declined' | 'new' }) => setContributionStatus(v.id, v.status),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin'] }),
  });
  const newPoll = useMutation({
    mutationFn: () =>
      startCommunityPoll({ question, options: options.split('\n').map((o) => o.trim()).filter(Boolean), membersCode: code.trim() || undefined }),
    onSuccess: () => {
      setQuestion('');
      setOptions('');
      setCode('');
      qc.invalidateQueries({ queryKey: ['admin'] });
    },
  });

  if (overview.isLoading || contribs.isLoading) return <PageSpinner />;
  if (overview.error || !overview.data) return <ErrorState title="Could not load the community" message={(overview.error as Error)?.message} onRetry={() => overview.refetch()} />;
  const o = overview.data;
  const rows = (contribs.data ?? []).filter((c) => filter === 'all' || c.status === 'new');

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-5">
      <div>
        <h1 className="flex items-center gap-2 font-heading text-h2 font-bold text-text-primary"><Users className="h-6 w-6" /> Community</h1>
        <p className="mt-1 text-body text-text-secondary">Who joined, what they voted, and the cafés and photos they sent in. We can only see who tapped Join, not who is in the WhatsApp group.</p>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          ['Tapped Join', o.members],
          ['This week', o.joinedThisWeek],
          ['Poll votes', o.poll?.total ?? 0],
          ['New suggestions', o.contributionsNew],
        ].map(([label, n]) => (
          <Card key={label as string} elevation="resting">
            <CardContent className="p-4">
              <p className="font-heading text-h2 font-bold text-text-primary">{n}</p>
              <p className="text-caption text-text-secondary">{label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card elevation="raised">
          <CardContent className="flex flex-col gap-3 p-4">
            <h2 className="font-heading text-h3 font-bold text-text-primary">This week&apos;s poll</h2>
            {o.poll ? (
              <>
                <p className="text-body font-semibold text-text-primary">{o.poll.question}</p>
                {o.poll.options.map((x) => (
                  <div key={x.label} className="flex items-center justify-between gap-3 text-body">
                    <span>{x.label}</span>
                    <b>{x.votes}</b>
                  </div>
                ))}
                {o.poll.membersCode && <p className="text-caption text-text-secondary">Members code: <b>{o.poll.membersCode}</b></p>}
              </>
            ) : (
              <p className="text-body text-text-secondary">No poll running.</p>
            )}
            <div className="mt-2 flex flex-col gap-2 border-t border-border pt-3">
              <p className="text-caption font-bold text-text-primary">Start a new poll (closes the old one)</p>
              <input value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="Question" className="min-h-[44px] rounded-xl border border-border bg-card px-3 text-body" />
              <textarea value={options} onChange={(e) => setOptions(e.target.value)} placeholder="One choice per line (2 to 6)" rows={3} className="rounded-xl border border-border bg-card px-3 py-2 text-body" />
              <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Members-only code (optional)" className="min-h-[44px] rounded-xl border border-border bg-card px-3 text-body" />
              <Button onClick={() => newPoll.mutate()} disabled={newPoll.isPending || question.trim().length < 3 || options.split('\n').filter((l) => l.trim()).length < 2}>
                {newPoll.isPending ? 'Starting…' : 'Start poll'}
              </Button>
              {newPoll.isError && <p className="text-caption text-error">{(newPoll.error as Error).message}</p>}
            </div>
          </CardContent>
        </Card>

        <Card elevation="raised">
          <CardContent className="flex flex-col gap-2 p-4">
            <h2 className="font-heading text-h3 font-bold text-text-primary">Latest to tap Join</h2>
            {o.recent.length === 0 && <p className="text-body text-text-secondary">Nobody yet.</p>}
            {o.recent.map((m, i) => (
              <div key={i} className="flex items-center justify-between gap-3 border-b border-border/60 pb-1.5 text-caption last:border-0">
                <span className="min-w-0 truncate"><b className="text-text-primary">{m.name || 'Unnamed'}</b> · {m.email}</span>
                <span className="flex-shrink-0 text-text-secondary">{m.phone ? `${m.phone} · ` : ''}{when(m.joinedAt)}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card elevation="raised">
        <CardContent className="flex flex-col gap-3 p-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-heading text-h3 font-bold text-text-primary">Cafés and photos people sent</h2>
            <div className="flex gap-1.5">
              {(['new', 'all'] as const).map((f) => (
                <button key={f} type="button" onClick={() => setFilter(f)} className={`rounded-full px-3.5 py-1.5 text-caption font-bold ${filter === f ? 'bg-primary text-white' : 'border border-border text-text-secondary'}`}>
                  {f === 'new' ? 'To review' : 'All'}
                </button>
              ))}
            </div>
          </div>
          {rows.length === 0 && <p className="text-body text-text-secondary">Nothing to review.</p>}
          <div className="grid gap-3 md:grid-cols-2">
            {rows.map((c) => (
              <div key={c.id} className="flex flex-col gap-1.5 rounded-2xl border border-border p-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-heading text-body-emphasis font-bold text-text-primary">{c.kind === 'cafe' ? 'Café: ' : 'Photos: '}{c.title}</p>
                  <span className="flex-shrink-0 text-caption text-text-secondary">{when(c.createdAt)} · {c.status}</span>
                </div>
                {c.detail && <p className="whitespace-pre-wrap break-words text-body text-text-primary">{c.detail}</p>}
                <p className="text-caption text-text-secondary">From {c.name || 'unknown'} · {c.email}{c.phone ? ` · ${c.phone}` : ''}{c.showName ? ' · OK to show their name' : ''}</p>
                <div className="mt-1 flex gap-2">
                  <Button size="sm" variant="secondary" onClick={() => setStatus.mutate({ id: c.id, status: 'approved' })} disabled={c.status === 'approved'}><Check className="mr-1 h-4 w-4" />Approve</Button>
                  <Button size="sm" variant="ghost" onClick={() => setStatus.mutate({ id: c.id, status: 'declined' })} disabled={c.status === 'declined'}><X className="mr-1 h-4 w-4" />Decline</Button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
