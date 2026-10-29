'use client';

import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, CheckCircle2, MessageCircle } from 'lucide-react';
import { fightFont } from '@/components/challenge/ChallengeHero';
import { useBotGuard } from '@/components/auth/BotGuard';
import { comingYesByPhone, getChallenge, type Challenge } from '@/lib/api/challenges';
import { trackAction } from '@/lib/api/analyticsEvents';
import { COMMUNITY_URL, challengeDay, challengeTime, challengeWeekday, challengeTimeRange, whatsappShare } from '@/lib/challenge';

/** Opened from the community message. One field, one tap: "Yes, I'm coming".
 *  Found by the WhatsApp number they signed up with, so there is nothing to log in to. */
export function ComingClient({ slug }: { slug: string }) {
  const [ch, setCh] = useState<Challenge | null>(null);
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ firstName: string; alreadyYes: boolean } | null>(null);
  const { guardFields, trap } = useBotGuard();

  useEffect(() => {
    getChallenge(slug).then(setCh).catch(() => undefined);
  }, [slug]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setError(null);
    if (phone.replace(/\D/g, '').length < 10) return setError('Enter the 10-digit WhatsApp number you signed up with.');
    setBusy(true);
    try {
      const res = await comingYesByPhone(slug, { phone, ...(await guardFields()) });
      trackAction('challenge_coming', { challenge: slug, answer: 'yes', via: 'link', again: res.alreadyYes });
      setDone(res);
    } catch (err) {
      setError((err as Error)?.message || 'Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const when = ch ? `${challengeDay(ch.startsAt)}, ${challengeTimeRange(ch.startsAt, ch.endsAt)}` : '';

  return (
    <div className="mx-auto flex min-h-screen max-w-content flex-col bg-[#0E0F13] px-5 pb-10 pt-4 text-[#F4F1EC]">
      <Link href={`/challenge/${slug}`} className="flex h-11 w-fit items-center gap-2 rounded-full border border-white/15 px-4 text-sm font-semibold">
        <ArrowLeft className="h-4 w-4" aria-hidden /> Back
      </Link>

      {done ? (
        <div className="mt-10 flex flex-col gap-4">
          <CheckCircle2 className="h-14 w-14 text-[#7FE0A0]" aria-hidden />
          <h1 className={`${fightFont.className} text-5xl font-bold uppercase leading-none`}>
            See you there, {done.firstName}.
          </h1>
          {ch && (
            <p className="text-[#DADCE3]">
              {when}. Check-in is {challengeTime(ch.checkinOpensAt)}–{challengeTime(ch.checkinClosesAt)} at {ch.cafe.name}. Just walk in and
              say your name.
            </p>
          )}
          <a
            href={whatsappShare(`I'm playing in the Tekken Challenge${ch ? ` at ${ch.cafe.name}` : ''}${when ? `, ${when}` : ''}. Come watch or play, it's free: ${typeof window !== 'undefined' ? window.location.origin : 'https://khel-o.com'}/challenge/${slug}`)}
            target="_blank"
            rel="noopener noreferrer"
            className="flex h-14 items-center justify-center gap-2 rounded-xl bg-[#25D366] text-base font-bold text-[#06140B]"
          >
            <MessageCircle className="h-5 w-5" aria-hidden /> Bring a friend to watch
          </a>
          <a href={ch?.communityUrl || COMMUNITY_URL} target="_blank" rel="noopener noreferrer" className="text-center text-sm font-semibold underline">
            Open the community
          </a>
        </div>
      ) : (
        <form onSubmit={submit} noValidate className="relative mt-10 flex flex-col gap-4">
          {trap}
          <h1 className={`${fightFont.className} text-5xl font-bold uppercase leading-none`}>
            Coming{ch ? ` ${challengeWeekday(ch.startsAt)}` : ''}?
          </h1>
          <p className="text-[#DADCE3]">
            {ch ? `${ch.title} at ${ch.cafe.name}, ${when}.` : 'Tap yes so we know to expect you.'} One tap and we’ll hold your place.
          </p>
          <label className="flex flex-col gap-1.5 text-sm font-semibold">
            The WhatsApp number you signed up with
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              inputMode="tel"
              autoComplete="tel-national"
              placeholder="98765 43210"
              maxLength={14}
              className="h-14 rounded-xl border border-white/15 bg-[#16181E] px-4 text-lg font-normal text-[#F4F1EC] focus:outline-none focus:ring-2 focus:ring-[#F2C94C]"
            />
          </label>
          {error && (
            <p role="alert" className="text-sm font-semibold text-[#FFB4AC]">
              {error}{' '}
              {error.includes('find that number') ? (
                <Link href={`/challenge/${slug}?join=1`} className="underline">Sign up</Link>
              ) : null}
            </p>
          )}
          <button
            type="submit"
            disabled={busy}
            className="h-14 rounded-xl bg-[#F2C94C] text-lg font-bold text-[#1A1306] disabled:opacity-60"
          >
            {busy ? 'Saving…' : 'Yes, I’m coming'}
          </button>
          <p className="text-xs text-[#A3A6B1]">Can’t make it? No problem, just skip this.</p>
        </form>
      )}
    </div>
  );
}
