import { useQuery } from '@tanstack/react-query';
import { getTaxonomy } from '@/lib/api/cafes';
import type { Taxonomy, TaxonomyActivity, TaxonomyStyle } from '@/types/taxonomy';

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

/** Display label for an attribute option value ("12ft" -> "12 ft"). */
export const optionLabel = (v: string) =>
  v.replace(/-/g, ' ').replace(/(\d)(ft|hz)$/i, '$1 $2').replace(/^./, (c) => c.toUpperCase());
