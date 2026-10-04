'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Plus, Timer, Trash2 } from 'lucide-react';
import {
  createTournament,
  getCapacity,
  getHostMe,
  getHostTiers,
  getHostTournament,
  listGames,
  publishTournament,
  updateTournament,
  type Prize,
  type TournamentWrite,
} from '@/lib/api/tournaments';
import { Button, Input, Select, Skeleton, Textarea } from '@/components/ui';
import { fmtTime, fromLocalInput, minutesLabel, toLocalInput } from '@/lib/tournament';
import { ApiError } from '@/lib/api/errors';
import { cn } from '@/lib/cn';

const SIZES = [8, 16, 24, 32, 48, 64];

function nextFriday7pm(): string {
  const now = new Date(Date.now() + 330 * 60000); // IST wall clock
  const d = new Date(now);
  d.setUTCDate(d.getUTCDate() + ((5 - d.getUTCDay() + 7) % 7 || 7));
  d.setUTCHours(19, 0, 0, 0);
  return d.toISOString().slice(0, 16);
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-body-emphasis text-text-primary">{label}</span>
      {children}
      {hint && <span className="text-caption text-text-secondary">{hint}</span>}
    </div>
  );
}

function Chips<T extends string | number>({ value, options, onChange, label }: { value: T; options: { v: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          key={String(o.v)}
          type="button"
          role="radio"
          aria-checked={value === o.v}
          onClick={() => onChange(o.v)}
          className={cn(
            'min-h-[2.5rem] rounded-xl border px-3.5 text-caption font-bold transition active:scale-95',
            value === o.v ? 'border-primary bg-primary text-white' : 'border-border bg-card text-text-primary hover:border-primary/40',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5">
      <h2 className="font-heading text-h3 text-text-primary">{title}</h2>
      {children}
    </section>
  );
}

export function TournamentForm({ base, id }: { base: string; id?: string }) {
  const router = useRouter();
  const qc = useQueryClient();
  const me = useQuery({ queryKey: ['host-me'], queryFn: getHostMe });
  const games = useQuery({ queryKey: ['tournament-games'], queryFn: listGames, staleTime: 3600_000 });
  const existing = useQuery({ queryKey: ['host-tournament', id], queryFn: () => getHostTournament(id!), enabled: !!id });

  const [organiserId, setOrganiserId] = useState('');
  const [cafeId, setCafeId] = useState('');
  const [tierId, setTierId] = useState('');
  const [tierTouched, setTierTouched] = useState(false);
  const [gameKey, setGameKey] = useState('ea_fc');
  const [gameName, setGameName] = useState('');
  const [title, setTitle] = useState('');
  const [titleTouched, setTitleTouched] = useState(false);
  const [startsAt, setStartsAt] = useState(nextFriday7pm);
  const [teamSize, setTeamSize] = useState(1);
  const [maxTeams, setMaxTeams] = useState(16);
  const [stations, setStations] = useState(2);
  const [matchMinutes, setMatchMinutes] = useState(15);
  const [thirdPlace, setThirdPlace] = useState(true);
  const [free, setFree] = useState(true);
  const [fee, setFee] = useState(149);
  const [prizes, setPrizes] = useState<Prize[]>([{ place: 'Winner', prize: '' }, { place: 'Runner-up', prize: '' }]);
  const [sponsor, setSponsor] = useState('');
  const [about, setAbout] = useState('');
  const [rules, setRules] = useState('');
  const [checkIn, setCheckIn] = useState(30);
  const [closesHours, setClosesHours] = useState(1);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<'' | 'draft' | 'publish'>('');
  const [loaded, setLoaded] = useState(!id);

  const orgs = useMemo(() => me.data?.organisers ?? [], [me.data]);
  const org = orgs.find((o) => o.id === organiserId) ?? orgs[0];
  const venues = useMemo(() => org?.venues ?? [], [org]);
  const game = games.data?.games.find((g) => g.key === gameKey);

  const tiers = useQuery({ queryKey: ['host-tiers', cafeId], queryFn: () => getHostTiers(cafeId), enabled: !!cafeId });
  const tier = tiers.data?.find((t) => t.id === tierId);

  // Defaults once the organiser list arrives.
  useEffect(() => {
    if (!organiserId && orgs.length) setOrganiserId(orgs[0].id);
  }, [orgs, organiserId]);
  useEffect(() => {
    if (!id && org && !venues.some((v) => v.id === cafeId)) setCafeId(venues[0]?.id ?? '');
  }, [org, venues, cafeId, id]);
  useEffect(() => {
    if (tiers.data && !tierTouched && !tiers.data.some((t) => t.id === tierId) && loaded) {
      const ps = tiers.data.find((t) => /ps|playstation|console/i.test(`${t.name} ${t.platform}`)) ?? tiers.data[0];
      setTierId(ps?.id ?? '');
    }
  }, [tiers.data, tierId, loaded, tierTouched]);

  // Edit: load once.
  useEffect(() => {
    const t = existing.data;
    if (!t || loaded) return;
    const e = t.editable;
    setOrganiserId(t.organiser?.id ?? '');
    setCafeId(e.cafe_id);
    setTierId(e.hardware_tier_id ?? '');
    setTierTouched(true);
    setTierTouched(true);
    setGameKey(e.game_key);
    setGameName(t.game.name);
    setTitle(e.title);
    setTitleTouched(true);
    setStartsAt(toLocalInput(e.starts_at));
    setTeamSize(e.team_size);
    setMaxTeams(e.max_teams);
    setStations(e.stations);
    setMatchMinutes(e.match_minutes);
    setThirdPlace(e.third_place);
    setFree(!e.entry_fee);
    setFee(e.entry_fee || 149);
    setPrizes(e.prizes.length ? e.prizes : [{ place: 'Winner', prize: '' }]);
    setSponsor(e.sponsor_name ?? '');
    setAbout(e.about ?? '');
    setRules(e.rules ?? '');
    setCheckIn(e.check_in_minutes);
    setClosesHours(Math.max(0, Math.round((new Date(e.starts_at).getTime() - new Date(e.registration_closes_at).getTime()) / 3600000)));
    setLoaded(true);
  }, [existing.data, loaded]);

  function pickGame(key: string) {
    setGameKey(key);
    const g = games.data?.games.find((x) => x.key === key);
    if (!g) return;
    setTeamSize(g.team_size);
    setMatchMinutes(g.match_minutes);
    setRules(g.rules);
    if (!titleTouched) {
      const day = new Date(fromLocalInput(startsAt)).toLocaleDateString('en-IN', { weekday: 'long', timeZone: 'Asia/Kolkata' });
      setTitle(key === 'custom' ? '' : `${g.short} ${day} Night`);
    }
  }

  // First game pick on a new form fills rules and title.
  useEffect(() => {
    if (!id && games.data && !rules) pickGame(gameKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [games.data]);

  const maxStations = tier?.stations || 16;
  const cap = useQuery({
    queryKey: ['capacity', maxTeams, stations, matchMinutes, thirdPlace],
    queryFn: () => getCapacity(maxTeams, stations, matchMinutes, thirdPlace),
    enabled: maxTeams >= 2 && stations >= 1 && matchMinutes >= 3,
    placeholderData: (prev) => prev,
  });
  const endsAt = useMemo(() => {
    if (!cap.data) return null;
    return new Date(new Date(fromLocalInput(startsAt)).getTime() + cap.data.minutes * 60000).toISOString();
  }, [cap.data, startsAt]);
  const tooLong = (cap.data?.minutes ?? 0) > 240;

  function body(): TournamentWrite {
    const start = fromLocalInput(startsAt);
    return {
      organiserId: org?.id,
      cafeId,
      hardwareTierId: tierId || null,
      title: title.trim(),
      gameKey,
      gameName: gameKey === 'custom' ? gameName.trim() : undefined,
      teamSize,
      thirdPlace,
      maxTeams,
      entryFee: free ? 0 : fee,
      startsAt: start,
      checkInMinutes: checkIn,
      registrationClosesAt: new Date(new Date(start).getTime() - closesHours * 3600000).toISOString(),
      matchMinutes,
      stations,
      prizes: prizes.filter((p) => p.place.trim() && p.prize.trim()),
      sponsorName: sponsor.trim() || null,
      about: about.trim() || null,
      rules: rules.trim() || null,
    };
  }

  async function save(publish: boolean) {
    setError('');
    setBusy(publish ? 'publish' : 'draft');
    try {
      let t = id ? await updateTournament(id, body()) : await createTournament(body());
      if (publish && t.status === 'draft') t = await publishTournament(t.id);
      await qc.invalidateQueries({ queryKey: ['host-tournaments'] });
      await qc.invalidateQueries({ queryKey: ['host-tournament', t.id] });
      router.push(`${base}/${t.id}${publish ? '?published=1' : ''}`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not save. Check the details and try again.');
      setBusy('');
    }
  }

  if (me.isLoading || games.isLoading || !loaded) return <Skeleton className="h-[40rem] rounded-2xl" />;
  if (!orgs.length) {
    return <p className="rounded-2xl border border-dashed border-border p-8 text-center text-text-secondary">Your account can&apos;t host tournaments yet.</p>;
  }
  const locked = existing.data && existing.data.status !== 'draft' && existing.data.taken > 0;

  return (
    <form
      className="mx-auto grid max-w-5xl gap-6 pb-28 lg:grid-cols-[1fr_20rem]"
      onSubmit={(e) => {
        e.preventDefault();
        void save(true);
      }}
    >
      <div className="flex flex-col gap-5">
        <h1 className="font-heading text-h1 text-text-primary">{id ? 'Edit tournament' : 'New tournament'}</h1>

        <Card title="Game">
          <Chips
            label="Game"
            value={gameKey}
            onChange={pickGame}
            options={(games.data?.games ?? []).map((g) => ({ v: g.key, label: g.key === 'custom' ? 'Other' : g.short }))}
          />
          {gameKey === 'custom' && <Input label="Game name" value={gameName} onChange={(e) => setGameName(e.target.value)} maxLength={60} required />}
          <Input
            label="Tournament name"
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              setTitleTouched(true);
            }}
            maxLength={120}
            required
          />
          {(game?.team_sizes.length ?? 0) > 1 && (
            <Field label="Format">
              <Chips label="Team size" value={teamSize} onChange={setTeamSize} options={(game?.team_sizes ?? [1]).map((n) => ({ v: n, label: n === 1 ? '1v1 solo' : `${n}v${n} teams` }))} />
            </Field>
          )}
        </Card>

        <Card title="Where and when">
          {orgs.length > 1 && (
            <Select label="Organised by" value={org?.id} onChange={(e) => setOrganiserId(e.target.value)}>
              {orgs.map((o) => (
                <option key={o.id} value={o.id}>{o.name}{o.kind === 'company' ? ' (company)' : o.kind === 'khelo' ? ' (KHEL-O)' : ''}</option>
              ))}
            </Select>
          )}
          {venues.length > 1 ? (
            <Select label="Café" value={cafeId} onChange={(e) => { setCafeId(e.target.value); setTierId(''); setTierTouched(false); }} disabled={!!locked}>
              {venues.map((v) => <option key={v.id} value={v.id}>{v.name} · {v.city}</option>)}
            </Select>
          ) : (
            <Field label="Café"><span className="text-body text-text-primary">{venues[0]?.name}</span></Field>
          )}
          <Select
            label="Setup to use"
            hint="These stations are held off normal bookings for the tournament window."
            value={tierId}
            onChange={(e) => {
              setTierId(e.target.value);
              setTierTouched(true);
            }}
          >
            <option value="">Don&apos;t hold any setup</option>
            {(tiers.data ?? []).map((t) => <option key={t.id} value={t.id}>{t.name} · {t.stations} stations</option>)}
          </Select>
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="Starts" type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} required />
            <Select label="Registration closes" value={String(closesHours)} onChange={(e) => setClosesHours(Number(e.target.value))}>
              <option value="0">At the start time</option>
              <option value="1">1 hour before</option>
              <option value="3">3 hours before</option>
              <option value="24">The day before</option>
            </Select>
          </div>
          <Select label="Check-in opens" value={String(checkIn)} onChange={(e) => setCheckIn(Number(e.target.value))}>
            <option value="15">15 min before</option>
            <option value="30">30 min before</option>
            <option value="45">45 min before</option>
            <option value="60">1 hour before</option>
          </Select>
        </Card>

        <Card title="Size">
          <Field label={teamSize > 1 ? 'Teams' : 'Players'}>
            <Chips label="Capacity" value={maxTeams} onChange={setMaxTeams} options={SIZES.map((n) => ({ v: n, label: String(n) }))} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="Stations in use"
              type="number"
              min={1}
              max={maxStations}
              value={stations}
              onChange={(e) => setStations(Math.max(1, Math.min(maxStations, Number(e.target.value) || 1)))}
              hint={tier ? `${tier.name} has ${tier.stations}` : undefined}
            />
            <Input
              label="Minutes per match"
              type="number"
              min={3}
              max={120}
              value={matchMinutes}
              onChange={(e) => setMatchMinutes(Math.max(3, Math.min(120, Number(e.target.value) || 3)))}
              hint="Including setup between games"
            />
          </div>
          <label className="flex items-center gap-3 text-body text-text-primary">
            <input type="checkbox" className="h-5 w-5 accent-[var(--primary)]" checked={thirdPlace} onChange={(e) => setThirdPlace(e.target.checked)} />
            Play a 3rd-place match
          </label>
        </Card>

        <Card title="Entry and prizes">
          <Chips label="Entry" value={free ? 'free' : 'paid'} onChange={(v) => setFree(v === 'free')} options={[{ v: 'free', label: 'Free entry' }, { v: 'paid', label: 'Paid entry' }]} />
          {!free && (
            <Input
              label={teamSize > 1 ? 'Fee per team (₹)' : 'Entry fee (₹)'}
              type="number"
              min={1}
              max={10000}
              value={fee}
              onChange={(e) => setFee(Math.max(0, Number(e.target.value) || 0))}
              hint="Paid online. It covers play time on the night; refunded only if you cancel the event."
              disabled={!!locked}
            />
          )}
          <Field label="Prizes" hint="Fixed prizes from you or a sponsor. Never a share of entry fees.">
            <div className="flex flex-col gap-2">
              {prizes.map((p, i) => (
                <div key={i} className="flex gap-2">
                  <input
                    aria-label="Place"
                    className="w-32 rounded-xl border border-border bg-card px-3 py-2.5 text-body text-text-primary"
                    value={p.place}
                    onChange={(e) => setPrizes((xs) => xs.map((x, j) => (j === i ? { ...x, place: e.target.value } : x)))}
                    maxLength={30}
                  />
                  <input
                    aria-label="Prize"
                    placeholder="₹2,000 cash, a controller, 5 free hours…"
                    className="min-w-0 flex-1 rounded-xl border border-border bg-card px-3 py-2.5 text-body text-text-primary"
                    value={p.prize}
                    onChange={(e) => setPrizes((xs) => xs.map((x, j) => (j === i ? { ...x, prize: e.target.value } : x)))}
                    maxLength={80}
                  />
                  <Button type="button" variant="ghost" size="icon" aria-label="Remove prize" onClick={() => setPrizes((xs) => xs.filter((_, j) => j !== i))}>
                    <Trash2 className="h-4 w-4" aria-hidden />
                  </Button>
                </div>
              ))}
              {prizes.length < 8 && (
                <button type="button" onClick={() => setPrizes((xs) => [...xs, { place: xs.length === 2 ? '3rd' : '', prize: '' }])} className="inline-flex w-fit items-center gap-1 text-caption font-semibold text-primary">
                  <Plus className="h-3.5 w-3.5" aria-hidden /> Add a prize
                </button>
              )}
            </div>
          </Field>
          <Input label="Sponsor (optional)" value={sponsor} onChange={(e) => setSponsor(e.target.value)} maxLength={80} placeholder="Shown as “Powered by …”" />
        </Card>

        <Card title="Details">
          <Textarea label="About (optional)" rows={3} value={about} onChange={(e) => setAbout(e.target.value)} maxLength={4000} placeholder="What makes this night worth coming to." />
          <Textarea label="Game rules" rows={5} value={rules} onChange={(e) => setRules(e.target.value)} maxLength={4000} hint="One rule per line. Pre-filled for the game you picked." />
        </Card>
      </div>

      {/* Live plan: the answer to "will this fit in my evening?" */}
      <aside className="lg:sticky lg:top-20 lg:self-start">
        <div className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5">
          <h2 className="inline-flex items-center gap-2 font-heading text-h3 text-text-primary">
            <Timer className="h-5 w-5 text-primary" aria-hidden /> Your night
          </h2>
          {cap.data ? (
            <>
              <div className="flex flex-col">
                <span className="font-heading text-display text-text-primary">{minutesLabel(cap.data.minutes)}</span>
                <span className="text-caption text-text-secondary">
                  {maxTeams} {teamSize > 1 ? 'teams' : 'players'} · {cap.data.rounds} rounds · {stations} station{stations > 1 ? 's' : ''}
                </span>
              </div>
              <dl className="grid grid-cols-2 gap-3 text-caption">
                <div className="flex flex-col"><dt className="text-text-secondary">Check-in</dt><dd className="font-semibold text-text-primary">{fmtTime(new Date(new Date(fromLocalInput(startsAt)).getTime() - checkIn * 60000).toISOString())}</dd></div>
                <div className="flex flex-col"><dt className="text-text-secondary">First match</dt><dd className="font-semibold text-text-primary">{fmtTime(fromLocalInput(startsAt))}</dd></div>
                <div className="flex flex-col"><dt className="text-text-secondary">Final around</dt><dd className="font-semibold text-text-primary">{endsAt ? fmtTime(endsAt) : '–'}</dd></div>
                <div className="flex flex-col"><dt className="text-text-secondary">Stations held until</dt><dd className="font-semibold text-text-primary">{endsAt ? fmtTime(new Date(new Date(endsAt).getTime() + 30 * 60000).toISOString()) : '–'}</dd></div>
              </dl>
              <p className="rounded-xl bg-surface p-3 text-caption text-text-secondary">
                On {stations} station{stations > 1 ? 's' : ''}, 3 hours fits <strong className="text-text-primary">{cap.data.fitsIn3h}</strong> and 4 hours fits{' '}
                <strong className="text-text-primary">{cap.data.fitsIn4h}</strong>.
              </p>
              {tooLong && (
                <p className="flex gap-2 rounded-xl bg-warning/10 p-3 text-caption text-text-primary">
                  <AlertTriangle className="h-4 w-4 shrink-0 text-warning" aria-hidden />
                  Over 4 hours is a long night. Use more stations, shorter matches, or split into qualifier nights.
                </p>
              )}
              {!free && (
                <p className="text-caption text-text-secondary">
                  Full house collects <strong className="text-text-primary">₹{(fee * maxTeams).toLocaleString('en-IN')}</strong> in entry fees.
                </p>
              )}
            </>
          ) : (
            <Skeleton className="h-40 rounded-xl" />
          )}
        </div>
      </aside>

      <div className="fixed bottom-[calc(var(--bottom-nav-height)_+_env(safe-area-inset-bottom))] left-0 right-0 z-overlay border-t border-border bg-card p-4 shadow-overlay md:bottom-0">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-end gap-3">
          {error && <p role="alert" className="mr-auto text-caption text-error">{error}</p>}
          {(!id || existing.data?.status === 'draft') && (
            <Button type="button" variant="secondary" isLoading={busy === 'draft'} disabled={!!busy} onClick={() => save(false)}>
              Save draft
            </Button>
          )}
          <Button type="submit" isLoading={busy === 'publish'} disabled={!!busy}>
            {id && existing.data?.status !== 'draft' ? 'Save changes' : 'Publish'}
          </Button>
        </div>
      </div>
    </form>
  );
}
