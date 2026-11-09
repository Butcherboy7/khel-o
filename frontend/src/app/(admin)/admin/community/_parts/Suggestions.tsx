'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, X } from 'lucide-react';
import { deleteContribution, getCommunityContributions, setContributionStatus } from '@/lib/api/admin';
import { cn } from '@/lib/cn';
import { ConfirmButton, ErrorLine, Panel, SmallButton, when } from './ui';

export function Suggestions() {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ['admin', 'community-contribs'], queryFn: getCommunityContributions });
  const [filter, setFilter] = useState<'new' | 'approved' | 'declined' | 'all'>('new');
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['admin'] });
    qc.invalidateQueries({ queryKey: ['community-week'] });
  };
  const setStatus = useMutation({ mutationFn: (v: { id: string; status: 'approved' | 'declined' | 'new' }) => setContributionStatus(v.id, v.status), onSuccess: refresh });
  const remove = useMutation({ mutationFn: deleteContribution, onSuccess: refresh });
  const rows = (data ?? []).filter((c) => filter === 'all' || c.status === filter);
  const count = (s: string) => (data ?? []).filter((c) => s === 'all' || c.status === s).length;

  return (
    <Panel
      title="Cafés and photos people sent"
      hint="Approve to thank them by first name on the page (if they allowed it). Decline keeps it out. Delete removes spam for good."
      action={
        <div className="flex flex-wrap gap-1.5">
          {(['new', 'approved', 'declined', 'all'] as const).map((f) => (
            <button key={f} type="button" onClick={() => setFilter(f)} className={cn('rounded-full px-3 py-1.5 text-caption font-bold', filter === f ? 'bg-primary text-white' : 'border border-border text-text-secondary')}>
              {f === 'new' ? 'To review' : f[0].toUpperCase() + f.slice(1)} · {count(f)}
            </button>
          ))}
        </div>
      }
    >
      {rows.length === 0 && <p className="text-body text-text-secondary">Nothing here.</p>}
      <div className="grid gap-3 md:grid-cols-2">
        {rows.map((c) => (
          <div key={c.id} className="flex flex-col gap-1.5 rounded-2xl border border-border p-3">
            <div className="flex items-start justify-between gap-2">
              <p className="font-heading text-body-emphasis font-bold text-text-primary">{c.kind === 'cafe' ? 'Café: ' : 'Photos: '}{c.title}</p>
              <span className="flex-shrink-0 text-caption text-text-secondary">{when(c.createdAt)} · {c.status}</span>
            </div>
            {c.detail && <p className="whitespace-pre-wrap break-words text-body text-text-primary">{c.detail}</p>}
            <p className="text-caption text-text-secondary">
              From {c.name || 'unknown'}{c.email ? ` · ${c.email}` : ''}{c.phone ? ` · ${c.phone}` : ''}{c.contact ? ` · ${c.contact}` : ''}{c.showName ? ' · OK to show their name' : ''}
            </p>
            <div className="mt-1 flex flex-wrap gap-1.5">
              <SmallButton onClick={() => setStatus.mutate({ id: c.id, status: 'approved' })} disabled={c.status === 'approved'}><Check className="h-3.5 w-3.5" aria-hidden /> Approve</SmallButton>
              <SmallButton onClick={() => setStatus.mutate({ id: c.id, status: 'declined' })} disabled={c.status === 'declined'}><X className="h-3.5 w-3.5" aria-hidden /> Decline</SmallButton>
              <ConfirmButton onConfirm={() => remove.mutate(c.id)} armed="Delete for good?" className="ml-auto">Delete</ConfirmButton>
            </div>
          </div>
        ))}
      </div>
      <ErrorLine error={setStatus.error || remove.error} />
    </Panel>
  );
}
