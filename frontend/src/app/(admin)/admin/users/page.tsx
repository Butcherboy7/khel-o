'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Users,
  Search,
  Filter,
  UserCheck,
  UserX,
  RefreshCw,
  Shield,
  ShieldOff,
  ShieldPlus,
} from 'lucide-react';
import { listAdminUsers, deactivateUser, activateUser, changeUserRole } from '@/lib/api/admin';
import { queryKeys } from '@/hooks/queries/keys';
import {
  Button,
  Badge,
  Modal,
  SkeletonCard,
  ErrorState,
  EmptyState,
} from '@/components/ui';
import type { User, UserRole } from '@/types';

/* ─── helpers ─────────────────────────────────────────────────────── */

function roleColor(role: UserRole): string {
  if (role === 'admin') return 'bg-red-500/10 text-red-600 border-red-500/20';
  if (role === 'cafe_owner') return 'bg-primary/10 text-primary border-primary/20';
  if (role === 'staff') return 'bg-indigo-500/10 text-indigo-600 border-indigo-500/20';
  return 'bg-surface text-text-secondary border-border';
}

function roleLabel(role: UserRole): string {
  const map: Record<UserRole, string> = {
    admin: 'Admin',
    cafe_owner: 'Owner',
    staff: 'Staff',
    gamer: 'Gamer',
  };
  return map[role] ?? role;
}

const ROLE_FILTERS: Array<{ label: string; value: UserRole | 'all' }> = [
  { label: 'All', value: 'all' },
  { label: 'Gamers', value: 'gamer' },
  { label: 'Owners', value: 'cafe_owner' },
  { label: 'Staff', value: 'staff' },
  { label: 'Admins', value: 'admin' },
];

/* ─── page ─────────────────────────────────────────────────────────── */

export default function AdminUsersPage() {
  const queryClient = useQueryClient();

  const [roleFilter, setRoleFilter] = useState<UserRole | 'all'>('all');
  const [search, setSearch] = useState('');

  const params = {
    ...(roleFilter !== 'all' ? { role: roleFilter } : {}),
    limit: 50,
  };

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: [...queryKeys.admin.all, 'users', roleFilter],
    queryFn: () => listAdminUsers(params),
    staleTime: 30_000,
  });

  const users: User[] = (data?.items ?? []).filter((u) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      u.email.toLowerCase().includes(q) ||
      u.fullName?.toLowerCase().includes(q) ||
      u.phoneNumber?.includes(q)
    );
  });

  const deactivateMut = useMutation({
    mutationFn: (userId: string) => deactivateUser(userId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.admin.all }),
  });

  const activateMut = useMutation({
    mutationFn: (userId: string) => activateUser(userId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.admin.all }),
  });

  const promoteMut = useMutation({
    mutationFn: (userId: string) => changeUserRole(userId, 'admin'),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.admin.all }),
  });

  const [confirmPromoteId, setConfirmPromoteId] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-6 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-0.5">
            <Users className="h-5 w-5 text-primary" />
            <h1 className="font-heading text-h1 text-text-primary">All Users</h1>
          </div>
          <p className="text-caption text-text-secondary">
            {data?.total ?? '—'} registered accounts · manage access and status.
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={() => refetch()} className="gap-1.5">
          <RefreshCw className="h-4 w-4" />
          Refresh
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-tertiary" />
          <input
            type="text"
            placeholder="Search by name, email or phone…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full h-10 pl-9 pr-4 rounded-xl border border-border bg-surface text-caption text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
        </div>

        <div className="flex items-center gap-1 p-1 rounded-xl bg-surface border border-border">
          <Filter className="h-4 w-4 text-text-tertiary ml-1 flex-shrink-0" />
          {ROLE_FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              onClick={() => setRoleFilter(f.value)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
                roleFilter === f.value
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
      {isLoading && (
        <div className="flex flex-col gap-3">
          {[1, 2, 3, 4, 5].map((i) => <SkeletonCard key={i} />)}
        </div>
      )}
      {isError && (
        <ErrorState
          title="Failed to load users"
          message={(error as Error)?.message ?? 'Could not retrieve user list.'}
          onRetry={() => refetch()}
        />
      )}
      {!isLoading && !isError && users.length === 0 && (
        <EmptyState
          title="No users found"
          description="Try adjusting your search or role filter."
          icon={<Users className="h-8 w-8 text-text-tertiary" />}
        />
      )}

      {/* User Table (horizontal list — dense) */}
      {!isLoading && !isError && users.length > 0 && (
        <div className="rounded-2xl border border-border overflow-hidden bg-surface">
          {/* Table header */}
          <div className="hidden sm:grid grid-cols-[1fr_auto_auto_auto_auto] gap-4 px-5 py-2.5 bg-surface-hover text-xs font-semibold text-text-secondary border-b border-border">
            <span>User</span>
            <span>Role</span>
            <span>Joined</span>
            <span>Status</span>
            <span>Actions</span>
          </div>

          <div className="divide-y divide-border">
            {users.map((u) => {
              const initials = u.fullName
                ? u.fullName.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()
                : u.email[0].toUpperCase();

              return (
                <div
                  key={u.id}
                  className="px-4 sm:px-5 py-3 flex flex-col sm:grid sm:grid-cols-[1fr_auto_auto_auto_auto] gap-2 sm:gap-4 sm:items-center hover:bg-surface-hover transition-colors"
                >
                  {/* User info */}
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="h-9 w-9 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold flex-shrink-0">
                      {initials}
                    </div>
                    <div className="min-w-0">
                      <p className="text-caption font-semibold text-text-primary truncate">{u.fullName || '—'}</p>
                      <p className="text-[11px] text-text-tertiary truncate">{u.email}</p>
                    </div>
                  </div>

                  {/* Role */}
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-md border text-[10px] font-bold uppercase tracking-wide w-fit ${roleColor(u.role)}`}>
                    {roleLabel(u.role)}
                  </span>

                  {/* Joined */}
                  <span className="text-xs text-text-tertiary whitespace-nowrap">
                    {new Date(u.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit' })}
                  </span>

                  {/* Active status */}
                  <Badge variant={u.isActive ? 'success' : 'error'} size="sm">
                    {u.isActive ? 'Active' : 'Suspended'}
                  </Badge>

                  {/* Actions */}
                  <div className="flex items-center gap-1.5">
                    {u.isActive ? (
                      <button
                        type="button"
                        onClick={() => deactivateMut.mutate(u.id)}
                        disabled={deactivateMut.isPending}
                        title="Suspend account"
                        className="h-8 w-8 rounded-lg border border-border bg-surface flex items-center justify-center hover:bg-red-500/10 hover:border-red-500/30 hover:text-red-600 transition-colors disabled:opacity-50"
                      >
                        <UserX className="h-3.5 w-3.5" />
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => activateMut.mutate(u.id)}
                        disabled={activateMut.isPending}
                        title="Reactivate account"
                        className="h-8 w-8 rounded-lg border border-border bg-surface flex items-center justify-center hover:bg-emerald-500/10 hover:border-emerald-500/30 hover:text-emerald-600 transition-colors disabled:opacity-50"
                      >
                        <UserCheck className="h-3.5 w-3.5" />
                      </button>
                    )}
                    {u.role !== 'admin' && (
                      <button
                        type="button"
                        onClick={() => setConfirmPromoteId(u.id)}
                        title="Promote to admin"
                        className="h-8 w-8 rounded-lg border border-border bg-surface flex items-center justify-center hover:bg-red-500/10 hover:border-red-500/30 hover:text-red-600 transition-colors"
                      >
                        <ShieldPlus className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <Modal
        isOpen={!!confirmPromoteId}
        onClose={() => setConfirmPromoteId(null)}
        title="Promote to admin"
      >
        <div className="flex flex-col gap-4">
          <p className="text-caption text-text-secondary">
            This grants full admin access — every user, café, booking, and payment on the platform.
            Only do this for someone on the KHELO team.
          </p>
          <div className="flex items-center gap-2 justify-end">
            <Button variant="ghost" size="sm" onClick={() => setConfirmPromoteId(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              disabled={promoteMut.isPending}
              onClick={() => {
                if (confirmPromoteId) promoteMut.mutate(confirmPromoteId);
                setConfirmPromoteId(null);
              }}
            >
              Confirm promotion
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
