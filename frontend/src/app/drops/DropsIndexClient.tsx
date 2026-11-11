'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, LocateFixed, MapPin } from 'lucide-react';
import { CustomerShell } from '@/components/layout/CustomerShell';
import { dropArt } from '@/components/customer/HomeTabs';
import { listDrops, type DropListItem } from '@/lib/api/drops';
import { trackAction } from '@/lib/api/analyticsEvents';
import { distanceKm, gameKey, rupees } from '@/lib/drops';
import { useLocationStore } from '@/store/locationStore';

type Row = DropListItem & { km: number | null };

const kmText = (km: number) => (km < 1 ? `${Math.max(100, Math.round(km * 10) * 100)} m away` : `${km.toFixed(km < 10 ? 1 : 0)} km away`);

/** Every café taking seats, nearest first once we know where you are.
 *  With a game picked (?game=gta6) it is the "pick your café" step before the drop page. */
export function DropsIndexClient({ initial, game }: { initial: DropListItem[] | null; game: string | null }) {
  const { data, isError, refetch } = useQuery({
    queryKey: ['home-drops'],
    queryFn: listDrops,
    staleTime: 60_000,
    retry: false,
    initialData: initial ?? undefined,
  });
  const { userLat, userLng, selectedCity, setUserCoords } = useLocationStore();
  const [mounted, setMounted] = useState(false);
  const [locating, setLocating] = useState(false);
  const [locError, setLocError] = useState<string | null>(null);
  useEffect(() => setMounted(true), []);

  const key = game ? gameKey(game) : null;
  const here = useMemo(
    () => (mounted && userLat != null && userLng != null ? { lat: userLat, lng: userLng } : null),
    [mounted, userLat, userLng],
  );
  const city = mounted && selectedCity && selectedCity !== 'All Cities' ? selectedCity.toLowerCase() : null;

  const all = useMemo(() => data ?? [], [data]);
  const games = useMemo(() => {
    const seen = new Map<string, string>();
    for (const d of all) if (!seen.has(gameKey(d.game))) seen.set(gameKey(d.game), d.game);
    return Array.from(seen, ([k, name]) => ({ key: k, name }));
  }, [all]);
  const picked = key ? games.find((g) => g.key === key) ?? null : null;

  const rows: Row[] = useMemo(() => {
    const list = all
      .filter((d) => !key || gameKey(d.game) === key)
      .map((d) => ({
        ...d,
        km: here && d.cafe.lat != null && d.cafe.lng != null ? distanceKm(here.lat, here.lng, d.cafe.lat, d.cafe.lng) : null,
      }));
    const open = (d: Row) => (d.state === 'open' || d.state === 'early' ? 0 : 1);
    const inCity = (d: Row) => (city && d.cafe.city?.toLowerCase() === city ? 0 : 1);
    return list.sort(
      (a, b) =>
        open(a) - open(b) ||
        (a.km != null && b.km != null ? a.km - b.km : a.km != null ? -1 : b.km != null ? 1 : inCity(a) - inCity(b)) ||
        a.cafe.name.localeCompare(b.cafe.name),
    );
  }, [all, key, here, city]);

  const locate = () => {
    if (!navigator.geolocation) {
      setLocError('This phone cannot share its location. The list below shows every café.');
      return;
    }
    setLocating(true);
    setLocError(null);
    trackAction('drops_locate_tap', { game: key });
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUserCoords(pos.coords.latitude, pos.coords.longitude);
        setLocating(false);
      },
      () => {
        setLocError('We could not get your location. Allow it in your browser, or pick from the list.');
        setLocating(false);
      },
      { timeout: 8000 },
    );
  };

  const title = picked ? `${picked.name}: pick your café` : 'Launch drops';
  const cafes = rows.length;
  // Distances only work for cafés with a map pin. Never promise "nearest first" without one.
  const sorted = rows.some((d) => d.km != null);
  const canSort = rows.some((d) => d.cafe.lat != null && d.cafe.lng != null);

  return (
    <CustomerShell>
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
        <header>
          <h1 className="text-balance font-heading text-h1 font-bold text-text-primary">{title}</h1>
          <p className="mt-1 text-body text-text-secondary">
            {data === undefined
              ? 'Loading cafés…'
              : cafes === 0
              ? 'No café is taking seats right now.'
              : picked
              ? `${cafes} ${cafes === 1 ? 'café is' : 'cafés are'} taking seats. ${sorted ? 'Nearest to you first.' : 'Tap a café to see days and times.'}`
              : 'Reserve a seat with a small booking fee. You pay the rest at the café.'}
          </p>
        </header>

        {/* Other games, when there is more than one drop running */}
        {games.length > 1 && (
          <nav aria-label="Games" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
            {[{ key: '', name: 'All games' }, ...games].map((g) => {
              const on = (key ?? '') === g.key;
              return (
                <Link
                  key={g.key || 'all'}
                  href={g.key ? `/drops?game=${g.key}` : '/drops'}
                  aria-current={on ? 'page' : undefined}
                  className={`flex min-h-[44px] flex-none items-center rounded-full border px-4 text-caption font-bold transition-colors ${
                    on ? 'border-primary bg-primary text-white' : 'border-border bg-card text-text-primary hover:border-primary/50'
                  }`}
                >
                  {g.name}
                </Link>
              );
            })}
          </nav>
        )}

        {/* Nearest first needs a location; one tap, and it is remembered */}
        {cafes > 1 && !here && canSort && (
          <div className="flex flex-col gap-2 rounded-2xl border border-border bg-card p-3.5 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-body text-text-primary">Want the closest one first?</p>
            <button
              type="button"
              onClick={locate}
              disabled={locating}
              className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-primary px-4 text-body font-bold text-primary transition-colors hover:bg-primary/5 disabled:opacity-60"
            >
              <LocateFixed className="h-4 w-4" aria-hidden /> {locating ? 'Finding you…' : 'Use my location'}
            </button>
          </div>
        )}
        {locError && <p className="rounded-xl bg-warning/10 px-3 py-2 text-body text-text-primary">{locError}</p>}

        {isError && data === undefined && (
          <div className="rounded-2xl border border-border bg-card p-5 text-center">
            <p className="text-body text-text-secondary">We could not load the cafés. Check your connection.</p>
            <button type="button" onClick={() => refetch()} className="mt-2 min-h-[44px] px-3 text-body font-bold text-primary">
              Try again
            </button>
          </div>
        )}

        {data !== undefined && cafes === 0 && (
          <div className="rounded-2xl border border-border bg-card p-5 text-center">
            <p className="font-heading text-body-emphasis font-bold text-text-primary">
              {picked || !key ? 'Nothing to reserve right now' : 'We could not find that game'}
            </p>
            <p className="mt-1 text-body text-text-secondary">You can still book a normal slot at any café.</p>
            <Link href="/browse" className="mt-3 inline-flex min-h-[44px] items-center gap-1.5 rounded-full bg-primary px-5 text-body font-bold text-white">
              See all cafés <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          </div>
        )}

        <ul className="flex flex-col gap-3">
          {rows.map((d, i) => {
            const art = dropArt(d);
            const soon = d.state === 'soon';
            const nearest = i === 0 && d.km != null && cafes > 1;
            return (
              <li key={d.id}>
                <Link
                  href={`/drops/${d.slug}`}
                  onClick={() => trackAction('drops_cafe_picked', { drop: d.slug, position: i + 1, km: d.km != null ? Math.round(d.km) : null }, d.cafe.id)}
                  className="group flex gap-3 rounded-2xl border border-border bg-card p-3 shadow-card transition-colors hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  <div className="relative h-24 w-24 flex-none overflow-hidden rounded-xl bg-gradient-to-br from-[#5B1A2A] to-[#D0463C] sm:h-28 sm:w-40">
                    {art && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={art} alt="" loading={i < 3 ? 'eager' : 'lazy'} className="h-full w-full object-cover" />
                    )}
                  </div>
                  <div className="flex min-w-0 flex-1 flex-col">
                    {nearest && <p className="text-[11px] font-extrabold uppercase tracking-wide text-success">Nearest to you</p>}
                    <h2 className="truncate font-heading text-h3 font-bold leading-tight text-text-primary">{d.cafe.name}</h2>
                    <p className="flex items-center gap-1 truncate text-caption text-text-secondary">
                      <MapPin className="h-3.5 w-3.5 flex-none" aria-hidden />
                      <span className="truncate">{d.km != null ? `${kmText(d.km)} · ${d.cafe.city}` : d.cafe.address || d.cafe.city}</span>
                    </p>
                    <p className="mt-1 text-caption text-text-primary">
                      {!picked && <span className="font-semibold">{d.game} · </span>}
                      {rupees(d.pricePerHour)} an hour{d.playsOn ? ` · ${d.playsOn}` : ''}
                    </p>
                    <div className="mt-auto flex items-center justify-between gap-2 pt-2">
                      <span className={`text-caption font-bold ${soon ? 'text-text-secondary' : 'text-error'}`}>
                        {soon ? 'Opens soon' : d.seatsPerSlot ? `${d.seatsPerSlot} seats a night` : `${d.seatsLeft} seats left`}
                      </span>
                      <span className="inline-flex min-h-[36px] items-center gap-1 rounded-full bg-primary px-4 text-caption font-bold text-white transition-transform group-active:scale-95">
                        {d.iHold ? 'Your seats' : soon ? 'Notify me' : 'Reserve'} <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                      </span>
                    </div>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>

        {cafes > 0 && (
          <p className="px-1 pb-4 text-caption text-text-secondary">
            You pay a small booking fee online to hold the seat. It comes off your bill at the café.
          </p>
        )}
      </div>
    </CustomerShell>
  );
}
