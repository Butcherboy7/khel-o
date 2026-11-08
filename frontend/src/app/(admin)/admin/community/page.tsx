'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Users, Check, X, Download } from 'lucide-react';
import {
  getCommunityOverview,
  getCommunityContributions,
  setContributionStatus,
  startCommunityPoll,
  publishCommunityPost,
  setCommunityGroupSize,
  getCommunityPeople,
  downloadCommunityPeopleCsv,
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
  const [post, setPost] = useState({ headline: '', line: '', imageUrl: '', buttonLabel: '', buttonUrl: '' });
  const [size, setSize] = useState('');
  const people = useQuery({ queryKey: ['admin', 'community-people'], queryFn: getCommunityPeople });
  const newPost = useMutation({
    mutationFn: () => publishCommunityPost({ headline: post.headline.trim(), line: post.line.trim() || undefined, imageUrl: post.imageUrl.trim() || undefined, buttonLabel: post.buttonLabel.trim() || undefined, buttonUrl: post.buttonUrl.trim() || undefined }),
    onSuccess: () => {
      setPost({ headline: '', line: '', imageUrl: '', buttonLabel: '', buttonUrl: '' });
      qc.invalidateQueries({ queryKey: ['admin'] });
    },
  });
  const saveSize = useMutation({
    mutationFn: () => setCommunityGroupSize(Number(size)),
    onSuccess: () => {
      setSize('');
      qc.invalidateQueries({ queryKey: ['admin'] });
    },
  });

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
        <p className="mt-1 text-body text-text-secondary">Who tapped Join, which ad brought them, their emails and numbers, votes, and what they sent in. WhatsApp does not tell us who is in the group, so we count Join taps and you type the real group size below.</p>
      </div>

      {o.postIsStale && (
        <div role="alert" className="rounded-2xl border border-warning/40 bg-warning/10 p-3 text-body text-text-primary">
          <b>No weekly post in the last 7 days.</b> The Community page and the red dot on the nav look dead. Add this week&apos;s post below.
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        {[
          ['Tapped Join', o.members],
          ['This week', o.joinedThisWeek],
          ['Poll votes', o.poll?.total ?? 0],
          ['New suggestions', o.contributionsNew],
          ['Emails / numbers left', o.leads],
          ['OK to email promos', o.promoOk],
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
                <span className="min-w-0 truncate"><b className="text-text-primary">{m.name || 'Anonymous phone'}</b>{m.email ? ` · ${m.email}` : ''}{m.source ? ` · ${m.source}` : ''}{m.inApp ? ' · Instagram' : ''}</span>
                <span className="flex-shrink-0 text-text-secondary">{m.phone ? `${m.phone} · ` : ''}{when(m.joinedAt)}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card elevation="raised">
        <CardContent className="flex flex-col gap-3 p-4">
          <h2 className="font-heading text-h3 font-bold text-text-primary">Which ad brought them (last 60 days)</h2>
          <p className="text-caption text-text-secondary">Different phones that reached each step. &quot;In Instagram&quot; = opened inside the Instagram or Facebook browser.</p>
          {o.funnel.length === 0 ? (
            <p className="text-body text-text-secondary">No visits yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[620px] text-left text-caption">
                <thead className="text-text-secondary">
                  <tr>{['Ad / link', 'Landed', 'In Instagram', 'Tapped Join', 'Voted', 'Suggested', 'Left contact'].map((h) => <th key={h} className="py-1.5 pr-3 font-bold">{h}</th>)}</tr>
                </thead>
                <tbody>
                  {o.funnel.map((f) => (
                    <tr key={f.source} className="border-t border-border/60">
                      <td className="py-1.5 pr-3 font-bold text-text-primary">{f.source}</td>
                      <td className="pr-3">{f.community_landed}</td>
                      <td className="pr-3">{f.inApp}</td>
                      <td className="pr-3">{f.community_join_tap}{f.community_landed > 0 ? ` (${Math.round((f.community_join_tap / f.community_landed) * 100)}%)` : ''}</td>
                      <td className="pr-3">{f.community_poll_vote}</td>
                      <td className="pr-3">{f.community_contribution}</td>
                      <td className="pr-3">{f.community_lead}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card elevation="raised">
          <CardContent className="flex flex-col gap-2 p-4">
            <h2 className="font-heading text-h3 font-bold text-text-primary">Weekly post</h2>
            {o.post ? <p className="text-caption text-text-secondary">Showing: <b className="text-text-primary">{o.post.headline}</b> · posted {when(o.post.createdAt)}</p> : <p className="text-caption text-text-secondary">No post yet.</p>}
            <input value={post.headline} onChange={(e) => setPost({ ...post, headline: e.target.value })} placeholder="Headline (e.g. Challenge #2 is Street Fighter)" maxLength={120} className="min-h-[44px] rounded-xl border border-border bg-card px-3 text-body" />
            <input value={post.line} onChange={(e) => setPost({ ...post, line: e.target.value })} placeholder="One line under it (optional)" maxLength={200} className="min-h-[44px] rounded-xl border border-border bg-card px-3 text-body" />
            <input value={post.imageUrl} onChange={(e) => setPost({ ...post, imageUrl: e.target.value })} placeholder="Photo link, https://… or /community/xyz.webp (optional)" className="min-h-[44px] rounded-xl border border-border bg-card px-3 text-body" />
            <div className="grid gap-2 sm:grid-cols-2">
              <input value={post.buttonLabel} onChange={(e) => setPost({ ...post, buttonLabel: e.target.value })} placeholder="Button text (optional)" maxLength={40} className="min-h-[44px] rounded-xl border border-border bg-card px-3 text-body" />
              <input value={post.buttonUrl} onChange={(e) => setPost({ ...post, buttonUrl: e.target.value })} placeholder="Button link, /challenge/… or https://" className="min-h-[44px] rounded-xl border border-border bg-card px-3 text-body" />
            </div>
            <Button onClick={() => newPost.mutate()} disabled={newPost.isPending || post.headline.trim().length < 3}>{newPost.isPending ? 'Publishing…' : 'Publish post'}</Button>
            {newPost.isError && <p className="text-caption text-error">{(newPost.error as Error).message}</p>}
          </CardContent>
        </Card>

        <Card elevation="raised">
          <CardContent className="flex flex-col gap-2 p-4">
            <h2 className="font-heading text-h3 font-bold text-text-primary">Real WhatsApp group size</h2>
            <p className="text-caption text-text-secondary">
              Open the group, read the member count, type it here. Join taps: <b className="text-text-primary">{o.members}</b>
              {o.groupSize ? <> · last typed <b className="text-text-primary">{o.groupSize.size}</b> on {when(o.groupSize.at)}</> : null}.
              {o.groupSize && o.members > 0 ? <> Tapped but did not join: about {Math.max(0, o.members - o.groupSize.size)}.</> : null}
            </p>
            <div className="flex gap-2">
              <input value={size} onChange={(e) => setSize(e.target.value.replace(/\D/g, ''))} inputMode="numeric" placeholder="Members in the group" className="min-h-[44px] flex-1 rounded-xl border border-border bg-card px-3 text-body" />
              <Button onClick={() => saveSize.mutate()} disabled={saveSize.isPending || size === ''}>Save</Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card elevation="raised">
        <CardContent className="flex flex-col gap-3 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-heading text-h3 font-bold text-text-primary">People we can contact</h2>
              <p className="text-caption text-text-secondary">Accounts that tapped Join, plus emails and numbers left on the page. Only &quot;Promos: yes&quot; people get promotional email, from the <a href="/admin/community-email" className="font-bold text-primary underline">email page</a>.</p>
            </div>
            <Button size="sm" variant="secondary" onClick={() => downloadCommunityPeopleCsv()}><Download className="mr-1 h-4 w-4" />Download CSV</Button>
          </div>
          {(people.data ?? []).length === 0 ? (
            <p className="text-body text-text-secondary">Nobody yet.</p>
          ) : (
            <div className="max-h-[420px] overflow-auto">
              <table className="w-full min-w-[620px] text-left text-caption">
                <thead className="sticky top-0 bg-card text-text-secondary">
                  <tr>{['Name', 'Email', 'Phone', 'From', 'Promos', 'Date'].map((h) => <th key={h} className="py-1.5 pr-3 font-bold">{h}</th>)}</tr>
                </thead>
                <tbody>
                  {(people.data ?? []).map((p, i) => (
                    <tr key={i} className="border-t border-border/60">
                      <td className="py-1.5 pr-3 text-text-primary">{p.name || (p.kind === 'lead' ? 'Left on page' : 'Unnamed')}</td>
                      <td className="pr-3">{p.email || '·'}</td>
                      <td className="pr-3">{p.phone || '·'}</td>
                      <td className="pr-3">{p.source || (p.kind === 'account' ? 'account' : 'direct')}</td>
                      <td className="pr-3">{p.promoOk ? 'yes' : 'no'}</td>
                      <td>{when(p.at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

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
                <p className="text-caption text-text-secondary">From {c.name || 'unknown'}{c.email ? ` · ${c.email}` : ''}{c.phone ? ` · ${c.phone}` : ''}{c.contact ? ` · ${c.contact}` : ''}{c.showName ? ' · OK to show their name' : ''}</p>
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
