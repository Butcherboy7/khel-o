'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { LifeBuoy, RefreshCw, Filter, Clock } from 'lucide-react';
import {
  listSupportTickets,
  updateSupportTicket,
  type SupportTicket,
} from '@/lib/api/admin';
import { queryKeys } from '@/hooks/queries/keys';
import { Button, Badge, Modal, SkeletonCard, ErrorState, EmptyState } from '@/components/ui';

const STATUS_FILTERS: Array<{ label: string; value: string }> = [
  { label: 'Open', value: 'open' },
  { label: 'In Progress', value: 'in_progress' },
  { label: 'Resolved', value: 'resolved' },
  { label: 'Closed', value: 'closed' },
  { label: 'All', value: 'all' },
];

const CATEGORY_LABEL: Record<string, string> = {
  booking: 'Booking',
  payment: 'Payment',
  cafe: 'Café',
  account: 'Account',
  general: 'General',
};

function statusVariant(status: SupportTicket['status']) {
  if (status === 'open') return 'warning' as const;
  if (status === 'in_progress') return 'primary' as const;
  if (status === 'resolved') return 'success' as const;
  return 'default' as const;
}

function priorityVariant(priority: SupportTicket['priority']) {
  if (priority === 'high') return 'error' as const;
  if (priority === 'low') return 'default' as const;
  return 'accent' as const;
}

export default function AdminSupportPage() {
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState('open');
  const [activeTicket, setActiveTicket] = useState<SupportTicket | null>(null);
  const [notesDraft, setNotesDraft] = useState('');

  const params = statusFilter === 'all' ? {} : { status: statusFilter };

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: [...queryKeys.admin.all, 'support-tickets', statusFilter],
    queryFn: () => listSupportTickets({ ...params, limit: 50 }),
    staleTime: 15_000,
  });

  const updateMut = useMutation({
    mutationFn: (vars: { id: string; status?: string; priority?: string; adminNotes?: string }) =>
      updateSupportTicket(vars.id, vars),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.admin.all });
      setActiveTicket(null);
    },
  });

  const tickets = data?.items ?? [];

  return (
    <div className="flex flex-col gap-6 pb-12">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-0.5">
            <LifeBuoy className="h-5 w-5 text-primary" />
            <h1 className="font-heading text-h1 text-text-primary">Support Tickets</h1>
          </div>
          <p className="text-caption text-text-secondary">
            {data?.total ?? '—'} tickets · triage issues reported by customers and owners.
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={() => refetch()} className="gap-1.5">
          <RefreshCw className="h-4 w-4" />
          Refresh
        </Button>
      </div>

      <div className="flex items-center gap-1 p-1 rounded-xl bg-surface border border-border w-fit">
        <Filter className="h-4 w-4 text-text-tertiary ml-1 flex-shrink-0" />
        {STATUS_FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            onClick={() => setStatusFilter(f.value)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
              statusFilter === f.value
                ? 'bg-primary text-white shadow-sm'
                : 'text-text-secondary hover:text-text-primary hover:bg-surface-hover'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {isLoading && (
        <div className="flex flex-col gap-3">
          {[1, 2, 3].map((i) => <SkeletonCard key={i} />)}
        </div>
      )}
      {isError && (
        <ErrorState
          title="Failed to load tickets"
          message={(error as Error)?.message ?? 'Could not retrieve support tickets.'}
          onRetry={() => refetch()}
        />
      )}
      {!isLoading && !isError && tickets.length === 0 && (
        <EmptyState
          title="No tickets"
          description="Nothing to triage in this view."
          icon={<LifeBuoy className="h-8 w-8 text-text-tertiary" />}
        />
      )}

      {!isLoading && !isError && tickets.length > 0 && (
        <div className="rounded-2xl border border-border overflow-hidden bg-surface divide-y divide-border">
          {tickets.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => { setActiveTicket(t); setNotesDraft(t.adminNotes ?? ''); }}
              className="w-full text-left px-4 sm:px-5 py-3.5 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 hover:bg-surface-hover transition-colors"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-caption font-semibold text-text-primary truncate">{t.subject}</p>
                  <Badge variant="default" size="sm">{CATEGORY_LABEL[t.category] ?? t.category}</Badge>
                </div>
                <p className="text-[11px] text-text-tertiary truncate mt-0.5">{t.description}</p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <Badge variant={priorityVariant(t.priority)} size="sm">{t.priority}</Badge>
                <Badge variant={statusVariant(t.status)} size="sm">{t.status.replace('_', ' ')}</Badge>
                <span className="flex items-center gap-1 text-[11px] text-text-tertiary whitespace-nowrap">
                  <Clock className="h-3 w-3" />
                  {new Date(t.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                </span>
              </div>
            </button>
          ))}
        </div>
      )}

      <Modal
        isOpen={!!activeTicket}
        onClose={() => setActiveTicket(null)}
        title={activeTicket?.subject}
      >
        {activeTicket && (
          <div className="flex flex-col gap-4">
            <p className="text-caption text-text-secondary whitespace-pre-wrap">{activeTicket.description}</p>

            <div className="flex items-center gap-3 text-[11px] text-text-tertiary">
              <span>Category: <strong className="text-text-secondary">{CATEGORY_LABEL[activeTicket.category] ?? activeTicket.category}</strong></span>
              {activeTicket.bookingId && <span>Booking: <strong className="text-text-secondary">{activeTicket.bookingId.slice(0, 8)}</strong></span>}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-caption font-semibold text-text-primary mb-1.5 block">Status</label>
                <select
                  value={activeTicket.status}
                  onChange={(e) => setActiveTicket({ ...activeTicket, status: e.target.value as SupportTicket['status'] })}
                  className="w-full h-10 px-3 rounded-xl border border-border bg-surface text-caption text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
                >
                  <option value="open">Open</option>
                  <option value="in_progress">In progress</option>
                  <option value="resolved">Resolved</option>
                  <option value="closed">Closed</option>
                </select>
              </div>
              <div>
                <label className="text-caption font-semibold text-text-primary mb-1.5 block">Priority</label>
                <select
                  value={activeTicket.priority}
                  onChange={(e) => setActiveTicket({ ...activeTicket, priority: e.target.value as SupportTicket['priority'] })}
                  className="w-full h-10 px-3 rounded-xl border border-border bg-surface text-caption text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
                >
                  <option value="low">Low</option>
                  <option value="normal">Normal</option>
                  <option value="high">High</option>
                </select>
              </div>
            </div>

            <div>
              <label className="text-caption font-semibold text-text-primary mb-1.5 block">Internal notes (visible to the reporter)</label>
              <textarea
                value={notesDraft}
                onChange={(e) => setNotesDraft(e.target.value)}
                rows={3}
                className="w-full px-3 py-2.5 rounded-xl border border-border bg-surface text-caption text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/40 resize-none"
              />
            </div>

            <Button
              variant="primary"
              size="md"
              disabled={updateMut.isPending}
              onClick={() => updateMut.mutate({
                id: activeTicket.id,
                status: activeTicket.status,
                priority: activeTicket.priority,
                adminNotes: notesDraft,
              })}
            >
              Save changes
            </Button>
          </div>
        )}
      </Modal>
    </div>
  );
}
