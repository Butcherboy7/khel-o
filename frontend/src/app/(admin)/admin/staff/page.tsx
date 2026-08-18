'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  UsersRound,
  Search,
  RefreshCw,
  ShieldX,
  Clock,
  CheckCircle2,
} from 'lucide-react';
import { listAdminStaff, revokeStaffAccess } from '@/lib/api/admin';
import type { AdminStaffMember, AdminPendingInvitation } from '@/lib/api/admin';
import { queryKeys } from '@/hooks/queries/keys';
import { Badge, SkeletonCard, ErrorState, EmptyState } from '@/components/ui';

export default function AdminStaffPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: [...queryKeys.admin.all, 'staff'],
    queryFn: () => listAdminStaff({ limit: 100 }),
    staleTime: 30_000,
  });

  const revokeMut = useMutation({
    mutationFn: ({ userId, cafeId }: { userId: string; cafeId: string }) =>
      revokeStaffAccess(userId, cafeId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.admin.all }),
  });

  const staff: AdminStaffMember[] = (data?.items ?? []).filter((s) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      s.email.toLowerCase().includes(q) ||
      s.fullName?.toLowerCase().includes(q) ||
      s.cafeName?.toLowerCase().includes(q)
    );
  });

  const pending: AdminPendingInvitation[] = (data?.pendingInvitations ?? []).filter((i) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return i.email.toLowerCase().includes(q) || i.fullName?.toLowerCase().includes(q);
  });

  return (
    <div className="flex flex-col gap-6 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-0.5">
            <UsersRound className="h-5 w-5 text-primary" />
            <h1 className="font-heading text-h1 text-text-primary">Staff Oversight</h1>
          </div>
          <p className="text-caption text-text-secondary">
            {data?.total ?? '—'} active staff · {pending.length} pending invitations.
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

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-tertiary" />
        <input
          type="text"
          placeholder="Search by name, email or café…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full h-10 pl-9 pr-4 rounded-xl border border-border bg-surface text-caption text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-primary/40"
        />
      </div>

      {/* States */}
      {isLoading && <div className="flex flex-col gap-2">{[1, 2, 3].map((i) => <SkeletonCard key={i} />)}</div>}
      {isError && (
        <ErrorState
          title="Failed to load staff"
          message={(error as Error)?.message ?? 'Could not retrieve staff list.'}
          onRetry={() => refetch()}
        />
      )}

      {!isLoading && !isError && staff.length === 0 && pending.length === 0 && (
        <EmptyState
          title="No staff found"
          description="No active staff or pending invitations match your search."
          icon={<UsersRound className="h-8 w-8 text-text-tertiary" />}
        />
      )}

      {/* Active Staff */}
      {!isLoading && !isError && staff.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="font-heading text-h3 text-text-primary flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            Active Staff ({staff.length})
          </h2>

          <div className="rounded-2xl border border-border overflow-hidden bg-surface">
            <div className="hidden md:grid grid-cols-[1fr_1fr_auto_auto_auto] gap-4 px-5 py-2.5 bg-surface-hover text-xs font-semibold text-text-secondary border-b border-border">
              <span>Staff Member</span>
              <span>Café</span>
              <span>Joined</span>
              <span>Status</span>
              <span>Action</span>
            </div>

            <div className="divide-y divide-border">
              {staff.map((s) => {
                const initials = s.fullName
                  ? s.fullName.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()
                  : s.email[0].toUpperCase();

                return (
                  <div
                    key={`${s.userId}-${s.cafeId}`}
                    className="px-4 md:px-5 py-3 flex flex-col md:grid md:grid-cols-[1fr_1fr_auto_auto_auto] gap-2 md:gap-4 md:items-center hover:bg-surface-hover transition-colors"
                  >
                    {/* Member info */}
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="h-8 w-8 rounded-full bg-indigo-500/10 text-indigo-600 flex items-center justify-center text-xs font-bold flex-shrink-0">
                        {initials}
                      </div>
                      <div className="min-w-0">
                        <p className="text-caption font-semibold text-text-primary truncate">{s.fullName || '—'}</p>
                        <p className="text-[11px] text-text-tertiary truncate">{s.email}</p>
                      </div>
                    </div>

                    {/* Café */}
                    <span className="text-xs text-text-primary truncate">{s.cafeName ?? '—'}</span>

                    {/* Joined */}
                    <span className="text-xs text-text-tertiary whitespace-nowrap">
                      {s.joinedAt
                        ? new Date(s.joinedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit' })
                        : '—'}
                    </span>

                    {/* Status */}
                    <Badge variant={s.isActive ? 'success' : 'error'} size="sm">
                      {s.isActive ? 'Active' : 'Suspended'}
                    </Badge>

                    {/* Revoke */}
                    <button
                      type="button"
                      disabled={!s.cafeId || revokeMut.isPending}
                      onClick={() => {
                        if (s.cafeId && confirm(`Revoke ${s.fullName || s.email}'s staff access to ${s.cafeName}?`)) {
                          revokeMut.mutate({ userId: s.userId, cafeId: s.cafeId });
                        }
                      }}
                      title="Revoke staff access"
                      className="h-8 w-8 rounded-lg border border-border bg-surface flex items-center justify-center hover:bg-red-500/10 hover:border-red-500/30 hover:text-red-600 transition-colors disabled:opacity-40"
                    >
                      <ShieldX className="h-3.5 w-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {/* Pending Invitations */}
      {!isLoading && !isError && pending.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="font-heading text-h3 text-text-primary flex items-center gap-2">
            <Clock className="h-4 w-4 text-amber-500" />
            Pending Invitations ({pending.length})
          </h2>

          <div className="rounded-2xl border border-border overflow-hidden bg-surface">
            <div className="divide-y divide-border">
              {pending.map((inv) => (
                <div
                  key={inv.id}
                  className="px-4 md:px-5 py-3 flex flex-col md:flex-row md:items-center gap-2 md:gap-4 hover:bg-surface-hover transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-caption font-semibold text-text-primary">{inv.fullName}</p>
                    <p className="text-[11px] text-text-tertiary">{inv.email}</p>
                  </div>
                  <Badge variant="warning" size="sm">Pending</Badge>
                  <span className="text-xs text-text-tertiary whitespace-nowrap">
                    Expires {new Date(inv.expiresAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
