import type { CafeListItem } from '@/types';
import { hasPcTier, hasPlatformTier } from '@/lib/platformTags';

// Landing pages at /cafes/<city>/<activity> — one per thing people actually
// search for ("ps5 cafe hyderabad", "snooker near me"). Gaming platforms are
// a fixed list; physical activities come from the cafés' own tiers, so a new
// activity kind gets a page as soon as a café lists it.

export interface SeoActivity {
  slug: string;
  /** Plural-noun phrase for headings: "PlayStation cafés". */
  heading: string;
  /** Short name for links and copy: "PlayStation". */
  label: string;
  matches: (cafe: CafeListItem) => boolean;
}

const PLATFORM_ACTIVITIES: SeoActivity[] = [
  {
    slug: 'pc-gaming',
    heading: 'PC Gaming Cafés',
    label: 'PC gaming',
    matches: (c) => hasPcTier(c.tierNames, c.platforms, c.platformsComplete),
  },
  {
    slug: 'playstation',
    heading: 'PlayStation (PS5) Gaming Cafés',
    label: 'PlayStation',
    matches: (c) => hasPlatformTier('playstation', c.tierNames, c.platforms, c.platformsComplete),
  },
  {
    slug: 'xbox',
    heading: 'Xbox Gaming Cafés',
    label: 'Xbox',
    matches: (c) => hasPlatformTier('xbox', c.tierNames, c.platforms, c.platformsComplete),
  },
  {
    slug: 'nintendo-switch',
    heading: 'Nintendo Switch Gaming Cafés',
    label: 'Nintendo Switch',
    matches: (c) => (c.platforms ?? []).includes('nintendo'),
  },
];

export function slugifyActivity(text: string): string {
  return text.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

function kindActivity(kind: string): SeoActivity {
  const slug = slugifyActivity(kind);
  return {
    slug,
    heading: `${kind} Venues`,
    label: kind,
    matches: (c) => (c.activityKinds ?? []).some((k) => slugifyActivity(k) === slug),
  };
}

/** Every activity with at least one matching café in `cafes`, each with its matches. */
export function activitiesFor(cafes: CafeListItem[]): { activity: SeoActivity; cafes: CafeListItem[] }[] {
  const kinds = new Map<string, string>();
  for (const c of cafes) for (const k of c.activityKinds ?? []) kinds.set(slugifyActivity(k), k.trim());
  const all = [...PLATFORM_ACTIVITIES, ...Array.from(kinds.values()).map(kindActivity)];
  return all
    .map((activity) => ({ activity, cafes: cafes.filter(activity.matches) }))
    .filter((entry) => entry.cafes.length > 0);
}
