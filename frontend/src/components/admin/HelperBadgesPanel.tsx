'use client';

import { useQuery } from '@tanstack/react-query';
import { Award } from 'lucide-react';
import { HelperEmblem, isHelperBadgeKey } from '@/components/customer/HelperEmblem';
import { formatRelativeTime } from '@/lib/format';
import { getHelperBadges } from '@/lib/api/ownerIntros';

/** Who is helping us grow: totals per helper badge and the latest awards. */
export function HelperBadgesPanel() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['admin', 'helper-badges'],
    queryFn: getHelperBadges,
    staleTime: 30_000,
  });

  return (
    <section id="helper-badges" className="flex scroll-mt-4 flex-col gap-3">
      <div className="flex items-center gap-2">
        <Award className="h-5 w-5 text-primary" aria-hidden />
        <h2 className="font-heading text-h3 text-text-primary">Helper badges</h2>
      </div>
      {isLoading ? (
        <p className="text-caption text-text-secondary">Loading badges…</p>
      ) : isError || !data ? (
        <p className="text-caption text-error">Couldn&apos;t load helper badges.</p>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-2">
            {data.totals.map((t) => (
              <div key={t.key} className="flex items-center gap-2 rounded-2xl border border-border bg-card p-3">
                {isHelperBadgeKey(t.key) && <HelperEmblem badge={t.key} size={36} />}
                <span className="flex min-w-0 flex-col">
                  <span className="font-data text-h3 font-bold text-text-primary">{t.count}</span>
                  <span className="truncate text-caption text-text-secondary">{t.title} · +{t.xp} XP</span>
                </span>
              </div>
            ))}
          </div>
          {data.recent.length === 0 ? (
            <p className="text-caption text-text-secondary">No badges earned yet.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-border rounded-2xl border border-border bg-card">
              {data.recent.slice(0, 15).map((r, i) => (
                <li key={`${r.player.email}-${r.key}-${i}`} className="flex items-center justify-between gap-3 px-3 py-2 text-caption">
                  <span className="min-w-0 truncate text-text-primary">
                    <span className="font-semibold">{r.player.name}</span>{' '}
                    <span className="text-text-secondary">{r.player.email}</span>
                  </span>
                  <span className="flex-shrink-0 text-text-secondary">
                    {r.title}{r.grantedAt ? ` · ${formatRelativeTime(r.grantedAt)}` : ''}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
