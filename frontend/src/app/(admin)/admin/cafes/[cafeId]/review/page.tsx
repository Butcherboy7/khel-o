'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import {
  ArrowLeft,
  ShieldCheck,
  CheckCircle2,
  MapPin,
  ExternalLink,
  FileText,
} from 'lucide-react';
import { getAdminCafe, verifyCafe } from '@/lib/api/admin';
import { queryKeys } from '@/hooks/queries/keys';
import {
  Button,
  Badge,
  Modal,
  Textarea,
  SkeletonCard,
  ErrorState,
} from '@/components/ui';
import { PHOTO_CATEGORIES } from '@/constants/photoCategories';
import { PLATFORMS } from '@/constants/platforms';

export default function AdminCafeReviewPage() {
  const { cafeId } = useParams<{ cafeId: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [isRejectModalOpen, setIsRejectModalOpen] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');
  const [isChangesModalOpen, setIsChangesModalOpen] = useState(false);
  const [changesNote, setChangesNote] = useState('');

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['admin', 'cafe', cafeId],
    queryFn: () => getAdminCafe(cafeId),
    enabled: !!cafeId,
  });
  const cafe = data?.cafe;
  const owner = data?.owner;

  const goBackToQueue = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.admin.all });
    router.push('/admin/verification-queue');
  };

  const approveMutation = useMutation({
    mutationFn: () => verifyCafe(cafeId, { status: 'verified' }),
    onSuccess: goBackToQueue,
  });

  const rejectMutation = useMutation({
    mutationFn: (reason: string) => verifyCafe(cafeId, { status: 'rejected', reason }),
    onSuccess: goBackToQueue,
  });

  const requestChangesMutation = useMutation({
    mutationFn: (reason: string) => verifyCafe(cafeId, { status: 'changes_requested', reason }),
    onSuccess: goBackToQueue,
  });

  return (
    <div className="flex flex-col gap-6 pb-16 max-w-4xl mx-auto">
      <div className="flex items-center gap-2">
        <Link
          href="/admin/verification-queue"
          className="flex items-center gap-1.5 text-caption text-text-secondary hover:text-text-primary transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Queue
        </Link>
      </div>

      {isLoading && (
        <div className="flex flex-col gap-4">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
      )}

      {isError && (
        <ErrorState
          title="Failed to load application"
          message={(error as Error)?.message || 'Could not retrieve this café application.'}
          onRetry={() => refetch()}
        />
      )}

      {cafe && (
        <>
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <ShieldCheck className="h-5 w-5 text-primary" />
                <h1 className="font-heading text-h1 text-text-primary">{cafe.name}</h1>
              </div>
              <div className="flex items-center gap-1 text-caption text-text-secondary">
                <MapPin className="h-3.5 w-3.5 text-primary" />
                <span>{cafe.addressLine1}{cafe.addressLine2 ? `, ${cafe.addressLine2}` : ''}, {cafe.city}, {cafe.state} {cafe.pincode}</span>
              </div>
            </div>
            <Badge variant="warning">{cafe.verificationStatus.replace('_', ' ')}</Badge>
          </div>

          <section className="p-5 rounded-2xl border border-border bg-surface flex flex-col gap-3">
            <h2 className="font-heading text-h3 text-text-primary">Business Identity</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-body">
              <Field label="Owner" value={owner?.fullName} />
              <Field label="Owner Email" value={owner?.email} />
              <Field label="Phone" value={cafe.phoneNumber} />
              <Field label="Café Email" value={cafe.email} />
              <Field label="Hours" value={cafe.openingTime && cafe.closingTime ? `${cafe.openingTime} – ${cafe.closingTime}` : null} />
              <Field label="Total Seats" value={cafe.totalSeats} />
              <div className="sm:col-span-2">
                <span className="text-caption text-text-tertiary block mb-0.5">Maps Link</span>
                {cafe.googleMapsUrl ? (
                  <a href={cafe.googleMapsUrl} target="_blank" rel="noopener noreferrer" className="text-primary underline inline-flex items-center gap-1">
                    Open in Maps <ExternalLink className="h-3 w-3" />
                  </a>
                ) : <span className="text-text-tertiary">Not provided</span>}
              </div>
              {cafe.description && (
                <div className="sm:col-span-2">
                  <span className="text-caption text-text-tertiary block mb-0.5">Description</span>
                  <p className="text-text-primary">{cafe.description}</p>
                </div>
              )}
              {cafe.amenities.length > 0 && (
                <div className="sm:col-span-2">
                  <span className="text-caption text-text-tertiary block mb-1">Amenities</span>
                  <div className="flex flex-wrap gap-1.5">
                    {cafe.amenities.map((a) => <Badge key={a} variant="default" size="sm">{a}</Badge>)}
                  </div>
                </div>
              )}
            </div>
          </section>

          <section className="p-5 rounded-2xl border border-border bg-surface flex flex-col gap-3">
            <h2 className="font-heading text-h3 text-text-primary">Verification Documents</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-body">
              <Field label="Business PAN" value={cafe.businessPan} />
              <Field label="GSTIN" value={cafe.gstin} />
              <div className="sm:col-span-2">
                <span className="text-caption text-text-tertiary block mb-0.5">Legal Document</span>
                {cafe.legalDocumentUrl ? (
                  <a href={cafe.legalDocumentUrl} target="_blank" rel="noopener noreferrer" className="text-primary underline inline-flex items-center gap-1">
                    <FileText className="h-3.5 w-3.5" /> View full document <ExternalLink className="h-3 w-3" />
                  </a>
                ) : <span className="text-text-tertiary">Not provided</span>}
              </div>
            </div>
          </section>

          <section className="p-5 rounded-2xl border border-border bg-surface flex flex-col gap-3">
            <h2 className="font-heading text-h3 text-text-primary">Payout Destination</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-body">
              <Field label="UPI ID" value={cafe.upiVpa} />
              <Field label="Account Holder" value={cafe.accountHolderName} />
              <Field label="Account Number" value={cafe.bankAccountNumber ? `••••${cafe.bankAccountNumber.slice(-4)}` : null} />
              <Field label="IFSC" value={cafe.bankIfsc} />
            </div>
          </section>

          {cafe.tiers.length > 0 && (
            <section className="p-5 rounded-2xl border border-border bg-surface flex flex-col gap-3">
              <h2 className="font-heading text-h3 text-text-primary">Resources & Pricing</h2>
              <div className="flex flex-col gap-2">
                {cafe.tiers.map((tier) => (
                  <div key={tier.id} className="flex items-center justify-between gap-3 p-3 rounded-xl bg-surface-hover text-body">
                    <span className="font-semibold text-text-primary">
                      {tier.name}
                      {tier.tierType === 'activity' && tier.activityKind ? ` (${tier.activityKind})` : ''}
                      <span className="text-text-secondary font-normal">
                        {' '}· {tier.trackingMode === 'individual' ? 'Individually tracked' : 'Pooled'}
                      </span>
                    </span>
                    <span className="text-text-secondary text-right">
                      {tier.platform ? `${PLATFORMS.find((p) => p.value === tier.platform)?.label ?? tier.platform} · ` : ''}
                      ₹{tier.pricePerHour}/hr · {tier.appBookableSeats}/{tier.totalSeats} bookable seats
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {cafe.photos.length > 0 && (
            <section className="p-5 rounded-2xl border border-border bg-surface flex flex-col gap-4">
              <h2 className="font-heading text-h3 text-text-primary">Photos</h2>
              {PHOTO_CATEGORIES.map(({ value, label }) => {
                const categoryPhotos = cafe.photos.filter((p) => p.category === value);
                if (categoryPhotos.length === 0) return null;
                return (
                  <div key={value}>
                    <p className="text-overline text-text-tertiary mb-2">{label}</p>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      {categoryPhotos.map((photo) => (
                        <a
                          key={photo.url}
                          href={photo.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          title="Open full size in a new tab"
                          className="group relative block"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={photo.url}
                            alt={`${label} photo`}
                            className="aspect-square w-full rounded-xl object-cover border border-border group-hover:opacity-90 transition-opacity"
                            loading="lazy"
                          />
                          <span className="absolute inset-0 flex items-center justify-center rounded-xl bg-black/0 group-hover:bg-black/30 transition-colors">
                            <ExternalLink className="h-5 w-5 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                          </span>
                        </a>
                      ))}
                    </div>
                  </div>
                );
              })}
            </section>
          )}

          {cafe.menuPhotos.length > 0 && (
            <section className="p-5 rounded-2xl border border-border bg-surface flex flex-col gap-3">
              <h2 className="font-heading text-h3 text-text-primary">Menu</h2>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {cafe.menuPhotos.map((url) => (
                  <a key={url} href={url} target="_blank" rel="noopener noreferrer" title="Open full size in a new tab" className="group relative block">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={url} alt="Menu photo" className="aspect-square w-full rounded-xl object-cover border border-border group-hover:opacity-90 transition-opacity" loading="lazy" />
                    <span className="absolute inset-0 flex items-center justify-center rounded-xl bg-black/0 group-hover:bg-black/30 transition-colors">
                      <ExternalLink className="h-5 w-5 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                    </span>
                  </a>
                ))}
              </div>
            </section>
          )}

          {cafe.supportedGames && Object.keys(cafe.supportedGames).length > 0 && (
            <section className="p-5 rounded-2xl border border-border bg-surface flex flex-col gap-3">
              <h2 className="font-heading text-h3 text-text-primary">Games</h2>
              <div className="flex flex-col gap-3">
                {Object.entries(cafe.supportedGames)
                  .filter(([, games]) => games.length > 0)
                  .map(([platform, games]) => (
                    <div key={platform}>
                      <p className="text-overline text-text-tertiary mb-1.5">
                        {PLATFORMS.find((p) => p.value === platform)?.label || platform}
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {games.map((game) => <Badge key={game} variant="default" size="sm">{game}</Badge>)}
                      </div>
                    </div>
                  ))}
              </div>
            </section>
          )}

          {/* Sticky action bar */}
          <div className="sticky bottom-0 flex items-center justify-end gap-3 border-t border-border bg-surface p-4 rounded-2xl shadow-card">
            <Button variant="secondary" onClick={() => setIsChangesModalOpen(true)}>
              Request Changes
            </Button>
            <Button variant="destructive-outline" onClick={() => setIsRejectModalOpen(true)}>
              Reject
            </Button>
            <Button
              variant="primary"
              onClick={() => approveMutation.mutate()}
              isLoading={approveMutation.isPending}
              loadingText="Approving..."
              className="gap-1.5"
            >
              <CheckCircle2 className="h-4 w-4" />
              Approve Café
            </Button>
          </div>
        </>
      )}

      <Modal
        isOpen={isRejectModalOpen}
        onClose={() => setIsRejectModalOpen(false)}
        title="Reject Application"
        description={`Specify rejection reason for ${cafe?.name}.`}
        footer={
          <div className="flex items-center justify-end gap-3">
            <Button variant="ghost" onClick={() => setIsRejectModalOpen(false)}>Cancel</Button>
            <Button
              variant="destructive"
              isLoading={rejectMutation.isPending}
              loadingText="Rejecting..."
              onClick={() => rejectMutation.mutate(rejectionReason || 'Information incomplete')}
            >
              Confirm Rejection
            </Button>
          </div>
        }
      >
        <Textarea
          label="Rejection Reason *"
          placeholder="e.g. Address could not be verified / missing phone contact..."
          value={rejectionReason}
          onChange={(e) => setRejectionReason(e.target.value)}
          required
        />
      </Modal>

      <Modal
        isOpen={isChangesModalOpen}
        onClose={() => setIsChangesModalOpen(false)}
        title="Request Changes"
        description={`Tell ${cafe?.name} what needs to change before approval.`}
        footer={
          <div className="flex items-center justify-end gap-3">
            <Button variant="ghost" onClick={() => setIsChangesModalOpen(false)}>Cancel</Button>
            <Button
              variant="primary"
              isLoading={requestChangesMutation.isPending}
              loadingText="Sending..."
              disabled={!changesNote.trim()}
              onClick={() => requestChangesMutation.mutate(changesNote)}
            >
              Send to Owner
            </Button>
          </div>
        }
      >
        <Textarea
          label="What needs to change? *"
          placeholder="e.g. Please upload a clearer exterior photo / GSTIN doesn't match business name..."
          value={changesNote}
          onChange={(e) => setChangesNote(e.target.value)}
          required
        />
      </Modal>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string | number | null | undefined }) {
  return (
    <div>
      <span className="text-caption text-text-tertiary block mb-0.5">{label}</span>
      <span className="text-text-primary font-medium">{value || value === 0 ? value : 'Not provided'}</span>
    </div>
  );
}
