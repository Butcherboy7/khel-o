'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { CalendarDays, Clock, MapPin, MessageCircle, QrCode, ChevronLeft, PartyPopper, Hourglass } from 'lucide-react';
import { AuthGuard } from '@/components/layout/AuthGuard';
import { BottomSheet, Button } from '@/components/ui';
import { trackAction } from '@/lib/api/analyticsEvents';
import { answerComing, getMyChallenge, withdrawFromChallenge, type Coming, type MyChallenge } from '@/lib/api/challenges';
import { challengeDay, challengeTime, challengeTimeRange, handle } from '@/lib/challenge';

export default function MyChallengePage() {
  return (
    <AuthGuard allowedRoles={['gamer', 'cafe_owner', 'staff', 'admin']}>
      <MyChallenge />
    </AuthGuard>
  );
}

function MyChallenge() {
  const { slug } = useParams<{ slug: string }>();
  const isNew = useSearchParams().get('new') === '1';
  const [data, setData] = useState<MyChallenge | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmOut, setConfirmOut] = useState(false);

  const load = useCallback(() => {
    getMyChallenge(slug)
      .then(setData)
      .catch((e) => setError((e as Error).message || 'Could not load your spot.'));
  }, [slug]);

  useEffect(load, [load]);

  const act = async (what: string, fn: () => Promise<MyChallenge>) => {
    setBusy(what);
    setError(null);
    try {
      setData(await fn());
    } catch (e) {
      setError((e as Error).message || 'Something went wrong. Please try again.');
    } finally {
      setBusy(null);
    }
  };

  const coming = (answer: Coming) => {
    trackAction('challenge_coming', { challenge: slug, answer });
    return act(`coming-${answer}`, () => answerComing(slug, answer));
  };

  const withdraw = async () => {
    trackAction('challenge_withdrawn', { challenge: slug });
    await act('withdraw', () => withdrawFromChallenge(slug));
    setConfirmOut(false);
  };

  if (!data) {
    return (
      <Page slug={slug}>
        <p className="py-20 text-center text-sm text-[#A3A6B1]">{error ?? 'Loading…'}</p>
      </Page>
    );
  }

  const { challenge: ch, entry } = data;
  const before = ch.status === 'open' || ch.status === 'closed';

  if (!entry || entry.status === 'withdrawn' || entry.status === 'no_show') {
    return (
      <Page slug={slug}>
        <h1 className="font-heading text-2xl font-bold">{ch.title}</h1>
        <p className="mt-3 text-[#C9CBD3]">
          {entry ? 'You’re not in this challenge any more.' : 'You haven’t signed up for this challenge yet.'}
        </p>
        {ch.status === 'open' && (
          <Link
            href={`/challenge/${ch.slug}`}
            className="mt-6 flex h-14 items-center justify-center rounded-2xl bg-[#D0463C] font-heading text-lg font-bold text-white"
          >
            {entry ? 'Sign up again' : 'Sign up free'}
          </Link>
        )}
      </Page>
    );
  }

  const confirmed = entry.status === 'confirmed';
  const ig = handle(ch.instagramHandle);

  return (
    <Page slug={slug}>
      {/* Their status, big */}
      <section
        className={`rounded-3xl border p-5 ${confirmed ? 'border-[#3B6B4A] bg-[#13221A]' : 'border-[#5A4A2A] bg-[#221D13]'}`}
        aria-live="polite"
      >
        <p className={`flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.18em] ${confirmed ? 'text-[#7FE0A0]' : 'text-[#F2C27A]'}`}>
          {confirmed ? <PartyPopper className="h-4 w-4" /> : <Hourglass className="h-4 w-4" />}
          {isNew ? (confirmed ? 'You’re in!' : 'You’re on the waitlist') : ch.title}
        </p>
        <p className="mt-2 font-heading text-[40px] font-bold leading-none">
          {confirmed ? `Confirmed #${entry.rank}` : `Waitlist #${entry.rank}`}
        </p>
        <p className="mt-3 text-sm text-[#DADCE3]">
          {confirmed
            ? entry.promotedAt
              ? 'A spot opened up and it’s yours now.'
              : `You have one of the ${ch.capacity} spots.`
            : 'You can still come on the day. If someone doesn’t show, the next waitlist player who’s there plays.'}
        </p>
      </section>

      {/* When and where */}
      <section className="mt-4 grid grid-cols-2 gap-2.5">
        <Fact icon={<CalendarDays className="h-4 w-4" />} label="Date" value={challengeDay(ch.startsAt)} />
        <Fact icon={<Clock className="h-4 w-4" />} label="Starts" value={challengeTimeRange(ch.startsAt, ch.endsAt)} />
        <div className="col-span-2 rounded-2xl border border-[#262932] bg-[#16181E] px-4 py-3 text-sm">
          <p>
            <span className="font-semibold">Check-in:</span> {challengeTime(ch.checkinOpensAt)} to {challengeTime(ch.checkinClosesAt)}.
            {confirmed ? ' After that, your spot goes to the waitlist.' : ''}
          </p>
        </div>
        {ch.cafe.mapsUrl && (
          <a
            href={ch.cafe.mapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="col-span-2 flex items-center gap-3 rounded-2xl border border-[#262932] bg-[#16181E] px-4 py-3"
          >
            <MapPin className="h-4 w-4 text-[#E8675D]" />
            <span className="flex-1 truncate font-semibold">{ch.cafe.name}</span>
            <span className="text-xs font-semibold text-[#E8675D]">Map</span>
          </a>
        )}
      </section>

      {/* Coming on the day? */}
      {before && (
        <section className="mt-6 rounded-2xl border border-[#262932] bg-[#16181E] p-4">
          <h2 className="font-heading text-lg font-bold">Coming on {challengeDay(ch.startsAt)}?</h2>
          <p className="mt-1 text-sm text-[#A3A6B1]">
            {confirmed
              ? 'Tell us, so nobody waits for an empty spot. Saying no gives your spot to the next person.'
              : 'Tell us if you’ll be there in case a spot opens up.'}
          </p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button
              type="button"
              disabled={!!busy}
              onClick={() => coming('yes')}
              aria-pressed={entry.coming === 'yes'}
              className={`h-12 rounded-xl font-semibold transition-colors ${entry.coming === 'yes' ? 'bg-[#2F7D4A] text-white' : 'bg-[#22252D] text-[#F4F1EC] hover:bg-[#2A2D36]'}`}
            >
              {busy === 'coming-yes' ? 'Saving…' : entry.coming === 'yes' ? 'Yes, I’m coming ✓' : 'Yes, I’m coming'}
            </button>
            <button
              type="button"
              disabled={!!busy}
              onClick={() => (confirmed ? setConfirmOut(true) : coming('no'))}
              aria-pressed={entry.coming === 'no'}
              className={`h-12 rounded-xl font-semibold transition-colors ${entry.coming === 'no' ? 'bg-[#5A2A26] text-white' : 'bg-[#22252D] text-[#F4F1EC] hover:bg-[#2A2D36]'}`}
            >
              {busy === 'coming-no' ? 'Saving…' : 'No'}
            </button>
          </div>
        </section>
      )}

      {/* WhatsApp community */}
      {ch.communityUrl && (
        <a
          href={ch.communityUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => trackAction('challenge_community_click', { challenge: slug, where: isNew ? 'after_signup' : 'me' })}
          className="mt-4 flex items-center gap-3 rounded-2xl bg-[#25D366] px-4 py-4 font-semibold text-[#0B2E17]"
        >
          <MessageCircle className="h-5 w-5" />
          <span className="flex-1">
            <span className="block">Join the KHELO WhatsApp community</span>
            <span className="block text-xs font-medium opacity-80">Updates for this and every future challenge. Optional.</span>
          </span>
        </a>
      )}

      {/* Check-in QR: wave 2 */}
      <section className="mt-4 flex items-center gap-3 rounded-2xl border border-dashed border-[#3A3E4A] px-4 py-4 text-sm text-[#A3A6B1]">
        <QrCode className="h-8 w-8 flex-shrink-0" />
        <p>Your check-in QR will appear here before the day. Show it at the café.</p>
      </section>

      {ig && (
        <p className="mt-6 text-center text-sm text-[#A3A6B1]">
          Follow <span className="font-semibold text-[#F4F1EC]">{ig}</span> on Instagram for the results and videos.
        </p>
      )}

      {before && (
        <button
          type="button"
          onClick={() => setConfirmOut(true)}
          className="mx-auto mt-8 block text-sm font-semibold text-[#A3A6B1] underline underline-offset-4"
        >
          Can’t make it
        </button>
      )}

      {error && (
        <p role="alert" className="mt-4 rounded-xl bg-[#5A2A26]/50 px-3 py-2 text-sm text-[#FFB4AC]">
          {error}
        </p>
      )}

      <BottomSheet isOpen={confirmOut} onClose={() => setConfirmOut(false)} title="Give up your place?">
        <p className="-mt-1 text-caption text-text-secondary">
          {confirmed
            ? 'Your spot goes to the next person on the waitlist. You can sign up again, but you’ll join the back of the line.'
            : 'You’ll leave the waitlist. You can sign up again, but you’ll join the back of the line.'}
        </p>
        <div className="mt-4 flex flex-col gap-2">
          <Button variant="primary" fullWidth isLoading={busy === 'withdraw'} onClick={withdraw}>
            Yes, give up my place
          </Button>
          <Button variant="ghost" fullWidth onClick={() => setConfirmOut(false)}>
            Keep my place
          </Button>
        </div>
      </BottomSheet>
    </Page>
  );
}

function Page({ slug, children }: { slug: string; children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#0E0F13] text-[#F4F1EC]">
      <header className="mx-auto flex max-w-xl items-center gap-2 px-4 pt-4">
        <Link href={`/challenge/${slug}`} className="flex items-center gap-1 text-sm font-semibold text-[#A3A6B1] hover:text-[#F4F1EC]">
          <ChevronLeft className="h-4 w-4" /> Challenge
        </Link>
      </header>
      <main className="mx-auto max-w-xl px-4 pb-16 pt-5">{children}</main>
    </div>
  );
}

function Fact({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-[#262932] bg-[#16181E] px-4 py-3">
      <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#A3A6B1]">
        <span className="text-[#E8675D]">{icon}</span>
        {label}
      </p>
      <p className="mt-1 font-heading text-[17px] font-bold">{value}</p>
    </div>
  );
}
