'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ExternalLink, MessageCircle, Phone } from 'lucide-react';
import { getAdminSuggestions, setSuggestionStatus, type CafeSuggestionRow, type SuggestionStatus } from '@/lib/api/cafeSuggestions';
import { Card, CardContent, EmptyState, ErrorState, PageSpinner } from '@/components/ui';

const STATUS: { value: SuggestionStatus; label: string }[] = [
  { value: 'new', label: 'New' },
  { value: 'contacted', label: 'Contacted' },
  { value: 'listed', label: 'Listed' },
  { value: 'no_answer', label: 'No answer' },
];

export default function AdminCafeSuggestionsPage() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState<SuggestionStatus | 'all'>('new');
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['admin', 'cafe-suggestions'],
    queryFn: getAdminSuggestions,
    staleTime: 30_000,
  });
  const update = useMutation({
    mutationFn: ({ id, status }: { id: string; status: SuggestionStatus }) => setSuggestionStatus(id, status),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'cafe-suggestions'] }),
  });

  if (isLoading) return <PageSpinner label="Loading café suggestions" />;
  if (isError || !data) {
    return <ErrorState title="Couldn't load suggestions" message={(error as Error)?.message || 'Failed to fetch.'} onRetry={() => refetch()} />;
  }
  const rows = data.items.filter((r) => filter === 'all' || r.status === filter);
  const count = (s: SuggestionStatus) => data.items.filter((r) => r.status === s).length;

  const wa = (r: CafeSuggestionRow) =>
    `https://wa.me/${r.suggesterPhone.replace(/\D/g, '')}?text=${encodeURIComponent(
      `Hi ${r.suggesterName.split(' ')[0]}, it’s KHEL-O. Thanks for suggesting ${r.cafeName}. `,
    )}`;

  return (
    <div className="flex flex-col gap-6 pb-12">
      <div>
        <h1 className="font-heading text-h2 text-text-primary lg:text-h1">Café suggestions</h1>
        <p className="mt-0.5 text-body text-text-secondary">
          Cafés players want on KHEL-O. Contact the café, then mark it. {data.total} in total.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {[{ value: 'all' as const, label: `All (${data.total})` }, ...STATUS.map((s) => ({ value: s.value, label: `${s.label} (${count(s.value)})` }))].map((c) => (
          <button
            key={c.value}
            onClick={() => setFilter(c.value)}
            className={`rounded-full border px-3 py-1 text-caption font-semibold transition-colors ${
              filter === c.value ? 'border-primary bg-primary/10 text-primary' : 'border-border text-text-secondary hover:bg-surface'
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>

      {rows.length === 0 ? (
        <EmptyState title="Nothing here" description="No suggestions in this view." />
      ) : (
        <ul className="flex flex-col gap-3">
          {rows.map((r) => (
            <li key={r.id}>
              <Card>
                <CardContent className="flex flex-col gap-3 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold text-text-primary">{r.cafeName}</p>
                      <p className="text-caption text-text-secondary">
                        {r.city} · {new Date(r.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                        {r.source ? ` · ${r.source}` : ''}
                      </p>
                    </div>
                    <select
                      aria-label={`Status of ${r.cafeName}`}
                      value={r.status}
                      onChange={(e) => update.mutate({ id: r.id, status: e.target.value as SuggestionStatus })}
                      className="h-10 rounded-lg border border-border bg-card px-3 text-body"
                    >
                      {STATUS.map((s) => (
                        <option key={s.value} value={s.value}>{s.label}</option>
                      ))}
                    </select>
                  </div>
                  <div className="flex flex-wrap gap-2 text-body">
                    {r.mapsUrl && (
                      <a href={r.mapsUrl} target="_blank" rel="noopener noreferrer" className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-border px-3 font-semibold">
                        <ExternalLink className="h-4 w-4" aria-hidden /> Open in Maps
                      </a>
                    )}
                    {r.cafePhone && (
                      <a href={`tel:${r.cafePhone}`} className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-border px-3 font-semibold">
                        <Phone className="h-4 w-4" aria-hidden /> Call café {r.cafePhone}
                      </a>
                    )}
                    <a href={wa(r)} target="_blank" rel="noopener noreferrer" className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-border px-3 font-semibold">
                      <MessageCircle className="h-4 w-4" aria-hidden /> {r.suggesterName} · {r.suggesterPhone}
                    </a>
                  </div>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
