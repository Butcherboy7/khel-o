'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronRight, Instagram, Loader2, Users } from 'lucide-react';
import { WhatsAppIcon } from '@/components/icons/WhatsAppIcon';
import { fightFont } from '@/components/challenge/ChallengeHero';
import { trackAction } from '@/lib/api/analyticsEvents';
import { ApiError } from '@/lib/api/errors';
import { getInvite, joinWithInvite, type InviteInfo, type PlayerForm, type Taps } from '@/lib/api/teamChallenges';
import { useAuthStore } from '@/store/authStore';
import type { TeamChallengeConfig } from '@/challenges/types';
import { AccountStep } from './AccountStep';
import { PlayerFields, checkPlayer, cleanInsta, cleanRiot, phoneDigits, type PlayerErrors } from './PlayerFields';
import { TapButton, TeamShell, Tick, instaUrl } from './ui';

const EMPTY: PlayerForm = { fullName: '', phone: '', riotId: '', rank: '', instagram: '', college: '' };

/** A teammate opens the captain's link: log in, fill your details, one tick, done. Free. */
export function TeamInvite({ cfg, code }: { cfg: TeamChallengeConfig; code: string }) {
  const router = useRouter();
  const { isAuthenticated, isHydrated, user } = useAuthStore();
  const [info, setInfo] = useState<InviteInfo | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [me, setMe] = useState<PlayerForm>(EMPTY);
  const [taps, setTaps] = useState<Taps>({ community: false, instaKhelo: false, instaVenue: false });
  const [agreed, setAgreed] = useState(false);
  const [touched, setTouched] = useState(false);
  const [serverErr, setServerErr] = useState<PlayerErrors>({});
  const [banner, setBanner] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!isHydrated || !isAuthenticated) return;
    getInvite(cfg.slug, code)
      .then((i) => {
        if (i.alreadyIn) {
          router.replace(`/challenge/${cfg.slug}/me`);
          return;
        }
        setInfo(i);
        setMe((m) => ({ ...m, fullName: m.fullName || i.namePrefill || user?.fullName || '', phone: m.phone || phoneDigits(i.phonePrefill || user?.phoneNumber || '') }));
      })
      .catch((e) => setLoadError((e as Error).message || 'This invite link isn’t working.'));
  }, [cfg.slug, code, isHydrated, isAuthenticated, router, user]);

  const errs = checkPlayer(me);
  const asSub = !!info?.mainFull;

  const submit = async () => {
    setTouched(true);
    setServerErr({});
    if (Object.keys(errs).length || !agreed) return;
    setBusy(true);
    try {
      await joinWithInvite(cfg.slug, code, {
        player: { ...me, riotId: cleanRiot(me.riotId), instagram: cleanInsta(me.instagram), phone: phoneDigits(me.phone) },
        asSub, taps, agreed,
      });
      trackAction('challenge_teammate_joined', { challenge: cfg.slug });
      router.push(`/challenge/${cfg.slug}/me?new=1`);
    } catch (e) {
      const err = e as ApiError;
      if (err?.code === 'RIOT_ID_TAKEN' || err?.code === 'BAD_RIOT_ID') setServerErr({ riotId: err.message });
      else if (err?.code === 'BAD_INSTAGRAM') setServerErr({ instagram: err.message });
      else if (err?.code === 'BAD_PHONE') setServerErr({ phone: err.message });
      else if (err?.code === 'ALREADY_IN') router.replace(`/challenge/${cfg.slug}/me`);
      else setBanner(err?.message || 'Something went wrong. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const tap = (k: keyof Taps) => () => setTaps((t) => ({ ...t, [k]: true }));
  const returnTo = `/challenge/${cfg.slug}/invite/${code}`;

  return (
    <TeamShell cfg={cfg} back={`/challenge/${cfg.slug}`} backLabel="Challenge">
      <main className="mx-auto flex max-w-xl flex-col gap-5 px-4 pb-12 pt-6">
        <section className="vx-rise vx-corner relative overflow-hidden bg-gradient-to-br from-[#2A1214] to-[#141017] p-5">
          <Users className="h-8 w-8 text-[#E8675D]" aria-hidden />
          <p className="mt-3 text-[15px] font-semibold text-[#DCD7E0]">{info?.captain ? `${info.captain} added you to` : 'You’re invited to'}</p>
          <h1 className={`${fightFont.className} text-[50px] font-bold uppercase leading-[0.85]`}>{info?.teamName ?? 'a team'}</h1>
          <p className="mt-2 text-[15px] text-[#DCD7E0]">
            {cfg.title} · {cfg.venue.shortName} · Sat 5 Dec. <b className="text-white">Free for you.</b> Your captain paid.
          </p>
          {info && (
            <p className="mt-3 text-[14px] font-semibold text-[#F2C94C]">
              {info.full ? 'This team is full.' : asSub ? 'The 3 players are in. You can join as the substitute.' : `${info.players} of ${info.size} players in`}
            </p>
          )}
        </section>

        {loadError && <p role="alert" className="rounded-2xl border border-[#D0463C]/60 bg-[#2A1214] p-4 text-[15px] font-semibold text-[#FFC9C3]">{loadError}</p>}
        {banner && <p role="alert" className="rounded-2xl border border-[#D0463C]/60 bg-[#2A1214] p-4 text-[15px] font-semibold text-[#FFC9C3]">{banner}</p>}

        {!isHydrated ? (
          <Loader2 className="h-6 w-6 animate-spin text-[#B4B0B8]" aria-label="Loading" />
        ) : !isAuthenticated ? (
          <section className="vx-step-in flex flex-col gap-3">
            <h2 className="text-[22px] font-bold">Log in to join</h2>
            <AccountStep slug={cfg.slug} returnTo={returnTo} onDone={(who) => setMe((m) => ({ ...m, fullName: who.fullName, phone: who.phone }))} />
          </section>
        ) : info && !info.full ? (
          <section className="vx-step-in flex flex-col gap-5">
            <h2 className="text-[22px] font-bold">Your details</h2>
            <PlayerFields
              value={me}
              onChange={setMe}
              errors={{ ...(touched ? errs : {}), ...serverErr }}
              idPrefix="p"
            />
            <div className="flex flex-col gap-2.5">
              <TapButton href={cfg.links.communityInvite} done={taps.community} onTap={tap('community')} tone="whatsapp" icon={<WhatsAppIcon className="h-7 w-7 text-[#25D366]" />}>
                Join the Khelo community
              </TapButton>
              <TapButton href={instaUrl(cfg.links.kheloInstagramHandle)} done={taps.instaKhelo} onTap={tap('instaKhelo')} tone="instagram" icon={<Instagram className="h-6 w-6" />}>
                Follow Khelo on Instagram
              </TapButton>
              {cfg.venue.instagramHandle && (
                <TapButton href={instaUrl(cfg.venue.instagramHandle)} done={taps.instaVenue} onTap={tap('instaVenue')} tone="instagram" icon={<Instagram className="h-6 w-6" />}>
                  Follow {cfg.venue.shortName} on Instagram
                </TapButton>
              )}
            </div>
            <Tick checked={agreed} onChange={setAgreed}>
              {cfg.agreeLine}{' '}
              <Link href={`/challenge/${cfg.slug}#rules`} target="_blank" className="font-semibold text-[#E8675D] underline">Read the rules</Link>
            </Tick>
            <button
              type="button"
              onClick={submit}
              disabled={busy || !agreed}
              className="vx-corner flex h-[58px] w-full items-center justify-center gap-2 bg-[#D0463C] text-[18px] font-bold text-white transition-colors hover:bg-[#B93C33] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 disabled:cursor-not-allowed disabled:bg-[#4A2A2A] disabled:text-[#C9A8A4]"
            >
              {busy ? <Loader2 className="h-5 w-5 animate-spin" aria-label="Working" /> : <>{asSub ? 'Join as substitute' : 'Join the team'} <ChevronRight className="h-5 w-5" aria-hidden /></>}
            </button>
            {!agreed && <p className="-mt-3 text-center text-[13px] text-[#A49EA9]">Tick the box to continue.</p>}
          </section>
        ) : info?.full ? (
          <Link href={`/challenge/${cfg.slug}/join?kind=solo`} className="vx-corner flex h-14 items-center justify-center bg-[#D0463C] text-[17px] font-bold text-white">
            Sign up solo instead
          </Link>
        ) : null}
      </main>
    </TeamShell>
  );
}
