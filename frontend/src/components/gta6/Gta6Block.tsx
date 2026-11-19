import Image from 'next/image';
import Link from 'next/link';
import { ChevronRight, Gamepad2 } from 'lucide-react';
import { Gta6Scene } from '@/app/gta6/Gta6Scene';
import { CityAsk } from '@/components/gta6/CityAsk';
import { OpenNow } from '@/components/gta6/OpenNow';
import { hoursLabel, liveCities, type Gta6Cafe } from '@/lib/gta6Live';
import type { Gta6Sort } from '@/constants/gta6Intents';

/** How late a café stays open, in minutes (24-hour cafés count as the latest). */
function closesAt(c: Gta6Cafe): number {
  if (!c.closes) return -1;
  if (c.opens === '00:00' && (c.closes === '23:59' || c.closes === '00:00')) return 48 * 60;
  const [h, m] = c.closes.split(':').map(Number);
  const mins = h * 60 + (m || 0);
  // Past midnight closings (e.g. 02:00) are later than 23:00.
  return c.opens && mins <= Number(c.opens.slice(0, 2)) * 60 ? mins + 24 * 60 : mins;
}
function opensAt(c: Gta6Cafe): number {
  if (!c.opens) return 24 * 60;
  const [h, m] = c.opens.split(':').map(Number);
  return h * 60 + (m || 0);
}

export function sortGta6Cafes(cafes: Gta6Cafe[], sort?: Gta6Sort): Gta6Cafe[] {
  const list = [...cafes];
  if (sort === 'late') return list.sort((a, b) => closesAt(b) - closesAt(a));
  if (sort === 'early') return list.sort((a, b) => opensAt(a) - opensAt(b));
  if (sort === 'price') return list.sort((a, b) => a.price - b.price);
  return list;
}

interface Gta6BlockProps {
  cafes: Gta6Cafe[];
  /** Visible headline. On the GTA 6 search pages it is the page's h1. */
  heading: string;
  headingAs?: 'h1' | 'h2';
  line?: string;
  /** City page's place name ("Delhi NCR"), null elsewhere. */
  place?: string | null;
  /** The city names that place covers (["Delhi", "Noida", …]), to tell whether it has a café live. */
  placeCities?: string[];
  source: string;
  sort?: Gta6Sort;
}

/**
 * The GTA 6 block at the top of the home screen: sunset, what it costs, the
 * cafés you can book right now, and "Your city not listed?" for everyone else.
 */
export function Gta6Block({ cafes, heading, headingAs = 'h2', line, place = null, placeCities = [], source, sort }: Gta6BlockProps) {
  const H = headingAs;
  const list = sortGta6Cafes(cafes, sort);
  const cities = liveCities(list);
  const min = list.length ? Math.min(...list.map((c) => c.price)) : null;
  const live = new Set(cities.map((c) => c.toLowerCase()));
  const placeIsLive = !!place && placeCities.some((c) => live.has(c.toLowerCase()));
  const where = cities.length === 1 ? `in ${cities[0]}` : cities.length ? `in ${cities.length} cities` : '';
  const sub = line ?? (min != null ? `PS5 cafés from ₹${min}/hr. Book in a minute, walk in with a QR pass.` : 'Book a PS5 at a gaming café and walk in with a QR pass.');

  return (
    <section aria-labelledby="gta6-block-h" className="flex flex-col gap-2.5">
      <div className="overflow-hidden rounded-3xl bg-[#0E0F13] shadow-card">
        <div className="relative isolate min-h-[188px] md:min-h-[218px]">
          <Gta6Scene variant="card" />
          <div className="relative z-10 flex min-h-[188px] flex-col justify-end gap-1.5 bg-gradient-to-t from-[#0E0F13] via-[#0E0F13]/70 to-transparent p-4 pt-16 md:min-h-[218px] md:p-6 md:pt-20">
            {list.length > 0 && (
              <span className="inline-flex w-fit items-center gap-2 rounded-full bg-white/15 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-white backdrop-blur-sm">
                <span aria-hidden="true" className="gta6-live-dot h-1.5 w-1.5 rounded-full bg-[#4CE08A]" />
                Live now · {list.length} {list.length === 1 ? 'café' : 'cafés'} {where}
              </span>
            )}
            <H id="gta6-block-h" className="max-w-[22ch] font-heading text-[1.6rem] font-bold leading-[1.08] tracking-[-0.015em] text-white text-balance md:text-[2.1rem]">
              {heading}
            </H>
            <p className="max-w-[46ch] text-body text-white/85 md:text-[0.95rem]">{sub}</p>
          </div>
        </div>

        {list.length > 0 && (
          <ul className="grid grid-cols-1 gap-px bg-border md:grid-cols-3" aria-label="Cafés to play GTA 6 at">
            {list.map((c, i) => {
              const hours = hoursLabel(c.opens, c.closes);
              return (
                <li key={c.id} className="bg-card">
                  <Link
                    href={c.href}
                    className="group flex h-full items-center gap-3 p-3 transition-colors hover:bg-surface md:flex-col md:items-stretch md:gap-3 md:p-4"
                  >
                    <span className="relative h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-secondary md:h-auto md:w-full md:aspect-[16/9]">
                      {c.photo ? (
                        <Image
                          src={c.photo}
                          alt={`${c.name}, ${c.area ?? c.city}`}
                          fill
                          sizes="(min-width: 768px) 320px, 64px"
                          className="object-cover transition-transform duration-500 group-hover:scale-[1.04]"
                          priority={i === 0}
                        />
                      ) : (
                        <Gamepad2 aria-hidden="true" className="absolute inset-0 m-auto h-6 w-6 text-white/70" />
                      )}
                      {c.preordered && (
                        <span className="absolute bottom-1 left-1 hidden rounded-md bg-primary px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.05em] text-white md:inline-block">
                          Pre-ordered
                        </span>
                      )}
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="truncate font-heading text-h3 font-bold text-text-primary group-hover:text-primary">{c.name}</span>
                      <span className="truncate text-caption text-text-secondary">
                        {[c.area, c.city].filter(Boolean).join(', ')}
                      </span>
                      <span className="text-caption text-text-secondary">
                        <OpenNow opens={c.opens} closes={c.closes} hours={hours} />
                      </span>
                    </span>
                    <span className="flex shrink-0 flex-col items-end gap-1.5 md:flex-row md:items-center md:justify-between">
                      <span className="text-caption text-text-secondary">
                        <b className="font-data text-body font-bold text-text-primary">₹{c.price}</b>/hr
                      </span>
                      <span className="btn-depth inline-flex min-h-[36px] items-center gap-0.5 rounded-xl bg-primary pl-3.5 pr-2.5 text-caption font-bold text-white">
                        Book
                        <ChevronRight aria-hidden="true" className="h-4 w-4" />
                      </span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <CityAsk place={place} placeIsLive={placeIsLive} liveCities={cities} source={source} />
    </section>
  );
}
