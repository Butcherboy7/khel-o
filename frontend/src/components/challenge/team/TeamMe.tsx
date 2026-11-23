'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { CalendarDays, Check, Clock, Copy, Hourglass, Instagram, Loader2, MapPin, QrCode, Swords, UserPlus, Users } from 'lucide-react';
import { WhatsAppIcon } from '@/components/icons/WhatsAppIcon';
import { MockPaymentModal } from '@/components/MockPaymentModal';
import { Celebration } from '@/components/challenge/Celebration';
import { fightFont } from '@/components/challenge/ChallengeHero';
import { useRazorpay } from '@/hooks/useRazorpay';
import { trackAction } from '@/lib/api/analyticsEvents';
import { ApiError } from '@/lib/api/errors';
import {
  captainAddsTeammate, getMyTeamEntry, startOfferPayment, tapLink, verifyPayment, type Member, type MyTeamEntry,
} from '@/lib/api/teamChallenges';
import type { TeamChallengeConfig } from '@/challenges/types';
import { Labelled, RIOT_RE, cleanRiot, phoneDigits } from './PlayerFields';
import { StoryCardButton } from './StoryCard';
import { TapButton, TeamShell, field, instaUrl, istDay, istTime, rupees } from './ui';

/** "My entry": am I in, my QR for the door, my team, my match times. */
export function TeamMe({ cfg, isNew }: { cfg: TeamChallengeConfig; isNew: boolean }) {
  const [data, setData] = useState<MyTeamEntry | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const { displayRazorpay, mockModalState } = useRazorpay();

  const load = useCallback(() => {
    getMyTeamEntry(cfg.slug).then(setData).catch((e) => setError((e as Error).message || 'Could not load your entry.'));
  }, [cfg.slug]);
  useEffect(load, [load]);
  // Teammates joining and match times appear without a reload.
  useEffect(() => {
    const t = window.setInterval(() => !document.hidden && load(), 20_000);
    return () => window.clearInterval(t);
  }, [load]);

  const p = data?.player;
  const team = data?.team;

  const tap = (which: 'community' | 'instaKhelo' | 'instaVenue') => () => {
    tapLink(cfg.slug, which);
    setData((d) => d && d.player ? { ...d, player: { ...d.player, [which === 'community' ? 'tappedCommunity' : which === 'instaKhelo' ? 'tappedInstaKhelo' : 'tappedInstaVenue']: true } } : d);
    trackAction(which === 'community' ? 'challenge_community_click' : 'challenge_instagram_click', { challenge: cfg.slug, where: 'me' });
  };

  const payOffer = async () => {
    setBusy(true);
    setError(null);
    try {
      const order = await startOfferPayment(cfg.slug);
      displayRazorpay({
        order_id: order.orderId, amount: Math.round(order.amount * 100), currency: order.currency, key: order.keyId,
        name: 'KHEL-O', description: `${cfg.title}: team entry`,
        onDismiss: () => setBusy(false),
        handler: async (rsp) => {
          try {
            setData(await verifyPayment(cfg.slug, { razorpayOrderId: rsp.razorpay_order_id, razorpayPaymentId: rsp.razorpay_payment_id, razorpaySignature: rsp.razorpay_signature }));
          } catch (e) {
            setError((e as Error).message || 'The payment didn’t go through. Try again.');
          } finally {
            setBusy(false);
          }
        },
      });
    } catch (e) {
      setBusy(false);
      setError((e as Error).message || 'Could not start the payment.');
    }
  };

  if (!data && !error) {
    return (
      <TeamShell cfg={cfg} back={`/challenge/${cfg.slug}`} backLabel="Challenge">
        <div className="flex min-h-[60vh] items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-[#B4B0B8]" aria-label="Loading" /></div>
      </TeamShell>
    );
  }

  const signedUp = !!p && (p.status === 'active' || p.status === 'waitlist');
  const onWaitlist = p?.status === 'waitlist';
  const soloWaiting = p?.role === 'solo' && !team && p.status === 'active';
  const refunded = data?.payment?.status === 'refunded';

  return (
    <TeamShell cfg={cfg} back={`/challenge/${cfg.slug}`} backLabel="Challenge">
      {isNew && signedUp && !onWaitlist && <Celebration id={`team-${cfg.slug}`} big />}
      <main className="mx-auto flex max-w-xl flex-col gap-5 px-4 pb-10 pt-6">
        {error && <p role="alert" className="rounded-2xl border border-[#D0463C]/60 bg-[#2A1214] p-4 text-[15px] font-semibold text-[#FFC9C3]">{error}</p>}

        {!signedUp && (
          <div className="rounded-3xl border border-[#2A2530] bg-[#141017] p-5">
            <h1 className="text-[24px] font-bold">{refunded ? 'Your money was refunded' : 'You haven’t signed up yet'}</h1>
            <p className="mt-2 text-[15px] text-[#B4B0B8]">
              {refunded ? `We refunded ${rupees(data!.payment!.amount)}. It reaches you in 5 to 7 days.` : data?.pending ? 'Your payment is still open. Finish it to get your spot.' : 'Team of 3 or solo. It takes 2 minutes.'}
            </p>
            <Link href={`/challenge/${cfg.slug}/join`} className="vx-corner mt-4 flex h-14 items-center justify-center bg-[#D0463C] text-[17px] font-bold text-white">
              Sign up
            </Link>
          </div>
        )}

        {signedUp && (
          <>
            {/* The status, first and loud. */}
            <section className={`vx-rise vx-corner relative overflow-hidden p-5 ${onWaitlist ? 'bg-[#221D13]' : 'bg-gradient-to-br from-[#2A1214] to-[#141017]'}`}>
              {onWaitlist ? <Hourglass className="h-9 w-9 text-[#F2C94C]" aria-hidden /> : <Check className="vx-tick h-10 w-10 rounded-full bg-[#25D366] p-1.5 text-[#06210F]" strokeWidth={3} aria-hidden />}
              <h1 className={`${fightFont.className} mt-3 text-[48px] font-bold uppercase leading-[0.85]`}>
                {onWaitlist ? 'On the waitlist' : isNew ? 'You’re in!' : 'You’re in'}
              </h1>
              <p className="mt-2 text-[16px] font-semibold text-[#EDE9F0]">
                {team ? <>{team.kind === 'solo_group' ? 'Your team: ' : 'Team: '}<b className="text-white">{team.name}</b>{!onWaitlist && <> · Team #{team.number}</>}</> : soloWaiting ? 'Solo player. We’re finding your 2 teammates.' : 'Solo player on the waitlist.'}
              </p>
              <p className="mt-1 text-[14px] text-[#B4B0B8]">
                {onWaitlist
                  ? 'All spots are full. If a team drops out, we message you first on WhatsApp. You pay only then.'
                  : soloWaiting
                    ? `If we can't make a team, you get your full ${rupees(data?.payment?.amount ?? 300)} back by 4 Dec, 10 AM.`
                    : data?.payment?.status === 'paid'
                      ? `Paid ${rupees(data.payment.amount)}. We sent your QR to your email.`
                      : 'Your captain paid. Your QR is below.'}
              </p>
              {team?.offered && onWaitlist && (
                <button type="button" onClick={payOffer} disabled={busy} className="vx-corner mt-4 flex h-14 w-full items-center justify-center gap-2 bg-[#D0463C] text-[17px] font-bold text-white disabled:opacity-60">
                  {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : 'A spot is free! Pay now to take it'}
                </button>
              )}
            </section>

            {/* The captain's link: right under the status, while the team isn't full. */}
            {team?.inviteUrl && team.players < team.size && (
              <section
                id="add-teammates"
                className={`rounded-3xl border-2 border-[#D0463C] bg-[#1A1114] p-5 ${isNew ? 'vx-rise' : ''}`}
                aria-label="Add your teammates"
              >
                <p className="text-[12px] font-bold uppercase tracking-[0.14em] text-[#E8675D]">Do this now</p>
                <h2 className="mt-1 flex items-center gap-2 text-[24px] font-bold leading-tight">
                  <UserPlus className="h-6 w-6 flex-shrink-0 text-[#E8675D]" aria-hidden />
                  Send this link to your {team.size - team.players === 1 ? 'last teammate' : `${team.size - team.players} teammates`}
                </h2>
                <p className="mt-1 text-[15px] text-[#B4B0B8]">
                  Your team is not complete until they join. They log in and fill their own details. It is free for them.
                </p>
                <ol className="mt-3 flex gap-2" aria-label={`${team.players} of ${team.size} players in`}>
                  {Array.from({ length: team.size }).map((_, i) => {
                    const m = team.members.filter((x) => x.role !== 'sub')[i];
                    return (
                      <li key={i} className={`flex min-h-[44px] min-w-0 flex-1 items-center justify-center rounded-xl border px-2 text-center text-[13px] font-semibold leading-tight ${m ? 'border-[#25D366]/50 bg-[#102418] text-[#BDF5CF]' : 'border-dashed border-[#5A2A26] text-[#A49EA9]'}`}>
                        {m ? <span className="truncate">{m.fullName.split(' ')[0]}</span> : 'Waiting…'}
                      </li>
                    );
                  })}
                </ol>
                <a
                  href={`https://wa.me/?text=${encodeURIComponent(cfg.shareText.replace('{link}', team.inviteUrl))}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => trackAction('challenge_invite_shared', { challenge: cfg.slug, channel: 'whatsapp' })}
                  className="mt-4 flex min-h-[60px] items-center justify-center gap-2 rounded-2xl bg-[#25D366] px-4 text-[17px] font-bold text-[#06210F] hover:bg-[#3BE07A] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80"
                >
                  <WhatsAppIcon className="h-6 w-6" /> Send on WhatsApp
                </a>
                <button
                  type="button"
                  onClick={() => {
                    trackAction('challenge_invite_shared', { challenge: cfg.slug, channel: 'copy' });
                    navigator.clipboard?.writeText(team.inviteUrl!).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
                  }}
                  className="mt-2 flex min-h-[48px] w-full items-center justify-center gap-2 rounded-2xl border border-[#3A3340] text-[15px] font-semibold"
                >
                  {copied ? <Check className="h-4 w-4 text-[#25D366]" /> : <Copy className="h-4 w-4" />} {copied ? 'Copied' : 'Copy link'}
                </button>
                <p className="mt-3 text-[13px] text-[#A49EA9]">We also email you a reminder with this link until your team is full.</p>
              </section>
            )}

            {/* Community + Instagram, for everyone, every time until tapped. */}
            {(!p.tappedCommunity || !p.tappedInstaKhelo || (cfg.venue.instagramHandle && !p.tappedInstaVenue)) && (
              <section className="flex flex-col gap-2.5">
                <h2 className="text-[18px] font-bold">{onWaitlist ? 'Don’t miss a free spot' : 'Don’t miss your match time'}</h2>
                <TapButton href={cfg.links.communityInvite} done={!!p.tappedCommunity} onTap={tap('community')} tone="whatsapp" icon={<WhatsAppIcon className="h-7 w-7 text-[#25D366]" />}>
                  Join the Khelo community
                </TapButton>
                <TapButton href={instaUrl(cfg.links.kheloInstagramHandle)} done={!!p.tappedInstaKhelo} onTap={tap('instaKhelo')} tone="instagram" icon={<Instagram className="h-6 w-6" />}>
                  Follow Khelo on Instagram
                </TapButton>
                {cfg.venue.instagramHandle && (
                  <TapButton href={instaUrl(cfg.venue.instagramHandle)} done={!!p.tappedInstaVenue} onTap={tap('instaVenue')} tone="instagram" icon={<Instagram className="h-6 w-6" />}>
                    Follow {cfg.venue.shortName} on Instagram
                  </TapButton>
                )}
              </section>
            )}

            {/* The door QR. */}
            {p.qr && (
              <section className="vx-corner flex flex-col items-center bg-[#F4F1EC] p-5 text-[#0A0809]">
                <p className="flex items-center gap-2 text-[15px] font-bold"><QrCode className="h-5 w-5" aria-hidden /> Show this at the XQZ desk</p>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.qr} alt={`Check-in QR for ${p.fullName}`} className="mt-3 h-60 w-60" />
                <p className="mt-2 text-[16px] font-bold">{p.fullName}</p>
                <p className="text-[14px] text-[#4A4450]">{p.riotId}</p>
                <p className={`mt-3 rounded-full px-3 py-1 text-[13px] font-bold ${p.checkedIn ? 'bg-[#13221A] text-[#7FE0A0]' : 'bg-[#0A0809] text-[#F2C94C]'}`}>
                  {p.checkedIn ? 'Checked in' : 'Check in by 11:45 AM on Sat 5 Dec'}
                </p>
              </section>
            )}

            {team && <Roster team={team} cfg={cfg} onAdded={setData} />}

            {data!.matches.length > 0 && (
              <section className="rounded-3xl border border-[#2A2530] bg-[#141017] p-5">
                <h2 className="flex items-center gap-2 text-[18px] font-bold"><Swords className="h-5 w-5 text-[#E8675D]" aria-hidden /> Your matches</h2>
                <ul className="mt-3 flex flex-col divide-y divide-[#2A2530]">
                  {data!.matches.map((m, i) => (
                    <li key={i} className="flex items-center justify-between gap-3 py-3">
                      <span>
                        <span className="block text-[15px] font-bold">{m.round}{m.bestOf > 1 ? ' · best of 3' : ''}</span>
                        <span className="text-[14px] text-[#B4B0B8]">vs {m.against ?? 'to be decided'}{m.lobby ? ` · Lobby ${m.lobby}` : ''}</span>
                      </span>
                      <span className={`${fightFont.className} text-[28px] font-bold leading-none ${m.won === true ? 'text-[#7FE0A0]' : m.won === false ? 'text-[#9A94A0] line-through' : 'text-[#F2C94C]'}`}>
                        {m.won === true ? 'WON' : m.won === false ? 'OUT' : m.startsAt ? istTime(m.startsAt) : 'BYE'}
                      </span>
                    </li>
                  ))}
                </ul>
                <Link href={`/challenge/${cfg.slug}/bracket`} className="mt-2 inline-flex min-h-[44px] items-center text-[15px] font-bold text-[#E8675D]">See the full bracket</Link>
              </section>
            )}

            {!onWaitlist && (
              <section className="flex flex-col gap-2">
                <h2 className="text-[18px] font-bold">Tell your friends</h2>
                <StoryCardButton cfg={cfg} teamName={team?.name ?? null} onShared={() => trackAction('challenge_story_card', { challenge: cfg.slug })} />
                <p className="text-[13px] text-[#A49EA9]">Post it on your story and tag @{cfg.links.kheloInstagramHandle}.</p>
              </section>
            )}

            <section className="grid grid-cols-1 gap-2 rounded-3xl border border-[#2A2530] bg-[#141017] p-5 text-[15px]">
              <p className="flex items-center gap-2.5"><CalendarDays className="h-5 w-5 text-[#F2C94C]" aria-hidden /> {istDay(cfg.dates.firstMatch)}</p>
              <p className="flex items-center gap-2.5"><Clock className="h-5 w-5 text-[#F2C94C]" aria-hidden /> Come by {istTime(cfg.dates.reportingTime)}. Check-in closes {istTime(cfg.dates.checkInCloses)}.</p>
              <a href={cfg.venue.googleMapsUrl} target="_blank" rel="noopener noreferrer" className="flex min-h-[44px] items-center gap-2.5 font-semibold text-[#8FB0FF] underline">
                <MapPin className="h-5 w-5" aria-hidden /> {cfg.venue.name}, Gachibowli
              </a>
              <Link href={`/challenge/${cfg.slug}#rules`} className="min-h-[44px] pt-2 font-semibold text-[#E8675D] underline">Read the rules</Link>
            </section>
          </>
        )}
      </main>
      <MockPaymentModal
        isOpen={mockModalState?.isOpen || false}
        orderId={mockModalState?.orderId || ''}
        amount={mockModalState?.amount || 0}
        onSuccess={mockModalState?.onSuccess || (() => {})}
        onFailure={mockModalState?.onFailure || (() => {})}
        onClose={mockModalState?.onClose || (() => {})}
      />
    </TeamShell>
  );
}

function Roster({ team, cfg, onAdded }: { team: NonNullable<MyTeamEntry['team']>; cfg: TeamChallengeConfig; onAdded: (d: MyTeamEntry) => void }) {
  const main = team.members.filter((m) => m.role !== 'sub');
  const subs = team.members.filter((m) => m.role === 'sub');
  const empty = Math.max(0, team.size - main.length);
  const isCaptain = !!team.inviteUrl;
  const closed = Date.now() >= new Date(cfg.dates.registrationCloses).getTime();
  const [adding, setAdding] = useState(false);
  const [f, setF] = useState({ fullName: '', riotId: '', phone: '' });
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const add = async () => {
    setErr(null);
    if (f.fullName.trim().length < 2 || !RIOT_RE.test(cleanRiot(f.riotId)) || !/^[6-9]\d{9}$/.test(phoneDigits(f.phone))) {
      setErr('Add their name, Riot ID (Name#TAG) and 10-digit WhatsApp number.');
      return;
    }
    setBusy(true);
    try {
      onAdded(await captainAddsTeammate(cfg.slug, { player: { fullName: f.fullName.trim(), riotId: cleanRiot(f.riotId), phone: phoneDigits(f.phone) }, asSub: false }));
      setF({ fullName: '', riotId: '', phone: '' });
      setAdding(false);
    } catch (e) {
      setErr((e as ApiError).message || 'Could not add them.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded-3xl border border-[#2A2530] bg-[#141017] p-5">
      <h2 className="flex items-center gap-2 text-[18px] font-bold"><Users className="h-5 w-5 text-[#E8675D]" aria-hidden /> {team.name} <span className="text-[14px] font-semibold text-[#B4B0B8]">{main.length}/{team.size}</span></h2>
      <ul className="mt-3 flex flex-col gap-2">
        {main.map((m) => <MemberRow key={m.id} m={m} />)}
        {Array.from({ length: empty }, (_, i) => (
          <li key={`e${i}`} className="flex min-h-[56px] items-center gap-3 rounded-xl border border-dashed border-[#3A3340] px-3 text-[15px] text-[#9A94A0]">
            <span className="flex h-9 w-9 items-center justify-center rounded-full border border-dashed border-[#4A4352]"><UserPlus className="h-4 w-4" aria-hidden /></span>
            Waiting for a teammate
          </li>
        ))}
        {subs.map((m) => <MemberRow key={m.id} m={m} />)}
      </ul>
      {isCaptain && empty > 0 && closed && (
        !adding ? (
          <button type="button" onClick={() => setAdding(true)} className="mt-3 min-h-[44px] text-[15px] font-bold text-[#E8675D]">+ Type a teammate in yourself</button>
        ) : (
          <div className="mt-4 flex flex-col gap-3 border-t border-[#2A2530] pt-4">
            <Labelled id="add-name" label="Their name"><input id="add-name" className={field} value={f.fullName} onChange={(e) => setF({ ...f, fullName: e.target.value })} /></Labelled>
            <Labelled id="add-riot" label="Their Riot ID"><input id="add-riot" className={field} placeholder="Name#TAG" autoCapitalize="off" spellCheck={false} value={f.riotId} onChange={(e) => setF({ ...f, riotId: e.target.value })} /></Labelled>
            <Labelled id="add-phone" label="Their WhatsApp number"><input id="add-phone" className={`${field} tabular-nums`} inputMode="numeric" maxLength={14} value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Labelled>
            {err && <p role="alert" className="text-[13px] font-medium text-[#FF9C93]">{err}</p>}
            <button type="button" onClick={add} disabled={busy} className="vx-corner-sm flex h-12 items-center justify-center bg-[#D0463C] font-bold text-white disabled:opacity-60">
              {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : 'Add to team'}
            </button>
          </div>
        )
      )}
    </section>
  );
}

function MemberRow({ m }: { m: Member }) {
  const tag = m.role === 'captain' ? 'Captain' : m.role === 'sub' ? 'Substitute' : null;
  return (
    <li className="flex min-h-[56px] items-center gap-3 rounded-xl bg-[#0F0C12] px-3">
      <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-[#D0463C]/20 text-[15px] font-bold text-[#E8675D]">
        {m.fullName.trim().charAt(0).toUpperCase()}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-bold">{m.fullName}{tag && <span className="ml-2 text-[12px] font-semibold text-[#F2C94C]">{tag}</span>}</span>
        <span className="block truncate text-[13px] text-[#B4B0B8]">{m.riotId}{m.rank ? ` · ${m.rank}` : ''}</span>
      </span>
      {m.checkedIn && <Check className="h-5 w-5 text-[#25D366]" aria-label="Checked in" />}
    </li>
  );
}
