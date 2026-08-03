'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ShieldCheck,
  CheckCircle2,
  XCircle,
  Clock,
  Store,
  MapPin,
  User,
  AlertCircle,
} from 'lucide-react';
import { listPendingCafes, verifyCafe, getAdminAnalytics } from '@/lib/api/admin';
import { queryKeys } from '@/hooks/queries/keys';
import {
  Button,
  Card,
  CardContent,
  StatCard,
  Badge,
  Modal,
  Textarea,
  SkeletonCard,
  ErrorState,
  EmptyState,
} from '@/components/ui';
import { formatCurrencyCompact } from '@/lib/format';
import type { AdminCafe } from '@/types';

export default function AdminPage() {
  const queryClient = useQueryClient();
  const [selectedCafe, setSelectedCafe] = useState<AdminCafe | null>(null);
  const [isRejectModalOpen, setIsRejectModalOpen] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');

  // Fetch platform analytics
  const { data: analytics } = useQuery({
    queryKey: queryKeys.admin.analytics,
    queryFn: getAdminAnalytics,
    staleTime: 60_000,
  });

  // Fetch pending cafes queue
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: queryKeys.admin.pendingCafes(),
    queryFn: () => listPendingCafes(),
    staleTime: 0,
  });

  const pendingCafes = data?.items || [];

  // Verify / Approve mutation
  const approveMutation = useMutation({
    mutationFn: (cafeId: string) => verifyCafe(cafeId, { status: 'verified' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.admin.all });
      setSelectedCafe(null);
    },
  });

  // Reject mutation
  const rejectMutation = useMutation({
    mutationFn: ({ cafeId, reason }: { cafeId: string; reason: string }) =>
      verifyCafe(cafeId, { status: 'rejected', reason }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.admin.all });
      setIsRejectModalOpen(false);
      setSelectedCafe(null);
    },
  });

  return (
    <div className="flex flex-col gap-8 pb-12">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <ShieldCheck className="h-6 w-6 text-primary" />
          <h1 className="font-heading text-h1 text-text-primary">Admin Verification Queue</h1>
        </div>
        <p className="text-body text-text-secondary">
          Review partner applications, verify café venues, and oversee platform health.
        </p>
      </div>

      {/* Platform Analytics Banner */}
      {analytics && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard
            label="Total Users"
            value={analytics.totalUsers || 0}
            subtext="Registered gamers & owners"
          />
          <StatCard
            label="Live Cafés"
            value={analytics.totalCafes || 0}
            subtext="Verified partner venues"
          />
          <StatCard
            label="Total GMV"
            value={formatCurrencyCompact(analytics.totalRevenue || 0)}
            subtext="Platform booking volume"
          />
          <StatCard
            label="Pending Queue"
            value={analytics.pendingCafes || pendingCafes.length}
            subtext="Awaiting admin review"
          />
        </div>
      )}

      {/* Pending Applications Queue */}
      <section className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="font-heading text-h2 text-text-primary">Pending Applications</h2>
          <Badge variant="warning">{pendingCafes.length} Pending</Badge>
        </div>

        {isLoading && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <SkeletonCard />
            <SkeletonCard />
          </div>
        )}

        {isError && (
          <ErrorState
            title="Failed to load verification queue"
            message={(error as Error)?.message || 'Could not retrieve pending applications.'}
            onRetry={() => refetch()}
          />
        )}

        {!isLoading && !isError && pendingCafes.length === 0 && (
          <EmptyState
            title="Queue Clear!"
            description="There are currently no pending café partner applications awaiting review."
            icon={<CheckCircle2 className="h-8 w-8 text-success" />}
          />
        )}

        {!isLoading && !isError && pendingCafes.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {pendingCafes.map((cafe) => (
              <Card key={cafe.id} elevation="resting" className="overflow-hidden">
                <CardContent className="p-5 flex flex-col gap-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="font-heading text-h3 text-text-primary">{cafe.name}</h3>
                      <div className="flex items-center gap-1 text-caption text-text-secondary mt-0.5">
                        <MapPin className="h-3.5 w-3.5 text-primary" />
                        <span>{cafe.city}, {cafe.state}</span>
                      </div>
                    </div>
                    <Badge variant="warning">Pending Review</Badge>
                  </div>

                  <div className="flex flex-col gap-2 text-caption bg-surface p-3 rounded-xl">
                    <div className="flex items-center gap-2">
                      <User className="h-3.5 w-3.5 text-text-secondary" />
                      <span>Owner: <span className="font-semibold text-text-primary">{cafe.owner?.fullName || 'Partner Applicant'}</span></span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Store className="h-3.5 w-3.5 text-text-secondary" />
                      <span>Capacity: <span className="font-semibold text-text-primary">{cafe.totalSeats || 20} Stations</span></span>
                    </div>
                  </div>

                  {cafe.description && (
                    <p className="text-caption text-text-secondary line-clamp-2">{cafe.description}</p>
                  )}

                  {/* Inline Action Buttons */}
                  <div className="flex items-center justify-end gap-3 border-t border-border pt-3">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setSelectedCafe(cafe);
                        setIsRejectModalOpen(true);
                      }}
                      className="text-error border-error/30 hover:bg-error/10"
                    >
                      Reject
                    </Button>

                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => approveMutation.mutate(cafe.id)}
                      isLoading={approveMutation.isPending}
                      loadingText="Approving..."
                      className="gap-1.5 shadow-card"
                    >
                      <CheckCircle2 className="h-4 w-4" />
                      <span>Approve Café</span>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>

      {/* Reject Modal with Reason */}
      <Modal
        isOpen={isRejectModalOpen}
        onClose={() => setIsRejectModalOpen(false)}
        title="Reject Application"
        description={`Specify rejection reason for ${selectedCafe?.name}.`}
        footer={
          <div className="flex items-center justify-end gap-3">
            <Button variant="ghost" onClick={() => setIsRejectModalOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              isLoading={rejectMutation.isPending}
              loadingText="Rejecting..."
              onClick={() => {
                if (selectedCafe) {
                  rejectMutation.mutate({
                    cafeId: selectedCafe.id,
                    reason: rejectionReason || 'Information incomplete',
                  });
                }
              }}
            >
              Confirm Rejection
            </Button>
          </div>
        }
      >
        <div className="flex flex-col gap-3">
          <Textarea
            label="Rejection Reason *"
            placeholder="e.g. Address could not be verified / missing phone contact..."
            value={rejectionReason}
            onChange={(e) => setRejectionReason(e.target.value)}
            required
          />
        </div>
      </Modal>
    </div>
  );
}
