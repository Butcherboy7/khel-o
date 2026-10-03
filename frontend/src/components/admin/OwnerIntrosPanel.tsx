'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Phone, MessageCircle, Handshake } from 'lucide-react';
import { Card, CardContent, Badge } from '@/components/ui';
import { formatRelativeTime } from '@/lib/format';
import {
  listOwnerIntros,
  setOwnerIntroStatus,
  type AdminOwnerIntro,
  type OwnerIntroStatus,
  type OwnerRelation,
} from '@/lib/api/ownerIntros';

const RELATION_LABEL: Record<OwnerRelation, string> = {
  regular: 'Plays there a lot',
  friend_family: 'Friend / family',
  work_there: 'Works there',
  other: 'Other',
};

const STATUSES: { value: OwnerIntroStatus; label: string }[] = [
  { value: 'new', label: 'New' },
  { value: 'contacted', label: 'Contacted' },
  { value: 'onboarded', label: 'Onboarded' },
  { value: 'dead', label: 'Not interested' },
];

const STATUS_BADGE: Record<OwnerIntroStatus, 'warning' | 'primary' | 'success' | 'default'> = {
  new: 'warning',
  contacted: 'primary',
  onboarded: 'success',
  dead: 'default',
};

/** Players' "Know the owner?" intros — warm leads, so they sit above the
 *  vote counts. Call or WhatsApp straight from the row, then set a status. */
export function OwnerIntrosPanel() {
  const queryClient = useQueryClient();
  const { data, isLoading, isError } = useQuery({
    queryKey: ['admin', 'owner-intros'],
    queryFn: listOwnerIntros,
    staleTime: 30_000,
  });
  const update = useMutation({
    mutationFn: ({ id, status }: { id: string; status: OwnerIntroStatus }) => setOwnerIntroStatus(id, status),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin', 'owner-intros'] }),
  });

  const intros = data?.intros ?? [];
  const fresh = intros.filter((i) => i.status === 'new').length;

  return (
    <section id="owner-intros" className="flex scroll-mt-4 flex-col gap-3">
      <div className="flex items-center gap-2">
        <Handshake className="h-5 w-5 text-primary" aria-hidden />
        <h2 className="font-heading text-h3 text-text-primary">Owner intros</h2>
        {fresh > 0 && <Badge variant="warning" size="sm">{fresh} new</Badge>}
      </div>
      {isLoading ? (
        <p className="text-caption text-text-secondary">Loading intros…</p>
      ) : isError ? (
        <p className="text-caption text-error">Couldn&apos;t load owner intros.</p>
      ) : intros.length === 0 ? (
        <p className="text-caption text-text-secondary">
          No intros yet. Players can send one from a lead café&apos;s page or /know-the-owner.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {intros.map((intro) => (
            <IntroRow
              key={intro.id}
              intro={intro}
              saving={update.isPending && update.variables?.id === intro.id}
              onStatus={(status) => update.mutate({ id: intro.id, status })}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function IntroRow({
  intro,
  saving,
  onStatus,
}: {
  intro: AdminOwnerIntro;
  saving: boolean;
  onStatus: (s: OwnerIntroStatus) => void;
}) {
  const wa = intro.ownerPhone.replace(/\D/g, '');
  const action =
    'inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-border px-3 text-caption font-semibold text-text-primary hover:bg-surface transition-colors';
  return (
    <Card elevation="resting" className="border border-border/80">
      <CardContent className="flex flex-col gap-2.5 p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-heading text-body-emphasis font-bold text-text-primary">{intro.cafeName}</h3>
              <Badge variant={STATUS_BADGE[intro.status]} size="sm">
                {STATUSES.find((s) => s.value === intro.status)?.label}
              </Badge>
            </div>
            {intro.area && <p className="text-caption text-text-secondary">{intro.area}</p>}
          </div>
          <select
            value={intro.status}
            disabled={saving}
            onChange={(e) => onStatus(e.target.value as OwnerIntroStatus)}
            aria-label={`Status for ${intro.cafeName}`}
            className="min-h-[36px] rounded-lg border border-border bg-card px-2 text-caption font-semibold text-text-primary"
          >
            {STATUSES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-caption">
          <span className="font-semibold text-text-primary">{intro.ownerName}</span>
          <span className="font-mono text-text-primary">{intro.ownerPhone}</span>
          <span className="text-text-secondary">· {RELATION_LABEL[intro.relation]}</span>
        </div>
        {intro.note && <p className="rounded-lg bg-surface px-3 py-2 text-caption text-text-primary">{intro.note}</p>}

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex gap-2">
            <a href={`tel:${intro.ownerPhone}`} className={action}>
              <Phone className="h-3.5 w-3.5" aria-hidden /> Call
            </a>
            <a href={`https://wa.me/${wa}`} target="_blank" rel="noopener noreferrer" className={action}>
              <MessageCircle className="h-3.5 w-3.5" aria-hidden /> WhatsApp
            </a>
          </div>
          <span className="text-caption text-text-secondary">
            from {intro.submittedBy.name} ({intro.submittedBy.email})
            {intro.createdAt && ` · ${formatRelativeTime(intro.createdAt)}`}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
