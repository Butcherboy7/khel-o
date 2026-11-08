'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, Check, Copy, Lock, X } from 'lucide-react';
import { WhatsAppIcon } from '@/components/icons/WhatsAppIcon';
import { dropArt } from '@/components/customer/HomeTabs';
import { cn } from '@/lib/cn';
import { trackAction } from '@/lib/api/analyticsEvents';
import { listDrops } from '@/lib/api/drops';
import { getChallenge } from '@/lib/api/challenges';
import { getThisWeek, leaveContact, sendContribution, voteInPoll } from '@/lib/api/community';
import { COMMUNITY_URL, FEATURED_CHALLENGE_SLUG, challengeDay, isUpcoming, openToAll } from '@/lib/challenge';
import {
  SEEN_POST_KEY,
  joinedHere,
  leadLeftHere,
  markLeadLeft,
  markSuggested,
  markVoted,
  recordJoin,
} from '@/lib/communityJoin';
import { isInAppBrowser } from '@/lib/campaign';

type Tab = 'week' | 'vote' | 'next' | 'photos';
const TABS: { key: Tab; label: string }[] = [
  { key: 'week', label: 'This week' },
  { key: 'vote', label: 'Vote' },
  { key: 'next', label: 'Next up' },
  { key: 'photos', label: 'Photos' },
];

const WALL = ['full-house', 'the-crowd', 'prize', 'couch', 'locked-in', 'sofa', 'pit-lane', 'headset', 'hands'];

const card = 'rounded-2xl border border-border bg-card p-4 shadow-card';
const label = 'text-[10.5px] font-extrabold uppercase tracking-wider text-error';
const input = 'min-h-[46px] w-full rounded-xl border border-border bg-card px-3 text-body text-text-primary placeholder:text-text-secondary/70 focus:border-primary focus:outline-none';

export function CommunityPage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>('week');
  // What is known only in this browser (joined here, left a contact) waits for mount so the server and first paint agree.
  const [mounted, setMounted] = useState(false);
  const [joinedLocal, setJoinedLocal] = useState(false);
  const [leadDone, setLeadDone] = useState(false);

  const { data } = useQuery({ queryKey: ['community-week'], queryFn: getThisWeek, staleTime: 30_000, retry: false });
  const { data: drops } = useQuery({ queryKey: ['home-drops'], queryFn: listDrops, staleTime: 60_000, retry: false });
  const { data: challenge } = useQuery({
    queryKey: ['challenges', FEATURED_CHALLENGE_SLUG],
    queryFn: () => getChallenge(FEATURED_CHALLENGE_SLUG),
    staleTime: 60_000,
    retry: false,
  });

  const member = joinedLocal || Boolean(data?.isMember);
  const liveDrop = (drops ?? []).filter((d) => d.state === 'open' || d.state === 'early').sort((a, b) => Number(/gta\s*6/i.test(b.game)) - Number(/gta\s*6/i.test(a.game)))[0] ?? null;
  const nextChallenge = challenge && isUpcoming(challenge) ? challenge : null;

  useEffect(() => {
    setMounted(true);
    setJoinedLocal(joinedHere());
    setLeadDone(leadLeftHere());
    const fromHash = () => {
      const h = window.location.hash.replace('#', '') as Tab;
      if (TABS.some((t) => t.key === h)) setTab(h);
    };
    fromHash();
    window.addEventListener('hashchange', fromHash);
    // One "landed" per visit; the server adds the ad and whether it was Instagram's browser.
    try {
      if (!sessionStorage.getItem('khelo.community.landed')) {
        sessionStorage.setItem('khelo.community.landed', '1');
        trackAction('community_landed', { inApp: isInAppBrowser(navigator.userAgent) });
      }
    } catch {
      trackAction('community_landed');
    }
    return () => window.removeEventListener('hashchange', fromHash);
  }, []);

  // Seeing the page clears the red dot on the nav for this week's post.
  useEffect(() => {
    if (!data?.post) return;
    try {
      localStorage.setItem(SEEN_POST_KEY, data.post.id);
    } catch {
      /* private window */
    }
  }, [data?.post]);

  const pick = useCallback((t: Tab) => {
    setTab(t);
    trackAction('community_tab', { tab: t });
    try {
      history.replaceState(null, '', `#${t}`);
    } catch {
      /* ignore */
    }
  }, []);

  const onJoin = (where: string) => {
    recordJoin(where);
    setJoinedLocal(true);
    qc.invalidateQueries({ queryKey: ['community-week'] });
  };

  const members = data?.members ?? 0;
  const showMembers = members >= 10;

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 pb-36 md:pb-8">
      {/* Top: the reason, the real number, one button. */}
      <section className="relative isolate flex min-h-[220px] flex-col justify-end overflow-hidden rounded-3xl bg-secondary p-5 text-white md:min-h-[280px] md:p-8">
        {/* eslint-disable-next-line @next/next/no-img-element -- static photo from /public */}
        <img src="/community/full-house.webp" alt="" className="absolute inset-0 -z-10 h-full w-full object-cover" />
        <div className="absolute inset-0 -z-10 bg-gradient-to-t from-black/90 via-black/40 to-black/10" />
        <p className="text-[10.5px] font-extrabold uppercase tracking-wider text-[#FFB4AC]">KHEL-O Community · Hyderabad</p>
        <h1 className="mt-1 font-heading text-[30px] font-bold leading-[1.05] md:text-[44px]">Be there when it drops.</h1>
        <p className="mt-2 max-w-xl text-body text-white/85">
          Drops, challenges and café news land in our WhatsApp group first.{' '}
          {showMembers ? <b className="text-white">{members} gamers are already in.</b> : 'Free to join, leave any time.'}
        </p>
        <div className="mt-4 hidden md:block">{mounted && !member && <JoinButton where="community_page_top" onJoin={onJoin} />}</div>
      </section>

      {/* Joined: a short thanks and an optional contact. Not joined: the sticky button below. */}
      {mounted && member && (
        <section className={cn(card, 'flex flex-col gap-3 border-[#BFE9D4] bg-[#ECFAF3]')}>
          <div className="flex items-start gap-3">
            <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-success text-white"><Check className="h-5 w-5" aria-hidden /></span>
            <div className="min-w-0 flex-1">
              <p className="font-heading text-body-emphasis font-bold text-text-primary">You are in. Welcome.</p>
              <p className="text-caption text-text-secondary">If WhatsApp did not open, tap below. Then check the other tabs: a vote, the next drop, the photo wall.</p>
            </div>
            <a
              href={COMMUNITY_URL}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => trackAction('community_join_tap', { where: 'community_page_again' })}
              className="inline-flex min-h-[40px] flex-shrink-0 items-center gap-1.5 rounded-full bg-[#25D366] px-3.5 text-caption font-bold text-[#06210F]"
            >
              <WhatsAppIcon className="h-4 w-4" aria-hidden /> Open
            </a>
          </div>
          {!leadDone && <LeadForm onDone={() => setLeadDone(true)} />}
        </section>
      )}

      {/* Tabs: each one fits a screen, so nothing is a long scroll. */}
      <div role="tablist" aria-label="Community" className="sticky top-16 z-20 -mx-1 flex gap-1 rounded-2xl bg-[#E9E6DF] p-1">
        {TABS.map((t) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={tab === t.key}
            type="button"
            onClick={() => pick(t.key)}
            className={cn(
              'min-h-[44px] flex-1 whitespace-nowrap rounded-xl px-2 text-caption font-extrabold transition-colors',
              tab === t.key ? 'bg-card text-text-primary shadow-sm' : 'text-text-secondary',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'week' && (
        <div className="grid gap-4 md:grid-cols-2">
          <WeekPost post={data?.post ?? null} />
          <MembersCode code={data?.poll?.code ?? null} hasCode={Boolean(data?.poll?.hasCode)} note={data?.poll?.codeNote ?? null} member={member} />
          <div className={cn(card, 'md:col-span-2')}>
            <p className={label}>Happening now</p>
            <div className="mt-2 flex flex-col divide-y divide-border">
              {liveDrop && (
                <Row href={`/drops/${liveDrop.slug}`} title={`${liveDrop.game} at ${liveDrop.cafe.name}`} line={liveDrop.seatsPerSlot ? `${liveDrop.seatsPerSlot} seats a night` : `${liveDrop.seatsLeft} of ${liveDrop.seatsTotal} seats left`} cta="Reserve" />
              )}
              {nextChallenge && (
                <Row href={`/challenge/${nextChallenge.slug}?join=1`} title={nextChallenge.title} line={`${challengeDay(nextChallenge.startsAt)} · ${openToAll(nextChallenge.capacity) ? 'Free to play' : `${nextChallenge.spotsLeft} of ${nextChallenge.capacity} spots left`}`} cta="Sign up" />
              )}
              {challenge && !nextChallenge && <Row href={`/challenge/${challenge.slug}`} title={challenge.title} line="Finished. See the photos and results." cta="See" />}
              {!liveDrop && !challenge && <p className="py-2 text-body text-text-secondary">Nothing live right now. The next one lands in the group first.</p>}
            </div>
          </div>
        </div>
      )}

      {tab === 'vote' && <VoteTab poll={data?.poll ?? null} closed={data?.closedPolls ?? []} onVoted={() => qc.invalidateQueries({ queryKey: ['community-week'] })} />}

      {tab === 'next' && (
        <div className="grid gap-4 md:grid-cols-2">
          {liveDrop ? <DropCard d={liveDrop} /> : <div className={card}><p className={label}>Drops</p><p className="mt-1 text-body text-text-secondary">No drop open. The next one goes to the group first.</p></div>}
          {challenge ? (
            <Link href={`/challenge/${challenge.slug}${nextChallenge ? '?join=1' : ''}`} className={cn(card, 'flex flex-col gap-1 transition-colors hover:border-primary/50')}>
              <p className={label}>{nextChallenge ? 'Next challenge' : 'Last challenge'}</p>
              <p className="font-heading text-body-emphasis font-bold text-text-primary">{challenge.title}</p>
              <p className="text-caption text-text-secondary">{nextChallenge ? `${challengeDay(challenge.startsAt)} · ${openToAll(challenge.capacity) ? 'Free to play' : `${challenge.spotsLeft} spots left`}` : 'See the photos and who won.'}</p>
              <span className="mt-1 inline-flex items-center gap-1 text-caption font-bold text-primary">{nextChallenge ? 'Sign up to play' : 'See the recap'} <ArrowRight className="h-4 w-4" aria-hidden /></span>
            </Link>
          ) : null}
          <Link href="/browse" className={cn(card, 'flex flex-col gap-1 transition-colors hover:border-primary/50 md:col-span-2')}>
            <p className={label}>Cafés</p>
            <p className="font-heading text-body-emphasis font-bold text-text-primary">Book a session at a gaming café near you</p>
            <span className="inline-flex items-center gap-1 text-caption font-bold text-primary">Explore cafés <ArrowRight className="h-4 w-4" aria-hidden /></span>
          </Link>
        </div>
      )}

      {tab === 'photos' && <PhotosTab contributors={data?.contributors ?? []} />}

      {/* Not joined yet: one big button that follows you down the page on phones. */}
      {mounted && !member && (
        <div className="fixed inset-x-0 bottom-[calc(var(--bottom-nav-height)+env(safe-area-inset-bottom))] z-30 bg-gradient-to-t from-surface via-surface to-transparent px-4 pb-3 pt-6 md:hidden">
          <JoinButton where="community_page_sticky" onJoin={onJoin} />
          <p className="mt-1 text-center text-[11px] text-text-secondary">10 seconds. Free. Leave any time.</p>
        </div>
      )}
    </div>
  );
}

function JoinButton({ where, onJoin }: { where: string; onJoin: (where: string) => void }) {
  return (
    <a
      href={COMMUNITY_URL}
      target="_blank"
      rel="noopener noreferrer"
      onClick={() => onJoin(where)}
      className="flex min-h-[52px] w-full items-center justify-center gap-2 rounded-2xl bg-[#25D366] px-6 font-heading text-body-emphasis font-bold text-[#06210F] shadow-float transition-transform active:scale-[0.99] md:w-auto"
    >
      <WhatsAppIcon className="h-5 w-5" aria-hidden /> Join the community · free
    </a>
  );
}

function Row({ href, title, line, cta }: { href: string; title: string; line: string; cta: string }) {
  return (
    <Link href={href} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
      <span className="min-w-0">
        <span className="block truncate font-heading text-body-emphasis font-bold text-text-primary">{title}</span>
        <span className="block truncate text-caption text-text-secondary">{line}</span>
      </span>
      <span className="flex-shrink-0 rounded-full bg-secondary px-3.5 py-1.5 text-caption font-bold text-white">{cta}</span>
    </Link>
  );
}

function DropCard({ d }: { d: NonNullable<Awaited<ReturnType<typeof listDrops>>>[number] }) {
  const art = dropArt(d);
  return (
    <Link href={`/drops/${d.slug}`} className="relative flex min-h-[190px] flex-col justify-end overflow-hidden rounded-2xl bg-gradient-to-br from-[#5B1A2A] to-[#D0463C] p-4 text-white shadow-card">
      {art && <div className="absolute inset-0" style={{ backgroundImage: `url(${art})`, backgroundSize: 'cover', backgroundPosition: 'center' }} aria-hidden />}
      <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-transparent" />
      <p className="relative text-[10.5px] font-extrabold uppercase tracking-wider text-[#FFB4AC]">Drop · live</p>
      <p className="relative font-heading text-h3 font-bold leading-tight">{d.title}</p>
      <p className="relative text-caption text-white/85">{d.cafe.name} · {d.seatsPerSlot ? `${d.seatsPerSlot} seats a night` : `${d.seatsLeft} seats left`}</p>
    </Link>
  );
}

function WeekPost({ post }: { post: { headline: string; line: string | null; imageUrl: string | null; buttonLabel: string | null; buttonUrl: string | null; createdAt: string } | null }) {
  if (!post) {
    return (
      <div className={card}>
        <p className={label}>This week</p>
        <p className="mt-1 font-heading text-body-emphasis font-bold text-text-primary">The next post lands in the group first.</p>
        <p className="text-caption text-text-secondary">Join above so you do not miss it.</p>
      </div>
    );
  }
  const internal = post.buttonUrl?.startsWith('/');
  const posted = new Date(post.createdAt).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' });
  return (
    <div className={cn(card, 'overflow-hidden p-0')}>
      {post.imageUrl && (
        // eslint-disable-next-line @next/next/no-img-element -- admin-supplied photo link
        <img src={post.imageUrl} alt="" loading="lazy" className="h-40 w-full object-cover" />
      )}
      <div className="flex flex-col gap-1 p-4">
        <p className={label}>Weekly post · {posted}</p>
        <p className="font-heading text-h3 font-bold leading-tight text-text-primary">{post.headline}</p>
        {post.line && <p className="text-body text-text-secondary">{post.line}</p>}
        {post.buttonLabel && post.buttonUrl && (
          internal ? (
            <Link href={post.buttonUrl} className="mt-2 inline-flex min-h-[44px] items-center gap-1.5 self-start rounded-full bg-primary px-5 text-caption font-bold text-white">{post.buttonLabel} <ArrowRight className="h-4 w-4" aria-hidden /></Link>
          ) : (
            <a href={post.buttonUrl} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex min-h-[44px] items-center gap-1.5 self-start rounded-full bg-primary px-5 text-caption font-bold text-white">{post.buttonLabel} <ArrowRight className="h-4 w-4" aria-hidden /></a>
          )
        )}
      </div>
    </div>
  );
}

function MembersCode({ code, hasCode, note, member }: { code: string | null; hasCode: boolean; note: string | null; member: boolean }) {
  const [copied, setCopied] = useState(false);
  if (!hasCode) return null;
  const copy = async () => {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard blocked: the code is on screen */
    }
  };
  return (
    <div className={card}>
      <div className="flex items-center justify-between gap-2">
        <p className={label}>Members-only code</p>
        {member && code ? (
          <button type="button" onClick={copy} className="inline-flex min-h-[36px] items-center gap-1 rounded-full border border-border px-3 text-caption font-bold text-text-primary">
            {copied ? <Check className="h-3.5 w-3.5" aria-hidden /> : <Copy className="h-3.5 w-3.5" aria-hidden />} {copied ? 'Copied' : 'Copy'}
          </button>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-2.5 py-1 text-[11px] font-bold text-white"><Lock className="h-3 w-3" aria-hidden /> Locked</span>
        )}
      </div>
      <p className={cn('mt-1 font-heading text-[26px] font-bold tracking-[0.14em] text-text-primary', !(member && code) && 'select-none blur-[6px]')} aria-hidden={!(member && code)}>
        {member && code ? code : 'XXXXXXXXX'}
      </p>
      <p className="text-caption text-text-secondary">{member && code ? note || 'Use it at checkout. Only members see this.' : 'Tap Join and it unlocks right here. Members get new codes first.'}</p>
    </div>
  );
}

function VoteTab({ poll, closed, onVoted }: { poll: NonNullable<Awaited<ReturnType<typeof getThisWeek>>['poll']> | null; closed: { question: string; winner: string; votes: number }[]; onVoted: () => void }) {
  const [busy, setBusy] = useState<number | null>(null);
  const [err, setErr] = useState('');
  const vote = async (i: number) => {
    if (!poll || poll.closed) return;
    setErr('');
    setBusy(i);
    try {
      await voteInPoll(poll.id, i);
      markVoted();
      trackAction('community_poll_vote', { poll: poll.id });
      onVoted();
    } catch (e) {
      setErr((e as { message?: string })?.message || 'Could not save your vote. Try again.');
    } finally {
      setBusy(null);
    }
  };
  const closes = poll?.closesAt ? new Date(poll.closesAt).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' }) : null;
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className={card}>
        {poll ? (
          <div className="flex flex-col gap-2">
            <p className={label}>{poll.closed ? 'Closed' : `Open${closes ? ` · closes ${closes}` : ''}`}</p>
            <p className="font-heading text-h3 font-bold leading-tight text-text-primary">{poll.question}</p>
            {poll.options.map((o, i) => {
              const mine = poll.myVote === i;
              const showPct = poll.myVote !== null || poll.closed;
              return (
                <button
                  key={o.label}
                  type="button"
                  disabled={poll.closed || busy !== null}
                  onClick={() => vote(i)}
                  aria-pressed={mine}
                  className={cn('relative flex min-h-[48px] items-center justify-between overflow-hidden rounded-xl border px-3 text-left text-body font-semibold transition-colors', mine ? 'border-primary' : 'border-border hover:border-primary/50')}
                >
                  {showPct && <span className={cn('absolute inset-y-0 left-0', mine ? 'bg-primary/25' : 'bg-primary/10')} style={{ width: `${o.percent}%` }} aria-hidden />}
                  <span className="relative">{o.label}{mine ? ' · your vote' : ''}</span>
                  {showPct && <span className="relative text-caption font-bold">{o.percent}%</span>}
                </button>
              );
            })}
            <p className="text-caption text-text-secondary">{poll.total} {poll.total === 1 ? 'vote' : 'votes'} · {poll.myVote === null ? 'tap a choice to vote, no login needed' : 'you can change your vote until it closes'}</p>
            {err && <p role="alert" className="text-caption text-error">{err}</p>}
          </div>
        ) : (
          <div>
            <p className={label}>Vote</p>
            <p className="mt-1 text-body text-text-secondary">No vote open right now. The next one is announced in the group.</p>
          </div>
        )}
      </div>
      {closed.length > 0 && (
        <div className={card}>
          <p className={label}>Closed votes</p>
          <div className="mt-2 flex flex-col divide-y divide-border">
            {closed.map((c) => (
              <div key={c.question} className="py-2 first:pt-0 last:pb-0">
                <p className="font-heading text-body-emphasis font-bold text-text-primary">{c.question}</p>
                <p className="text-caption text-text-secondary">Winner: {c.winner} · {c.votes} votes</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function PhotosTab({ contributors }: { contributors: string[] }) {
  const [sheet, setSheet] = useState<null | 'cafe' | 'photos'>(null);
  const [thanks, setThanks] = useState('');
  return (
    <div className="grid gap-4 md:grid-cols-[1.4fr_1fr]">
      <div className="grid grid-cols-3 gap-1.5 md:gap-2">
        {WALL.map((n) => (
          // eslint-disable-next-line @next/next/no-img-element -- small static photos from /public
          <img key={n} src={`/community/${n}.webp`} alt="" loading="lazy" className="aspect-square w-full rounded-xl object-cover" />
        ))}
      </div>
      <div className="flex flex-col gap-3">
        {thanks && <p role="status" className="rounded-xl bg-success/10 px-3 py-2 text-body text-text-primary">{thanks}</p>}
        <div className={cn(card, 'flex flex-col gap-2')}>
          <p className="font-heading text-body-emphasis font-bold text-text-primary">Know a café we are missing?</p>
          <p className="text-caption text-text-secondary">Tell us the name and area. We reach out to the owner.</p>
          <button type="button" onClick={() => { trackAction('community_tile_tap', { tile: 'suggest_cafe' }); setSheet('cafe'); }} className="min-h-[46px] rounded-xl bg-primary font-bold text-white">Suggest a café</button>
        </div>
        <div className={cn(card, 'flex flex-col gap-2')}>
          <p className="font-heading text-body-emphasis font-bold text-text-primary">Got photos from a challenge?</p>
          <p className="text-caption text-text-secondary">Share a link. Good ones go on the wall.</p>
          <button type="button" onClick={() => { trackAction('community_tile_tap', { tile: 'share_photos' }); setSheet('photos'); }} className="min-h-[46px] rounded-xl border border-border bg-card font-bold text-text-primary">Share photos</button>
        </div>
        {contributors.length > 0 && <p className="text-caption text-text-secondary">Thanks to {contributors.join(', ')}.</p>}
      </div>
      {sheet && <ContributeSheet kind={sheet} onClose={() => setSheet(null)} onDone={(m) => { setSheet(null); setThanks(m); }} />}
    </div>
  );
}

function ContributeSheet({ kind, onClose, onDone }: { kind: 'cafe' | 'photos'; onClose: () => void; onDone: (msg: string) => void }) {
  const cafe = kind === 'cafe';
  const [title, setTitle] = useState('');
  const [detail, setDetail] = useState('');
  const [name, setName] = useState('');
  const [contact, setContact] = useState('');
  const [showName, setShowName] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const submit = async () => {
    if (title.trim().length < 2) {
      setError(cafe ? 'Add the café name.' : 'Say which event the photos are from.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await sendContribution({ kind, title: title.trim(), detail: detail.trim() || undefined, showName, name: name.trim() || undefined, contact: contact.trim() || undefined });
      markSuggested();
      trackAction('community_contribution', { kind });
      onDone(cafe ? 'Thanks. We will check it out and reach out if it goes live.' : 'Thanks. We will look at it and add it to the wall.');
    } catch (e) {
      setError((e as { message?: string })?.message || 'Could not send. Try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/60 md:items-center" role="dialog" aria-modal="true" aria-label={cafe ? 'Suggest a café' : 'Share your photos'} onClick={onClose}>
      <div className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-card p-5 pb-7 md:rounded-3xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <h3 className="font-heading text-h3 font-bold text-text-primary">{cafe ? 'Suggest a café' : 'Share your photos'}</h3>
          <button type="button" onClick={onClose} aria-label="Close" className="flex h-11 w-11 items-center justify-center rounded-full bg-surface"><X className="h-4 w-4" aria-hidden /></button>
        </div>
        <div className="mt-3 flex flex-col gap-3">
          <label className="text-caption font-bold text-text-secondary">
            {cafe ? 'Café name' : 'Which event or café?'}
            <input className={cn(input, 'mt-1')} value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} placeholder={cafe ? 'e.g. Pixel Arena' : 'e.g. Tekken #01 at AdamsDen'} />
          </label>
          <label className="text-caption font-bold text-text-secondary">
            {cafe ? 'Where is it, and why should we add it?' : 'A link to the photos (Drive, Instagram, anything)'}
            <textarea className={cn(input, 'mt-1 min-h-[84px] py-2')} value={detail} maxLength={1000} onChange={(e) => setDetail(e.target.value)} placeholder={cafe ? 'Area, what they have, what you like' : 'Paste a link'} />
          </label>
          <label className="text-caption font-bold text-text-secondary">
            Your name (optional)
            <input className={cn(input, 'mt-1')} value={name} maxLength={60} onChange={(e) => setName(e.target.value)} placeholder="So we can say thanks" />
          </label>
          <label className="text-caption font-bold text-text-secondary">
            Email or phone (optional)
            <input className={cn(input, 'mt-1')} value={contact} maxLength={160} onChange={(e) => setContact(e.target.value)} placeholder="Only used to reach you about this" />
          </label>
          <label className="flex items-center gap-2 text-body text-text-primary">
            <input type="checkbox" checked={showName} onChange={(e) => setShowName(e.target.checked)} className="h-4 w-4 accent-primary" />
            Put my first name on the contributors list
          </label>
          {error && <p role="alert" className="text-caption text-error">{error}</p>}
          <button type="button" onClick={submit} disabled={busy} className="min-h-[48px] rounded-xl bg-primary font-extrabold text-white disabled:opacity-60">{busy ? 'Sending…' : 'Send'}</button>
        </div>
      </div>
    </div>
  );
}

/** After joining: an optional email or number, so we can send drop alerts and offers. Promotions only with the ticked box. */
function LeadForm({ onDone }: { onDone: () => void }) {
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [ok, setOk] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const save = async () => {
    if (!email.trim() && !phone.trim()) {
      setErr('Add an email or a number, or skip.');
      return;
    }
    setBusy(true);
    setErr('');
    try {
      await leaveContact({ email: email.trim() || undefined, phone: phone.trim() || undefined, marketingOk: ok });
      markLeadLeft();
      trackAction('community_lead', { email: Boolean(email.trim()), phone: Boolean(phone.trim()) });
      onDone();
    } catch (e) {
      setErr((e as { message?: string })?.message || 'Could not save. Try again.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flex flex-col gap-2 border-t border-[#BFE9D4] pt-3">
      <p className="text-caption font-bold text-text-primary">Want a heads-up when a drop opens? (optional)</p>
      <div className="grid gap-2 sm:grid-cols-2">
        <input className={input} type="email" inputMode="email" autoComplete="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} aria-label="Email" />
        <input className={input} type="tel" inputMode="tel" autoComplete="tel" placeholder="WhatsApp number" value={phone} onChange={(e) => setPhone(e.target.value)} aria-label="WhatsApp number" />
      </div>
      <label className="flex items-start gap-2 text-caption text-text-secondary">
        <input type="checkbox" checked={ok} onChange={(e) => setOk(e.target.checked)} className="mt-0.5 h-4 w-4 accent-primary" />
        <span>Send me drops, challenges and offers by email. One tap to stop any time.</span>
      </label>
      {err && <p role="alert" className="text-caption text-error">{err}</p>}
      <div className="flex gap-2">
        <button type="button" onClick={save} disabled={busy} className="min-h-[44px] flex-1 rounded-xl bg-secondary font-bold text-white disabled:opacity-60">{busy ? 'Saving…' : 'Save'}</button>
        <button type="button" onClick={() => { markLeadLeft(); onDone(); }} className="min-h-[44px] rounded-xl border border-border px-4 font-bold text-text-secondary">Skip</button>
      </div>
    </div>
  );
}
