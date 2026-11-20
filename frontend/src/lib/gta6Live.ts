import { cache } from 'react';
import { listDrops, type DropListItem } from '@/lib/api/drops';
import { PREORDERED_CAFE_IDS } from '@/constants/gta6';
import { cleanName } from '@/lib/venueKind';

/** One café you can play GTA 6 at today, as the GTA 6 block on the home screen shows it. */
export interface Gta6Cafe {
  id: string;
  name: string;
  area: string | null;
  city: string;
  photo: string | null;
  /** Price per hour, from the café's live GTA 6 listing. */
  price: number;
  /** "HH:MM" or null when the café has not set its hours. */
  opens: string | null;
  closes: string | null;
  href: string;
  /** The café's own page (for structured data), whatever `href` books. */
  cafeHref: string;
  preordered: boolean;
}

/** "…, Bowenpally, Hyderabad" -> "Bowenpally". A long colony name keeps its first word. */
function areaFrom(address: string, city: string): string | null {
  const parts = address.split(',').map((p) => p.trim()).filter(Boolean);
  const last = parts[parts.length - 1];
  const idx = last && last.toLowerCase() === city.toLowerCase() ? parts.length - 2 : parts.length - 1;
  const raw = parts[idx];
  if (!raw || /\d/.test(raw)) return null;
  return raw.length > 22 ? raw.split(' ')[0] : raw;
}

const hhmm = (t: string | null | undefined) => (t ? t.slice(0, 5) : null);

function toCafe(d: DropListItem): Gta6Cafe {
  return {
    id: d.cafe.id,
    name: cleanName(d.cafe.name),
    area: areaFrom(d.cafe.address, d.cafe.city),
    city: d.cafe.city,
    photo: d.cafe.photo ?? d.coverImageUrl ?? null,
    price: Math.round(d.pricePerHour),
    opens: hhmm(d.cafe.openingTime),
    closes: hhmm(d.cafe.closingTime),
    // Game is out: a normal-hours time is the café's own booking page. Before that, the drop.
    href: d.casual ? `/cafe/${d.cafe.slug || d.cafe.id}` : `/drops/${d.slug}`,
    cafeHref: `/cafe/${d.cafe.slug || d.cafe.id}`,
    preordered: PREORDERED_CAFE_IDS.has(d.cafe.id),
  };
}

/** Cafés taking GTA 6 bookings right now, read from the live listings (never typed in by hand). */
export const getGta6Cafes = cache(async (): Promise<Gta6Cafe[]> => {
  try {
    const drops = await listDrops();
    const seen = new Set<string>();
    return drops
      .filter((d) => /gta\s*6/i.test(d.game) && (d.state === 'open' || d.state === 'early'))
      .map(toCafe)
      .filter((c) => (seen.has(c.id) ? false : (seen.add(c.id), true)))
      .sort((a, b) => Number(b.preordered) - Number(a.preordered) || a.price - b.price);
  } catch {
    return [];
  }
});

/** "10:00"-"23:00" -> "10 AM – 11 PM"; a café open round the clock says so. */
export function hoursLabel(opens: string | null, closes: string | null): string | null {
  if (!opens || !closes) return null;
  if (opens === closes || (opens === '00:00' && closes === '23:59')) return 'Open 24 hours';
  const fmt = (t: string) => {
    const [h, m] = t.split(':').map(Number);
    const ap = h >= 12 ? 'PM' : 'AM';
    const h12 = h % 12 === 0 ? 12 : h % 12;
    return m ? `${h12}:${String(m).padStart(2, '0')} ${ap}` : `${h12} ${ap}`;
  };
  return `${fmt(opens)} – ${fmt(closes)}`;
}

export function liveCities(cafes: Gta6Cafe[]): string[] {
  return Array.from(new Set(cafes.map((c) => c.city)));
}
