'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Camera, Check, Copy, Handshake, KeyRound, Store, ThumbsUp, X } from 'lucide-react';
import { fightFont } from '@/components/challenge/ChallengeHero';
import { getThisWeek, sendContribution, voteInPoll, type ContributionBody } from '@/lib/api/community';
import { trackAction } from '@/lib/api/analyticsEvents';
import { useAuthStore } from '@/store/authStore';

/** "This week" (a vote and a members-only code) and "Help build KHEL-O".
 *  The reasons to come back to the community page every week. */
export function CommunityHub({ tapped }: { tapped: boolean }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ['community-week', isAuthenticated], queryFn: getThisWeek, staleTime: 30_000, retry: false });
  const [voting, setVoting] = useState<number | null>(null);
  const [voteError, setVoteError] = useState('');
  const [copied, setCopied] = useState(false);
  const [sheet, setSheet] = useState<null | 'cafe' | 'photos'>(null);
  const [thanks, setThanks] = useState('');

  const poll = data?.poll ?? null;
  const isMember = Boolean(data?.isMember);

  const vote = async (i: number) => {
    if (!poll || poll.closed) return;
    setVoteError('');
    setVoting(i);
    try {
      await voteInPoll(poll.id, i);
      trackAction('community_poll_vote', { poll: poll.id });
      await qc.invalidateQueries({ queryKey: ['community-week'] });
    } catch (e) {
      setVoteError((e as { message?: string })?.message || 'Could not save your vote. Try again.');
    } finally {
      setVoting(null);
    }
  };

  const copyCode = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard blocked: the code is on screen */
    }
  };

  const loginHref = '/login?redirect=%2Fcommunity';
  const card = 'rounded-2xl border border-[#2A2C34] bg-[#16171C] p-4';

  return (
    <section aria-labelledby="hub-week" className="mt-10 grid gap-8 md:grid-cols-2 md:gap-6 lg:grid-cols-[1fr_1.4fr] lg:gap-10">
      {/* This week */}
      <div className="flex flex-col gap-3">
        <h2 id="hub-week" className={`${fightFont.className} flex items-center gap-2 text-3xl font-bold uppercase leading-none`}>
          This week
        </h2>

        {isLoading && <div className="h-40 animate-pulse rounded-2xl bg-[#16171C]" aria-label="Loading this week" />}

        {poll && (
          <div className={card}>
            <p className="text-[15px] font-bold">{poll.question}</p>
            <p className="mt-0.5 text-xs text-[#A9A39A]">
              {poll.closed ? 'Closed' : poll.closesAt ? `Closes ${new Date(poll.closesAt).toLocaleDateString('en-IN', { weekday: 'long', timeZone: 'Asia/Kolkata' })}` : 'Open now'} · {poll.total} {poll.total === 1 ? 'vote' : 'votes'}
            </p>
            <ul className="mt-3 flex flex-col gap-2">
              {poll.options.map((o, i) => {
                const mine = poll.myVote === i;
                const showBars = poll.myVote !== null || poll.closed;
                return (
                  <li key={o.label}>
                    {isAuthenticated ? (
                      <button
                        type="button"
                        onClick={() => vote(i)}
                        disabled={poll.closed || voting !== null}
                        aria-pressed={mine}
                        className={`relative w-full overflow-hidden rounded-xl border px-3 py-2.5 text-left text-sm font-bold transition-colors ${mine ? 'border-[#F2C94C] bg-[#2A2208]' : 'border-[#2A2C34] bg-[#0E0F13] hover:border-[#F2C94C]/60'} disabled:opacity-70`}
                      >
                        {showBars && <span aria-hidden className="absolute inset-y-0 left-0 bg-[#F2C94C]/15" style={{ width: `${o.percent}%` }} />}
                        <span className="relative flex items-center justify-between gap-2">
                          <span className="flex items-center gap-1.5">
                            {mine && <Check className="h-4 w-4 text-[#F2C94C]" aria-hidden />}
                            {o.label}
                          </span>
                          {showBars && <span className="tabular-nums text-[#F2C94C]">{o.percent}%</span>}
                        </span>
                      </button>
                    ) : (
                      <div className="relative overflow-hidden rounded-xl border border-[#2A2C34] bg-[#0E0F13] px-3 py-2.5 text-sm font-bold">
                        <span aria-hidden className="absolute inset-y-0 left-0 bg-[#F2C94C]/15" style={{ width: `${o.percent}%` }} />
                        <span className="relative flex justify-between"><span>{o.label}</span><span className="tabular-nums text-[#F2C94C]">{o.percent}%</span></span>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
            {!isAuthenticated && !poll.closed && (
              <Link href={loginHref} className="mt-3 inline-flex min-h-[44px] w-full items-center justify-center rounded-xl bg-[#F2C94C] px-4 text-sm font-extrabold text-[#1A1405]">
                Log in to vote
              </Link>
            )}
            {voteError && <p role="alert" className="mt-2 text-xs text-[#E8675D]">{voteError}</p>}
            {poll.myVote !== null && <p className="mt-2 text-xs text-[#7FE0A0]">Your vote is in. Tap another to change it.</p>}
          </div>
        )}

        {poll?.hasCode && (
          <div className={`${card} flex items-center gap-3`}>
            <span className="flex h-10 w-10 flex-none items-center justify-center rounded-xl bg-[#2A2208] text-[#F2C94C]">
              <KeyRound className="h-5 w-5" aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[15px] font-bold">Members only: early access code</p>
              <p className="text-xs text-[#A9A39A]">{poll.codeNote || 'Shared here first for the next drop'}</p>
            </div>
            {poll.code ? (
              <button type="button" onClick={() => copyCode(poll.code as string)} className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl bg-[#25D366] px-3 font-mono text-sm font-extrabold text-[#06210F]">
                {poll.code} {copied ? <Check className="h-4 w-4" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />}
              </button>
            ) : (
              <span className="rounded-xl bg-[#23252C] px-3 py-2 text-xs font-bold text-[#A9A39A]">
                {!isAuthenticated ? 'Log in + join' : tapped || isMember ? 'Joining…' : 'Join first'}
              </span>
            )}
          </div>
        )}
        {poll?.hasCode && !poll.code && !isAuthenticated && (
          <p className="-mt-1 text-xs text-[#A9A39A]">
            <Link href={loginHref} className="font-bold text-[#7FE0A0] underline">Log in</Link>, then tap Join above to see the code.
          </p>
        )}
        {poll?.hasCode && !poll.code && isAuthenticated && !isMember && (
          <p className="-mt-1 text-xs text-[#A9A39A]">Tap <b className="text-[#F4F1EC]">Join the group</b> above and the code shows here.</p>
        )}
        {!isLoading && !poll && <p className={`${card} text-sm text-[#A9A39A]`}>No vote this week. The next one is posted here first.</p>}
      </div>

      {/* Help build KHEL-O */}
      <div className="flex flex-col gap-3">
        <h2 className={`${fightFont.className} text-3xl font-bold uppercase leading-none`}>Help build KHEL-O</h2>
        <div className="grid grid-cols-2 gap-2.5 lg:gap-4">
          <Tile icon={<Store className="h-5 w-5" aria-hidden />} title="Suggest a café" body="Know a spot we are missing? Add it in 20 seconds." reward="Scout" onClick={() => setSheet('cafe')} />
          <Tile icon={<Handshake className="h-5 w-5" aria-hidden />} title="Know a café owner?" body="Introduce us. We will reach out and say you sent us." reward="Connector" href="/know-the-owner" />
          <Tile icon={<Camera className="h-5 w-5" aria-hidden />} title="Share your photos" body="Got a shot from a challenge? Put it on the wall." reward="Credit on the wall" onClick={() => setSheet('photos')} />
          <Tile icon={<ThumbsUp className="h-5 w-5" aria-hidden />} title="Vote a café online" body={'Help the ones marked "Booking soon" go live.'} reward="Early Voter" href="/" />
        </div>
        {thanks && <p role="status" className="flex items-start gap-2 rounded-xl border border-[#3B6B4A] bg-[#13221A] px-3 py-2.5 text-sm"><Check className="mt-0.5 h-4 w-4 flex-none text-[#7FE0A0]" aria-hidden />{thanks}</p>}
        {data && data.contributors.length > 0 && (
          <div className={card}>
            <p className="text-[15px] font-bold">Contributors this month</p>
            <p className="text-xs text-[#A9A39A]">Names go on the wall when they opt in.</p>
            <div className="mt-2.5 flex flex-wrap gap-2">
              {data.contributors.map((n) => (
                <span key={n} className="rounded-full bg-[#23252C] px-3 py-1 text-xs font-bold">{n}</span>
              ))}
            </div>
          </div>
        )}
      </div>

      {sheet && (
        <ContributeSheet
          kind={sheet}
          loggedIn={isAuthenticated}
          loginHref={loginHref}
          onClose={() => setSheet(null)}
          onDone={(msg) => {
            setSheet(null);
            setThanks(msg);
            qc.invalidateQueries({ queryKey: ['community-week'] });
          }}
        />
      )}
    </section>
  );
}

function Tile({ icon, title, body, reward, onClick, href }: { icon: React.ReactNode; title: string; body: string; reward: string; onClick?: () => void; href?: string }) {
  const inner = (
    <>
      <span className="mb-2 flex h-9 w-9 items-center justify-center rounded-xl bg-[#23252C] text-[#F2C94C]">{icon}</span>
      <span className="block text-[14.5px] font-bold leading-tight">{title}</span>
      <span className="mt-1 block text-xs leading-snug text-[#A9A39A]">{body}</span>
      <span className="mt-2 inline-block rounded-full bg-[#2A2208] px-2.5 py-0.5 text-[11px] font-extrabold text-[#F2C94C]">+ {reward}</span>
    </>
  );
  const cls = 'flex min-h-[44px] flex-col items-start rounded-2xl border border-[#2A2C34] bg-[#16171C] p-3 text-left transition-colors hover:border-[#F2C94C]/50';
  return href ? (
    <Link href={href} onClick={() => trackAction('community_tile_tap', { tile: title })} className={cls}>{inner}</Link>
  ) : (
    <button type="button" onClick={() => { trackAction('community_tile_tap', { tile: title }); onClick?.(); }} className={cls}>{inner}</button>
  );
}

function ContributeSheet({ kind, loggedIn, loginHref, onClose, onDone }: { kind: 'cafe' | 'photos'; loggedIn: boolean; loginHref: string; onClose: () => void; onDone: (msg: string) => void }) {
  const cafe = kind === 'cafe';
  const [title, setTitle] = useState('');
  const [detail, setDetail] = useState('');
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
    const body: ContributionBody = { kind, title: title.trim(), detail: detail.trim() || undefined, showName };
    try {
      await sendContribution(body);
      trackAction('community_contribution', { kind });
      onDone(cafe ? 'Thanks. We will check it out and message you if it goes live.' : 'Thanks. We will look at it and add it to the wall.');
    } catch (e) {
      setError((e as { message?: string })?.message || 'Could not send. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const field = 'w-full rounded-xl border border-[#2A2C34] bg-[#0E0F13] px-3 py-2.5 text-[15px] text-[#F4F1EC] placeholder:text-[#6F6A76] focus:border-[#F2C94C] focus:outline-none';
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 md:items-center" role="dialog" aria-modal="true" aria-label={cafe ? 'Suggest a café' : 'Share your photos'} onClick={onClose}>
      <div className="w-full max-w-md rounded-t-3xl border border-[#2A2C34] bg-[#16171C] p-5 pb-7 md:rounded-3xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <h3 className={`${fightFont.className} text-3xl font-bold uppercase leading-none`}>{cafe ? 'Suggest a café' : 'Share your photos'}</h3>
          <button type="button" onClick={onClose} aria-label="Close" className="flex h-11 w-11 items-center justify-center rounded-full bg-[#23252C]"><X className="h-4 w-4" aria-hidden /></button>
        </div>
        {!loggedIn ? (
          <div className="mt-4">
            <p className="text-sm text-[#C9C4CF]">Log in first, so we can say thanks and give you the badge.</p>
            <Link href={loginHref} className="mt-3 flex min-h-[48px] items-center justify-center rounded-xl bg-[#D0463C] font-bold text-white">Log in</Link>
          </div>
        ) : (
          <div className="mt-4 flex flex-col gap-3">
            <label className="text-xs font-bold text-[#A9A39A]">
              {cafe ? 'Café name' : 'Which event or café?'}
              <input className={`${field} mt-1`} value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} placeholder={cafe ? 'e.g. Pixel Arena' : 'e.g. Tekken #01 at AdamsDen'} />
            </label>
            <label className="text-xs font-bold text-[#A9A39A]">
              {cafe ? 'Where is it, and why should we add it?' : 'A link to the photos (Drive, Instagram, anything)'}
              <textarea className={`${field} mt-1 min-h-[88px]`} value={detail} maxLength={1000} onChange={(e) => setDetail(e.target.value)} placeholder={cafe ? 'Area, what they have, what you like' : 'Paste a link, or say how to reach you'} />
            </label>
            <label className="flex items-center gap-2 text-sm text-[#DADCE3]">
              <input type="checkbox" checked={showName} onChange={(e) => setShowName(e.target.checked)} className="h-4 w-4 accent-[#F2C94C]" />
              Put my first name on the Contributors wall
            </label>
            {error && <p role="alert" className="text-xs text-[#E8675D]">{error}</p>}
            <button type="button" onClick={submit} disabled={busy} className="min-h-[48px] rounded-xl bg-[#F2C94C] font-extrabold text-[#1A1405] disabled:opacity-60">{busy ? 'Sending…' : 'Send'}</button>
          </div>
        )}
      </div>
    </div>
  );
}
