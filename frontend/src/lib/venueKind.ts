/**
 * What a venue is, for titles, descriptions and schema.org type: a gaming café,
 * a snooker/pool hall, a bowling alley, or a mix. Read from its tiers; a
 * Booking Soon listing has none, so only its own name ("Lucky Billiards",
 * "BOUNCE Bowling") can say. Same rule as the backend SEO service.
 */
export type VenueKindKey = 'gaming' | 'cue' | 'bowling' | 'gaming-cue';

export interface VenueKind {
  key: VenueKindKey;
  /** "Snooker & Pool" — reads after a venue name: "X — Snooker & Pool in Hyderabad". */
  label: string;
  /** schema.org LocalBusiness subtype. */
  schemaType: string;
}

interface TierLike {
  tierType?: 'gaming' | 'activity';
  activityKind?: string | null;
  taxonomyKey?: string | null;
  name?: string;
}

const CUE = /snooker|billiard|\bpool\b/i;
const BOWLING = /bowling/i;

const KINDS: Record<VenueKindKey, VenueKind> = {
  gaming: { key: 'gaming', label: 'Gaming Café', schemaType: 'EntertainmentBusiness' },
  cue: { key: 'cue', label: 'Snooker & Pool', schemaType: 'SportsActivityLocation' },
  bowling: { key: 'bowling', label: 'Bowling Alley', schemaType: 'BowlingAlley' },
  'gaming-cue': { key: 'gaming-cue', label: 'Gaming Café & Snooker', schemaType: 'EntertainmentBusiness' },
};

export function venueKind(venue: { name: string; tiers?: TierLike[] | null }): VenueKind {
  const tiers = venue.tiers ?? [];
  if (tiers.length === 0) {
    if (BOWLING.test(venue.name)) return KINDS.bowling;
    if (CUE.test(venue.name)) return KINDS.cue;
    return KINDS.gaming;
  }
  const text = (t: TierLike) => [t.taxonomyKey, t.activityKind, t.name].filter(Boolean).join(' ');
  const activity = tiers.filter((t) => t.tierType === 'activity');
  const hasCue = activity.some((t) => CUE.test(text(t)));
  const hasBowling = activity.some((t) => BOWLING.test(text(t)));
  const hasGaming = tiers.some((t) => t.tierType !== 'activity') || activity.some((t) => !CUE.test(text(t)) && !BOWLING.test(text(t)));
  if (hasBowling && !hasGaming && !hasCue) return KINDS.bowling;
  if (hasCue && !hasGaming) return KINDS.cue;
  if (hasCue) return KINDS['gaming-cue'];
  return KINDS.gaming;
}

/** The locality kept in addressLine2 ("Kompally"); a full address line is not one. */
export function venueArea(addressLine2: string | null | undefined): string | null {
  const area = (addressLine2 ?? '').trim();
  return area && area.length <= 30 && !area.includes(',') ? area : null;
}

/** "BOUNCE Bowling " -> "BOUNCE Bowling": stray spaces from data entry never reach a title. */
export function cleanName(name: string): string {
  return name.replace(/\s+/g, ' ').trim();
}

const CUE_KEYS = ['snooker', 'pool', 'billiards'];

/** Same answer for a list card, which carries normalized activity keys instead of tiers. */
export function listVenueKind(item: { name: string; activities?: string[] | null }): VenueKind {
  const acts = item.activities ?? [];
  if (acts.length === 0) return venueKind({ name: item.name });
  const hasCue = acts.some((a) => CUE_KEYS.includes(a));
  const hasBowling = acts.includes('bowling');
  const hasGaming = acts.some((a) => !CUE_KEYS.includes(a) && a !== 'bowling');
  if (hasBowling && !hasGaming && !hasCue) return KINDS.bowling;
  if (hasCue && !hasGaming) return KINDS.cue;
  if (hasCue) return KINDS['gaming-cue'];
  return KINDS.gaming;
}
