import { useQuery } from '@tanstack/react-query';
import { getTaxonomy } from '@/lib/api/cafes';
import type { Taxonomy, TaxonomyActivity, TaxonomyAttribute, TaxonomyStyle } from '@/types/taxonomy';

/** The taxonomy changes only with a deploy, so cache it for the session. */
export function useTaxonomy() {
  return useQuery<Taxonomy>({
    queryKey: ['cafes', 'taxonomy'],
    queryFn: getTaxonomy,
    staleTime: Infinity,
    gcTime: Infinity,
  });
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/** Activity + style a taxonomy key points at (undefined when unknown/null). */
export function resolveKey(
  tax: Taxonomy | undefined,
  key: string | null | undefined,
): { activity: TaxonomyActivity; style: TaxonomyStyle | null } | undefined {
  if (!tax || !key) return undefined;
  for (const a of tax.activities) {
    if (a.key === key) return { activity: a, style: null };
    const s = a.styles.find((x) => x.key === key);
    if (s) return { activity: a, style: s };
  }
  return undefined;
}

/**
 * Best-guess activity for an owner's free-text name, only when it points at
 * exactly ONE activity ("Snooker / Pool" matches two, so it returns null and
 * the owner is asked). Mirrors the backend's classify_name conservatively.
 */
export function guessActivityKey(tax: Taxonomy | undefined, text: string | undefined): string | null {
  if (!tax || !text) return null;
  const n = ` ${norm(text)} `;
  const hits = new Set<string>();
  for (const a of tax.activities) {
    const words = [a.label, ...a.aliases, ...a.styles.flatMap((s) => [s.label, ...s.aliases])];
    if (words.some((w) => norm(w) && n.includes(` ${norm(w)} `))) hits.add(a.key);
  }
  return hits.size === 1 ? Array.from(hits)[0] : null;
}

const OPTION_LABELS: Record<string, string> = {
  'ps5': 'PS5', 'ps5-pro': 'PS5 Pro', 'ps4': 'PS4',
  'xbox-series-x': 'Xbox Series X', 'xbox-series-s': 'Xbox Series S', 'xbox-one': 'Xbox One',
  'switch': 'Switch', 'switch-2': 'Switch 2',
  '8-ball': '8-ball', '9-ball': '9-ball', '10-ball': '10-ball',
  'straight-pool': 'Straight pool', 'blackball': 'Blackball',
  'tv': 'TV', 'vr': 'VR', 'steel-tip': 'Steel-tip', 'direct-drive': 'Direct-drive',
};

/** Display label for an attribute option value ("12ft" -> "12 ft"). */
export const optionLabel = (v: string) =>
  OPTION_LABELS[v] ??
  v.replace(/-/g, ' ').replace(/(\d)(ft|hz)$/i, '$1 $2').replace(/^./, (c) => c.toUpperCase());

type Attrs = Record<string, string | number | boolean | string[]>;

export interface TierDescription {
  activityLabel: string;
  category: string;
  styleLabel?: string;
  styleHint?: string;
  /** Glanceable pieces for a one-line summary, most useful first. */
  items: string[];
  /** Everything the owner filled in, for the expanded view. */
  rows: { label: string; value: string }[];
}

const fmtValue = (a: TaxonomyAttribute, v: string | number | boolean | string[]): string => {
  if (Array.isArray(v)) return v.map(optionLabel).join(', ');
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  if (typeof v === 'number') return a.unit ? `${v} ${a.unit}` : String(v);
  const base = a.type === 'enum' ? optionLabel(v) : v;
  return a.type === 'enum' && a.unit ? `${base} ${a.unit}` : base;
};

/**
 * What a customer should be told about a setup: only what the owner actually
 * filled in ("Don't know" is simply absent), nothing invented. Null when the
 * tier has no classification or nothing to show.
 */
export function describeTier(
  tax: Taxonomy | undefined,
  tier: { taxonomyKey?: string | null; attributes?: Attrs | null },
): TierDescription | null {
  const resolved = resolveKey(tax, tier.taxonomyKey);
  if (!resolved) return null;
  const { activity, style } = resolved;
  const attrs = tier.attributes ?? {};

  const items: string[] = [];
  const rows: { label: string; value: string }[] = [];
  if (style) {
    items.push(style.label);
    rows.push({ label: 'Type', value: style.label });
  }
  for (const a of activity.attributes) {
    const v = attrs[a.key];
    if (v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0)) continue;
    const text = fmtValue(a, v);
    rows.push({ label: a.label, value: text });
    const glanceable =
      a.filterable !== false &&
      a.type !== 'multi' &&
      (a.type !== 'int' || !!a.unit) &&
      a.type !== 'bool';
    if (glanceable) items.push(text);
  }
  if (rows.length === 0) return null;
  return {
    activityLabel: activity.label,
    category: activity.category,
    styleLabel: style?.label,
    styleHint: style?.hint,
    items,
    rows,
  };
}
