'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import {
  ShieldCheck,
  CheckCircle2,
  XCircle,
  Clock,
  Store,
  MapPin,
  User,
  AlertCircle,
  Ban,
  IndianRupee,
  Hourglass,
  LifeBuoy,
  Landmark,
} from 'lucide-react';
import { listPendingCafes, verifyCafe, getAdminAnalytics, getAdminActionItems } from '@/lib/api/admin';
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

  // "Needs attention" aggregate — failed transfers, failed refunds, stuck
  // payments, open tickets, pending KYC — the things Payments/Payouts/Support
  // would otherwise require separately checking to notice.
  const { data: actionItems } = useQuery({
    queryKey: [...queryKeys.admin.all, 'actionItems'],
    queryFn: getAdminActionItems,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  const actionCards = actionItems
    ? [
        { label: 'Failed Route transfers', value: actionItems.failedRouteTransfers, href: '/admin/payouts', icon: Ban, critical: true, tooltip: 'Payout transfers to café owners that failed and need manual retry' },
        { label: 'Failed refunds', value: actionItems.failedRefunds, href: '/admin/payments', icon: IndianRupee, critical: true, tooltip: 'Refund API calls that failed — the customer was not actually refunded' },
        { label: 'Stuck pending payments', value: actionItems.stuckPendingPayments, href: '/admin/bookings', icon: Hourglass, critical: false, tooltip: 'Bookings stuck in PENDING_PAYMENT for over 20 minutes — likely abandoned checkouts' },
        { label: 'Open support tickets', value: actionItems.openSupportTickets, href: '/admin/support', icon: LifeBuoy, critical: false, tooltip: 'Customer support tickets awaiting a response' },
        { label: 'Owner KYC pending', value: actionItems.ownersKycPending, href: '/admin/payouts', icon: Landmark, critical: false, tooltip: "Café owners who haven't completed Razorpay payout KYC yet" },
      ]
    : [];
  const hasUrgentItems = actionCards.some((c) => c.critical && c.value > 0);

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
            value={formatCurrencyCompact(analytics.totalRevenueAllTime || 0)}
            subtext="Platform booking volume"
          />
          <StatCard
            label="Pending Queue"
            value={pendingCafes.length}
            subtext="Awaiting admin review"
          />
        </div>
      )}

      {/* Needs Attention — the one place these otherwise-separate signals surface together */}
      {actionItems && (
        <section className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <AlertCircle className={`h-4 w-4 ${hasUrgentItems ? 'text-error' : 'text-text-tertiary'}`} />
            <h2 className="font-heading text-h3 text-text-primary">Needs Attention</h2>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {actionCards.map((item) => (
              <Link
                key={item.label}
                href={item.href}
                title={item.tooltip}
                className={`flex flex-col gap-2 rounded-2xl border p-4 transition-colors hover:bg-surface-hover ${
                  item.critical && item.value > 0
                    ? 'border-error/30 bg-error/5'
                    : 'border-border bg-surface'
                }`}
              >
                <div className="flex items-center justify-between">
                  <item.icon className={`h-4 w-4 ${item.critical && item.value > 0 ? 'text-error' : 'text-text-tertiary'}`} />
                  {item.critical && item.value > 0 && (
                    <span className="h-1.5 w-1.5 rounded-full bg-error animate-pulse" />
                  )}
                </div>
                <span className={`text-h2 font-heading font-bold ${item.critical && item.value > 0 ? 'text-error' : 'text-text-primary'}`}>
                  {item.value}
                </span>
                <span className="text-caption text-text-secondary leading-snug">{item.label}</span>
              </Link>
            ))}
          </div>
        </section>
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

                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSelectedCafe(cafe)}
                    className="text-caption"
                  >
                    View Full Details →
                  </Button>

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

      {/* Full Details Modal */}
      <Modal
        isOpen={!!selectedCafe && !isRejectModalOpen}
        onClose={() => setSelectedCafe(null)}
        title={`Application Details: ${selectedCafe?.name}`}
        description="Full onboarding information for verification review."
      >
        <div className="flex flex-col gap-4 max-h-[60vh] overflow-y-auto">
          <div className="p-3 rounded-xl bg-surface-hover">
            <h4 className="font-semibold text-caption mb-2">Business Identity</h4>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div><span className="text-text-tertiary">Address:</span> {selectedCafe?.addressLine1}, {selectedCafe?.city}</div>
              <div><span className="text-text-tertiary">Pincode:</span> {selectedCafe?.pincode}</div>
              <div><span className="text-text-tertiary">Phone:</span> {selectedCafe?.phoneNumber}</div>
              <div><span className="text-text-tertiary">Email:</span> {selectedCafe?.email || 'Not provided'}</div>
            </div>
          </div>
          
          <div className="p-3 rounded-xl bg-surface-hover">
            <h4 className="font-semibold text-caption mb-2">Verification Documents</h4>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div><span className="text-text-tertiary">Business PAN:</span> {selectedCafe?.businessPan || 'Not provided'}</div>
              <div><span className="text-text-tertiary">GSTIN:</span> {selectedCafe?.gstin || 'Not provided'}</div>
              <div className="col-span-2">
                <span className="text-text-tertiary">Legal Doc:</span>{' '}
                {selectedCafe?.legalDocumentUrl ? (
                  <a href={selectedCafe.legalDocumentUrl} target="_blank" rel="noopener noreferrer" className="text-primary underline">View Document</a>
                ) : 'Not provided'}
              </div>
            </div>
          </div>
          
          <div className="p-3 rounded-xl bg-surface-hover">
            <h4 className="font-semibold text-caption mb-2">Payout Account</h4>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div><span className="text-text-tertiary">Account Holder:</span> {selectedCafe?.accountHolderName || 'Not provided'}</div>
              <div><span className="text-text-tertiary">Account #:</span> {selectedCafe?.bankAccountNumber ? `••••${selectedCafe.bankAccountNumber.slice(-4)}` : 'Not provided'}</div>
              <div><span className="text-text-tertiary">IFSC:</span> {selectedCafe?.bankIfsc || 'Not provided'}</div>
            </div>
          </div>
          
          {selectedCafe?.draftData?.hardwareTiers && (
            <div className="p-3 rounded-xl bg-surface-hover">
              <h4 className="font-semibold text-caption mb-2">Hardware Tiers</h4>
              <div className="flex flex-col gap-1 text-xs">
                {selectedCafe.draftData.hardwareTiers.map((tier: any, idx: number) => (
                  <div key={idx} className="flex justify-between">
                    <span>{tier.name}</span>
                    <span className="text-text-tertiary">{tier.gpu} • ₹{tier.hourlyRate}/hr • {tier.totalSeats} seats</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        
        <div className="flex items-center justify-end gap-3 pt-4 border-t border-border">
          <Button variant="ghost" onClick={() => setSelectedCafe(null)}>Close</Button>
          <Button variant="primary" onClick={() => { if (selectedCafe) approveMutation.mutate(selectedCafe.id); }}>Approve Café</Button>
        </div>
      </Modal>
    </div>
  );
}
