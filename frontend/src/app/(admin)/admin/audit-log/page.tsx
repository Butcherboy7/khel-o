'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ScrollText,
  Search,
  Filter,
  RefreshCw,
  Store,
  Users,
  UserX,
  Star,
  ShieldX,
  CheckCircle2,
  XCircle,
} from 'lucide-react';
import { listAuditLog } from '@/lib/api/admin';
import type { AdminAuditEntry } from '@/lib/api/admin';
import { queryKeys } from '@/hooks/queries/keys';
import { Badge, SkeletonCard, ErrorState, EmptyState } from '@/components/ui';

/* ─── helpers ─────────────────────────────────────────────────────── */

function actionIcon(action: string) {
  if (action.startsWith('cafe.approve')) return <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />;
  if (action.startsWith('cafe.reject')) return <XCircle className="h-3.5 w-3.5 text-red-500" />;
  if (action.startsWith('cafe.suspend')) return <Store className="h-3.5 w-3.5 text-amber-500" />;
  if (action.startsWith('cafe.reactivate')) return <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />;
  if (action.startsWith('user.deactivate')) return <UserX className="h-3.5 w-3.5 text-red-500" />;
  if (action.startsWith('user.activate')) return <Users className="h-3.5 w-3.5 text-emerald-500" />;
  if (action.startsWith('staff.revoke')) return <ShieldX className="h-3.5 w-3.5 text-red-500" />;
  if (action.startsWith('review.hide')) return <Star className="h-3.5 w-3.5 text-text-secondary" />;
  return <ScrollText className="h-3.5 w-3.5 text-text-tertiary" />;
}

function actionColor(action: string): string {
  if (action.includes('approve') || action.includes('activate') || action.includes('reactivate'))
    return 'text-emerald-600 bg-emerald-500/10';
  if (action.includes('suspend') || action.includes('reject') || action.includes('deactivate') || action.includes('revoke') || action.includes('hide'))
    return 'text-red-600 bg-red-500/10';
  return 'text-text-secondary bg-surface-hover';
}

const ENTITY_FILTERS = [
  { label: 'All', value: 'all' },
  { label: 'Cafés', value: 'cafe' },
  { label: 'Users', value: 'user' },
  { label: 'Staff', value: 'staff' },
  { label: 'Reviews', value: 'review' },
];

/* ─── page ─────────────────────────────────────────────────────────── */

export default function AdminAuditLogPage() {
  const [entityFilter, setEntityFilter] = useState<string>('all');
  const [search, setSearch] = useState('');

  const params = {
    ...(entityFilter !== 'all' ? { entityType: entityFilter } : {}),
    limit: 100,
  };

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: [...queryKeys.admin.all, 'audit-log', entityFilter],
    queryFn: () => listAuditLog(params),
    staleTime: 15_000,
  });

  const entries: AdminAuditEntry[] = (data?.items ?? []).filter((e) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      e.action.toLowerCase().includes(q) ||
      e.adminEmail.toLowerCase().includes(q) ||
      e.entityName?.toLowerCase().includes(q) ||
      e.entityId.toLowerCase().includes(q)
    );
  });

  return (
    <div className="flex flex-col gap-6 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-0.5">
            <ScrollText className="h-5 w-5 text-primary" />
            <h1 className="font-heading text-h1 text-text-primary">Audit Log</h1>
          </div>
          <p className="text-caption text-text-secondary">
            {data?.total ?? '—'} recorded admin actions · newest first.
          </p>
        </div>
        <button
          type="button"
          onClick={() => refetch()}
          className="flex items-center gap-1.5 h-9 px-3 rounded-xl border border-border text-xs font-semibold text-text-secondary hover:bg-surface-hover transition-colors"
        >
          <RefreshCw className="h-4 w-4" />
          Refresh
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-tertiary" />
          <input
            type="text"
            placeholder="Search by action, admin email or entity…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full h-10 pl-9 pr-4 rounded-xl border border-border bg-surface text-caption text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
        </div>

        <div className="flex items-center gap-1 p-1 rounded-xl bg-surface border border-border">
          <Filter className="h-4 w-4 text-text-tertiary ml-1 flex-shrink-0" />
          {ENTITY_FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              onClick={() => setEntityFilter(f.value)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
                entityFilter === f.value
                  ? 'bg-primary text-white shadow-sm'
                  : 'text-text-secondary hover:text-text-primary hover:bg-surface-hover'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* States */}
      {isLoading && <div className="flex flex-col gap-2">{[1, 2, 3, 4].map((i) => <SkeletonCard key={i} />)}</div>}
      {isError && (
        <ErrorState
          title="Failed to load audit log"
          message={(error as Error)?.message ?? 'Could not retrieve audit log.'}
          onRetry={() => refetch()}
        />
      )}
      {!isLoading && !isError && entries.length === 0 && (
        <EmptyState
          title="No audit entries"
          description="Admin actions will appear here once logged."
          icon={<ScrollText className="h-8 w-8 text-text-tertiary" />}
        />
      )}

      {/* Log entries */}
      {!isLoading && !isError && entries.length > 0 && (
        <div className="rounded-2xl border border-border overflow-hidden bg-surface">
          <div className="divide-y divide-border">
            {entries.map((e) => (
              <div
                key={e.id}
                className="px-4 md:px-5 py-3.5 flex flex-col md:flex-row gap-3 md:items-start hover:bg-surface-hover transition-colors"
              >
                {/* Action pill */}
                <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold uppercase tracking-wide flex-shrink-0 w-fit ${actionColor(e.action)}`}>
                  {actionIcon(e.action)}
                  {e.action.replace('.', ' → ')}
                </div>

                {/* Details */}
                <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    {e.entityName && (
                      <span className="text-caption font-semibold text-text-primary">{e.entityName}</span>
                    )}
                    <Badge variant="default" size="sm" className="text-[10px]">{e.entityType}</Badge>
                    <span className="text-[11px] text-text-tertiary font-data">{e.entityId.slice(0, 12)}…</span>
                  </div>
                  {e.reason && (
                    <p className="text-[11px] text-text-secondary italic truncate">&ldquo;{e.reason}&rdquo;</p>
                  )}
                  <p className="text-[11px] text-text-tertiary">by {e.adminEmail}</p>
                </div>

                {/* Timestamp */}
                <span className="text-[11px] text-text-tertiary whitespace-nowrap flex-shrink-0">
                  {new Date(e.createdAt).toLocaleString('en-IN', {
                    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
                  })}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
