'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import {
  Store,
  Search,
  Filter,
  MapPin,
  Users,
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  RefreshCw,
  Eye,
  PauseCircle,
  ChevronRight,
} from 'lucide-react';
import { listAdminCafes, suspendCafe, reactivateCafe } from '@/lib/api/admin';
import { queryKeys } from '@/hooks/queries/keys';
import {
  Button,
  Badge,
  Card,
  CardContent,
  Modal,
  Textarea,
  SkeletonCard,
  ErrorState,
  EmptyState,
} from '@/components/ui';
import type { AdminCafe, VerificationStatus } from '@/types';

/* ─── helpers ─────────────────────────────────────────────────────── */

function statusVariant(
  s: VerificationStatus,
): 'success' | 'warning' | 'error' | 'default' {
  if (s === 'verified') return 'success';
  if (s === 'pending') return 'warning';
  if (s === 'rejected') return 'error';
  if (s === 'suspended') return 'error';
  return 'default';
}

function statusLabel(s: VerificationStatus): string {
  const map: Record<VerificationStatus, string> = {
    verified: 'Live',
    pending: 'Pending',
    rejected: 'Rejected',
    suspended: 'Suspended',
  };
  return map[s] ?? s;
}

const STATUS_FILTERS: Array<{ label: string; value: VerificationStatus | 'all' }> = [
  { label: 'All', value: 'all' },
  { label: 'Live', value: 'verified' },
  { label: 'Pending', value: 'pending' },
  { label: 'Rejected', value: 'rejected' },
  { label: 'Suspended', value: 'suspended' },
];

/* ─── page ─────────────────────────────────────────────────────────── */

export default function AdminCafesPage() {
  const queryClient = useQueryClient();

  const [statusFilter, setStatusFilter] = useState<VerificationStatus | 'all'>('all');
  const [search, setSearch] = useState('');
  const [selectedCafe, setSelectedCafe] = useState<AdminCafe | null>(null);
  const [isSuspendModalOpen, setIsSuspendModalOpen] = useState(false);
  const [suspendReason, setSuspendReason] = useState('');

  const params = {
    ...(statusFilter !== 'all' ? { verificationStatus: statusFilter } : {}),
    limit: 50,
  };

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: [...queryKeys.admin.all, 'cafes', statusFilter],
    queryFn: () => listAdminCafes(params),
    staleTime: 30_000,
  });

  const cafes = (data?.items ?? []).filter((c) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      c.name.toLowerCase().includes(q) ||
      c.city?.toLowerCase().includes(q) ||
      c.owner?.email?.toLowerCase().includes(q) ||
      c.owner?.fullName?.toLowerCase().includes(q)
    );
  });

  const suspendMutation = useMutation({
    mutationFn: ({ cafeId, reason }: { cafeId: string; reason: string }) =>
      suspendCafe(cafeId, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.admin.all });
      setIsSuspendModalOpen(false);
      setSelectedCafe(null);
      setSuspendReason('');
    },
  });

  const reactivateMutation = useMutation({
    mutationFn: (cafeId: string) => reactivateCafe(cafeId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.admin.all });
      setSelectedCafe(null);
    },
  });

  return (
    <div className="flex flex-col gap-6 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-0.5">
            <Store className="h-5 w-5 text-primary" />
            <h1 className="font-heading text-h1 text-text-primary">All Cafés</h1>
          </div>
          <p className="text-caption text-text-secondary">
            {data?.total ?? '—'} venues total · manage status, suspend or reactivate.
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={() => refetch()} className="gap-1.5">
          <RefreshCw className="h-4 w-4" />
          Refresh
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        {/* Search */}
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-tertiary" />
          <input
            type="text"
            placeholder="Search by name, city, owner name or email…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full h-10 pl-9 pr-4 rounded-xl border border-border bg-surface text-caption text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
        </div>

        {/* Status filter tabs */}
        <div className="flex items-center gap-1 p-1 rounded-xl bg-surface border border-border">
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
      </div>

      {/* States */}
      {isLoading && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => <SkeletonCard key={i} />)}
        </div>
      )}

      {isError && (
        <ErrorState
          title="Failed to load cafés"
          message={(error as Error)?.message ?? 'Could not retrieve café list.'}
          onRetry={() => refetch()}
        />
      )}

      {!isLoading && !isError && cafes.length === 0 && (
        <EmptyState
          title="No cafés found"
          description="Try adjusting your search or filter."
          icon={<Store className="h-8 w-8 text-text-tertiary" />}
        />
      )}

      {/* Café Grid */}
      {!isLoading && !isError && cafes.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {cafes.map((cafe) => (
            <Card key={cafe.id} elevation="resting" className="overflow-hidden hover:border-primary/30 transition-colors">
              <CardContent className="p-5 flex flex-col gap-3">
                {/* Top row */}
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="font-heading text-h3 text-text-primary truncate">{cafe.name}</h3>
                    <div className="flex items-center gap-1 text-xs text-text-secondary mt-0.5">
                      <MapPin className="h-3 w-3 flex-shrink-0" />
                      <span className="truncate">{cafe.city}, {cafe.state}</span>
                    </div>
                  </div>
                  <Badge variant={statusVariant(cafe.verificationStatus)} size="sm" className="flex-shrink-0">
                    {statusLabel(cafe.verificationStatus)}
                  </Badge>
                </div>

                {/* Meta row */}
                <div className="flex flex-wrap items-center gap-3 text-xs text-text-secondary border-t border-border pt-3">
                  <span className="flex items-center gap-1">
                    <Users className="h-3 w-3" />
                    {cafe.totalSeats ?? '—'} stations
                  </span>
                  {cafe.owner && (
                    <span className="truncate">
                      Owner: <span className="font-semibold text-text-primary">{cafe.owner.fullName || cafe.owner.email}</span>
                    </span>
                  )}
                  {cafe.tiers && cafe.tiers.length > 0 && (
                    <span>{cafe.tiers.length} tier{cafe.tiers.length > 1 ? 's' : ''}</span>
                  )}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setSelectedCafe(cafe)}
                    className="flex-1 flex items-center justify-center gap-1.5 h-8 rounded-xl border border-border bg-surface text-xs font-semibold text-text-primary hover:bg-surface-hover transition-colors"
                  >
                    <Eye className="h-3.5 w-3.5" />
                    Details
                  </button>

                  {cafe.verificationStatus === 'verified' && (
                    <button
                      type="button"
                      onClick={() => { setSelectedCafe(cafe); setIsSuspendModalOpen(true); }}
                      className="flex items-center gap-1 h-8 px-3 rounded-xl border border-amber-500/30 bg-amber-500/5 text-xs font-semibold text-amber-600 hover:bg-amber-500/15 transition-colors whitespace-nowrap"
                    >
                      <PauseCircle className="h-3.5 w-3.5" />
                      Suspend
                    </button>
                  )}

                  {(cafe.verificationStatus === 'rejected' || cafe.verificationStatus === 'suspended') && (
                    <button
                      type="button"
                      onClick={() => reactivateMutation.mutate(cafe.id)}
                      disabled={reactivateMutation.isPending}
                      className="flex items-center gap-1 h-8 px-3 rounded-xl border border-emerald-500/30 bg-emerald-500/5 text-xs font-semibold text-emerald-600 hover:bg-emerald-500/15 transition-colors whitespace-nowrap disabled:opacity-50"
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Reactivate
                    </button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Detail Modal */}
      <Modal
        isOpen={!!selectedCafe && !isSuspendModalOpen}
        onClose={() => setSelectedCafe(null)}
        title={selectedCafe?.name ?? 'Café Details'}
        description={`${selectedCafe?.city}, ${selectedCafe?.state} · ${statusLabel(selectedCafe?.verificationStatus ?? 'pending')}`}
      >
        {selectedCafe && (
          <div className="flex flex-col gap-4 max-h-[60vh] overflow-y-auto">
            {/* Owner */}
            {selectedCafe.owner && (
              <div className="p-3 rounded-xl bg-surface-hover">
                <h4 className="font-semibold text-caption mb-2">Owner</h4>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div><span className="text-text-tertiary">Name: </span>{selectedCafe.owner.fullName}</div>
                  <div><span className="text-text-tertiary">Email: </span>{selectedCafe.owner.email}</div>
                  <div><span className="text-text-tertiary">Phone: </span>{selectedCafe.owner.phoneNumber ?? '—'}</div>
                </div>
              </div>
            )}

            {/* Business Identity */}
            <div className="p-3 rounded-xl bg-surface-hover">
              <h4 className="font-semibold text-caption mb-2">Business Identity</h4>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="col-span-2"><span className="text-text-tertiary">Address: </span>{selectedCafe.addressLine1}, {selectedCafe.city} {selectedCafe.pincode}</div>
                <div><span className="text-text-tertiary">Phone: </span>{selectedCafe.phoneNumber ?? '—'}</div>
                <div><span className="text-text-tertiary">Email: </span>{selectedCafe.email ?? '—'}</div>
                <div><span className="text-text-tertiary">Hours: </span>{selectedCafe.openingTime ?? '—'} – {selectedCafe.closingTime ?? '—'}</div>
                <div><span className="text-text-tertiary">Stations: </span>{selectedCafe.totalSeats ?? '—'}</div>
              </div>
            </div>

            {/* Documents */}
            <div className="p-3 rounded-xl bg-surface-hover">
              <h4 className="font-semibold text-caption mb-2">Verification Documents</h4>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div><span className="text-text-tertiary">PAN: </span>{selectedCafe.businessPan ?? 'Not provided'}</div>
                <div><span className="text-text-tertiary">GSTIN: </span>{selectedCafe.gstin ?? 'Not provided'}</div>
                <div className="col-span-2">
                  <span className="text-text-tertiary">Legal Doc: </span>
                  {selectedCafe.legalDocumentUrl
                    ? <a href={selectedCafe.legalDocumentUrl} target="_blank" rel="noopener noreferrer" className="text-primary underline">View</a>
                    : 'Not provided'}
                </div>
              </div>
            </div>

            {/* Payout */}
            <div className="p-3 rounded-xl bg-surface-hover">
              <h4 className="font-semibold text-caption mb-2">Payout Account</h4>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div><span className="text-text-tertiary">Holder: </span>{selectedCafe.accountHolderName ?? '—'}</div>
                <div><span className="text-text-tertiary">Account: </span>{selectedCafe.bankAccountNumber ? `••••${selectedCafe.bankAccountNumber.slice(-4)}` : '—'}</div>
                <div><span className="text-text-tertiary">IFSC: </span>{selectedCafe.bankIfsc ?? '—'}</div>
              </div>
            </div>

            {/* Tiers */}
            {selectedCafe.tiers && selectedCafe.tiers.length > 0 && (
              <div className="p-3 rounded-xl bg-surface-hover">
                <h4 className="font-semibold text-caption mb-2">Hardware Tiers ({selectedCafe.tiers.length})</h4>
                <div className="flex flex-col gap-1.5">
                  {selectedCafe.tiers.map((t) => (
                    <div key={t.id} className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-text-primary">{t.name}</span>
                      <span className="text-text-tertiary">{t.totalSeats} seats · ₹{t.pricePerHour}/hr</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Rejection reason if any */}
            {selectedCafe.rejectionReason && (
              <div className="p-3 rounded-xl bg-red-500/5 border border-red-500/20">
                <h4 className="font-semibold text-caption text-red-600 mb-1">Rejection Reason</h4>
                <p className="text-xs text-text-secondary">{selectedCafe.rejectionReason}</p>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* Suspend Modal */}
      <Modal
        isOpen={isSuspendModalOpen}
        onClose={() => { setIsSuspendModalOpen(false); setSuspendReason(''); }}
        title={`Suspend: ${selectedCafe?.name}`}
        description="This café will be immediately removed from the marketplace. Provide a reason."
        footer={
          <div className="flex items-center justify-end gap-3">
            <Button variant="ghost" onClick={() => { setIsSuspendModalOpen(false); setSuspendReason(''); }}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              isLoading={suspendMutation.isPending}
              loadingText="Suspending…"
              disabled={!suspendReason.trim()}
              onClick={() => {
                if (selectedCafe) {
                  suspendMutation.mutate({ cafeId: selectedCafe.id, reason: suspendReason });
                }
              }}
            >
              <AlertTriangle className="h-4 w-4 mr-1.5" />
              Confirm Suspension
            </Button>
          </div>
        }
      >
        <Textarea
          label="Suspension Reason *"
          placeholder="e.g. Multiple verified customer complaints about fraudulent charges…"
          value={suspendReason}
          onChange={(e) => setSuspendReason(e.target.value)}
          required
        />
      </Modal>
    </div>
  );
}
