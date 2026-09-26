import Link from 'next/link';
import { FACET_GROUP_LABELS, type SeoFacetType, type SeoLink } from '@/lib/api/seo';

const ORDER: SeoFacetType[] = ['activity', 'game', 'gpu', 'price'];

/**
 * Internal links to landing pages, grouped by kind. Only ever given
 * indexable pages (the SEO service filters), so crawlers are never pointed
 * at thin or duplicate combinations.
 */
export function SeoLinkGroups({ links, title }: { links: SeoLink[]; title?: string }) {
  if (links.length === 0) return null;
  const groups = ORDER.map((type) => ({ type, items: links.filter((l) => l.type === type) })).filter(
    (g) => g.items.length > 0
  );

  return (
    <section className="flex flex-col gap-3">
      {title && <h2 className="font-heading text-h2 text-text-primary">{title}</h2>}
      {groups.map((g) => (
        <nav key={g.type} aria-label={FACET_GROUP_LABELS[g.type]} className="flex flex-col gap-1.5">
          <span className="text-overline uppercase tracking-wider text-text-secondary">{FACET_GROUP_LABELS[g.type]}</span>
          <div className="flex flex-wrap gap-2">
            {g.items.map((l) => (
              <Link
                key={l.path}
                href={l.path}
                className="rounded-full border border-border bg-card px-3 py-1.5 text-caption font-semibold text-text-primary transition-colors hover:border-primary hover:text-primary"
              >
                {l.label}
                {l.count != null && <span className="text-text-secondary"> ({l.count})</span>}
              </Link>
            ))}
          </div>
        </nav>
      ))}
    </section>
  );
}
