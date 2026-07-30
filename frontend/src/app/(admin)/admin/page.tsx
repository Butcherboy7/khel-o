'use client';

import React, { useState, useMemo } from 'react';
import Image from 'next/image';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Shield,
  User,
  MapPin,
  Phone,
  Mail,
  Clock,
  Users,
  CheckCircle2,
  XCircle,
  Ban,
  AlertTriangle,
  Loader2,
} from 'lucide-react';
import { getPendingCafes, verifyCafe } from '@/lib/api';
import { AdminCafe } from '@/types';
import { formatDateLong } from '@/lib/format';

const getStatusBadge = (status: string) => {
  switch (status) {
    case 'verified':
      return {
        label: 'Verified',
        className: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      };
    case 'pending':
      return {
        label: 'Pending',
        className: 'bg-amber-50 text-amber-700 border-amber-200',
      };
    case 'rejected':
      return {
        label: 'Rejected',
        className: 'bg-red-50 text-red-700 border-red-200',
      };
    case 'suspended':
      return {
        label: 'Suspended',
        className: 'bg-red-50 text-red-700 border-red-200',
      };
    default:
      return {
        label: status,
        className: 'bg-gray-100 text-gray-700 border-gray-200',
      };
  }
};

function SkeletonRow() {
  return (
    <div className="mx-4 card-base h-48 animate-pulse mb-4 bg-card border border-border rounded-2xl" />
  );
}

export default function AdminPage() {
  const queryClient = useQueryClient();

  // Tabs states
  const [activeTab, setActiveTab] = useState<'pending' | 'all'>('pending');

  // Mutation and status tracking states
  const [actioningId, setActioningId] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [suspendingId, setSuspendingId] = useState<string | null>(null);
  const [reevaluatingId, setReevaluatingId] = useState<string | null>(null);

  // Fetch admin panel pending cafés
  const {
    data: cafesList,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ['adminCafes'],
    queryFn: getPendingCafes,
    staleTime: 30_000,
    retry: 1,
  });

  const cafes = cafesList || [];

  // Verification modification mutation
  const verifyMutation = useMutation({
    mutationFn: ({
      cafeId,
      status,
      reason,
    }: {
      cafeId: string;
      status: 'verified' | 'rejected' | 'suspended';
      reason: string | null;
    }) => verifyCafe(cafeId, status, reason),
    onMutate: ({ cafeId }) => {
      setActioningId(cafeId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['adminCafes'] });
      // Reset statuses
      setRejectingId(null);
      setSuspendingId(null);
      setReevaluatingId(null);
      setRejectionReason('');
    },
    onSettled: () => {
      setActioningId(null);
    },
  });

  // Filter list
  const filteredCafes = useMemo(() => {
    if (activeTab === 'pending') {
      return cafes.filter((c) => c.verificationStatus === 'pending');
    }
    return cafes;
  }, [cafes, activeTab]);

  // Derive counts stats
  const stats = useMemo(() => {
    let pending = 0;
    let verified = 0;
    let rejected = 0;

    cafes.forEach((c) => {
      if (c.verificationStatus === 'pending') pending++;
      else if (c.verificationStatus === 'verified') verified++;
      else if (c.verificationStatus === 'rejected') rejected++;
    });

    return {
      total: cafes.length,
      pending,
      verified,
      rejected,
    };
  }, [cafes]);

  return (
    <div className="space-y-4 pb-24">
      {/* PAGE HEADER */}
      <div className="sticky top-0 z-20 bg-secondary text-white h-14 flex items-center justify-between px-4 -mx-6">
        <div className="flex items-center space-x-2">
          <Shield className="w-5 h-5 text-primary shrink-0" />
          <span className="font-heading font-semibold text-base">Admin Panel</span>
        </div>
        <span className="bg-accent text-white text-xs font-data px-2 py-0.5 rounded-full shrink-0">
          {stats.pending} pending
        </span>
      </div>

      {/* TABS SELECTOR */}
      <div className="sticky top-14 z-10 bg-card border-b border-border shadow-sm flex -mx-6 px-6">
        <button
          type="button"
          onClick={() => setActiveTab('pending')}
          className={`flex-1 py-3 text-center text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'pending'
              ? 'border-primary text-primary font-semibold'
              : 'border-transparent text-text-secondary'
          }`}
        >
          Pending ({stats.pending})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('all')}
          className={`flex-1 py-3 text-center text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'all'
              ? 'border-primary text-primary font-semibold'
              : 'border-transparent text-text-secondary'
          }`}
        >
          All Cafés ({stats.total})
        </button>
      </div>

      {/* STATS BAR */}
      <div className="grid grid-cols-4 gap-2 mx-0 pt-2">
        <div className="card-base p-2 text-center shadow-sm">
          <span className="font-data font-bold text-base text-text-primary">{stats.total}</span>
          <p className="font-body text-[10px] text-text-secondary mt-0.5">Total</p>
        </div>
        <div className="card-base p-2 text-center shadow-sm">
          <span className="font-data font-bold text-base text-warning">{stats.pending}</span>
          <p className="font-body text-[10px] text-text-secondary mt-0.5">Pending</p>
        </div>
        <div className="card-base p-2 text-center shadow-sm">
          <span className="font-data font-bold text-base text-text-technical">{stats.verified}</span>
          <p className="font-body text-[10px] text-text-secondary mt-0.5">Verified</p>
        </div>
        <div className="card-base p-2 text-center shadow-sm">
          <span className="font-data font-bold text-base text-error">{stats.rejected}</span>
          <p className="font-body text-[10px] text-text-secondary mt-0.5">Rejected</p>
        </div>
      </div>

      {/* SKELETON LOADER */}
      {isLoading && (
        <div className="space-y-4 pt-2">
          <SkeletonRow />
          <SkeletonRow />
        </div>
      )}

      {/* ERROR CONTAINER */}
      {isError && (
        <div className="bg-card border border-border rounded-2xl p-8 flex flex-col items-center justify-center text-center space-y-3 shadow-md mt-4">
          <AlertTriangle className="w-12 h-12 text-error" />
          <h3 className="font-heading font-semibold text-lg text-text-primary">
            Couldn&apos;t load cafés queue
          </h3>
          <p className="text-text-secondary text-sm">
            {error?.message || 'Failed to connect to platforms dashboard.'}
          </p>
          <button
            type="button"
            onClick={() => refetch()}
            className="btn-outline text-sm py-2 px-6 rounded-2xl"
          >
            Try Again
          </button>
        </div>
      )}

      {/* EMPTY STATES */}
      {!isLoading && !isError && filteredCafes.length === 0 && (
        <div className="card-base p-8 text-center flex flex-col items-center justify-center space-y-2 mt-4">
          <CheckCircle2 className="w-10 h-10 text-success/50" />
          <h3 className="font-heading font-semibold text-base text-text-primary">
            {activeTab === 'pending' ? 'All clear!' : 'No cafés registered yet'}
          </h3>
          <p className="text-xs text-text-secondary">
            {activeTab === 'pending'
              ? 'No cafés pending verification.'
              : 'When owners register venues, they will show here.'}
          </p>
        </div>
      )}

      {/* PENDING CAFES LIST */}
      {!isLoading && !isError && filteredCafes.length > 0 && (
        <div className="space-y-4 pt-2">
          {filteredCafes.map((c) => {
            const badge = getStatusBadge(c.verificationStatus);
            const isActioning = actioningId === c.id;
            const isRejecting = rejectingId === c.id;
            const isSuspending = suspendingId === c.id;
            const isReevaluating = reevaluatingId === c.id;

            return (
              <div
                key={c.id}
                className="card-base p-0 overflow-hidden shadow-md border border-border rounded-2xl flex flex-col"
              >
                {/* Accent bar */}
                <div
                  className={`h-1 w-full ${
                    c.verificationStatus === 'pending'
                      ? 'bg-warning'
                      : c.verificationStatus === 'verified'
                      ? 'bg-emerald-500'
                      : 'bg-error'
                  }`}
                />

                <div className="p-4 space-y-3">
                  {/* Owner Info block */}
                  <div className="bg-surface rounded-xl p-3 space-y-1">
                    <div className="flex items-center space-x-1.5 text-xs font-body text-text-primary font-semibold">
                      <User className="w-3.5 h-3.5 text-text-secondary" />
                      <span>{c.owner?.fullName || 'Owner Profile'}</span>
                    </div>
                    <div className="text-[10px] text-text-secondary font-data pl-5">
                      {c.owner?.email} {c.owner?.phoneNumber ? `· ${c.owner.phoneNumber}` : ''}
                    </div>
                  </div>

                  {/* Cafe Name & optional verification status badge for All tab */}
                  <div className="flex justify-between items-start gap-4">
                    <h3 className="font-heading font-bold text-lg text-text-primary line-clamp-1">
                      {c.name}
                    </h3>
                    {activeTab === 'all' && (
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${badge.className}`}>
                        {badge.label}
                      </span>
                    )}
                  </div>

                  {/* Location Address details */}
                  <div className="flex items-center space-x-2 text-xs text-text-secondary font-body">
                    <MapPin className="w-3.5 h-3.5 text-primary shrink-0" />
                    <span className="truncate">
                      {c.addressLine1}, {c.city}, {c.state} — <span className="font-data">{c.pincode}</span>
                    </span>
                  </div>

                  {/* Hours & Capacity stats details */}
                  <div className="flex items-center space-x-4 text-xs text-text-secondary font-data">
                    <div className="flex items-center space-x-1">
                      <Clock className="w-3.5 h-3.5 text-primary shrink-0" />
                      <span>
                        {c.openingTime?.slice(0, 5)} — {c.closingTime?.slice(0, 5)}
                      </span>
                    </div>
                    <div className="flex items-center space-x-1">
                      <Users className="w-3.5 h-3.5 text-primary shrink-0" />
                      <span>{c.totalSeats || 0} seats</span>
                    </div>
                  </div>

                  {/* Description Box */}
                  {c.description && (
                    <p className="font-body text-xs text-text-secondary bg-surface rounded-xl p-3 leading-relaxed">
                      {c.description}
                    </p>
                  )}

                  {/* Amenities list */}
                  {c.amenities && c.amenities.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {c.amenities.map((a) => (
                        <span
                          key={a}
                          className="bg-surface border border-border text-[10px] text-text-secondary rounded-full px-2 py-0.5 font-body"
                        >
                          {a}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Photos Carousel */}
                  {c.photos && c.photos.length > 0 && (
                    <div className="overflow-x-auto flex gap-2 pt-1 scrollbar-none">
                      {c.photos.map((p, idx) => (
                        <div
                          key={idx}
                          className="relative w-20 h-16 rounded-xl overflow-hidden bg-surface border border-border shrink-0"
                        >
                          <img src={p} alt={`Photo #${idx + 1}`} className="w-full h-full object-cover" />
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Submitted Date */}
                  {c.createdAt && (
                    <p className="font-body text-[10px] text-text-secondary pt-1">
                      Submitted {formatDateLong(c.createdAt.split('T')[0])}
                    </p>
                  )}

                  {/* Action buttons */}
                  {isActioning ? (
                    <div className="flex justify-center pt-2">
                      <Loader2 className="w-6 h-6 text-primary animate-spin" />
                    </div>
                  ) : activeTab === 'pending' || isReevaluating ? (
                    <div className="space-y-3 pt-2 border-t border-border mt-3">
                      {isRejecting ? (
                        <div className="space-y-2.5 animate-fade-in">
                          <textarea
                            rows={3}
                            required
                            maxLength={300}
                            value={rejectionReason}
                            onChange={(e) => setRejectionReason(e.target.value)}
                            placeholder="State the reason for rejection..."
                            className="w-full bg-card border border-error/30 rounded-2xl px-4 py-3 text-xs font-body text-text-primary focus:outline-none focus:border-error"
                          />
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                if (!rejectionReason.trim()) {
                                  alert('Rejection reason is required');
                                  return;
                                }
                                verifyMutation.mutate({
                                  cafeId: c.id,
                                  status: 'rejected',
                                  reason: rejectionReason,
                                });
                              }}
                              className="border border-red-200 text-error bg-red-50 hover:bg-red-100 rounded-full text-xs py-2 flex-1 font-semibold active:scale-95 transition-transform"
                            >
                              Confirm Reject
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setRejectingId(null);
                                setRejectionReason('');
                              }}
                              className="btn-outline text-xs py-2 flex-1 rounded-full active:scale-95 transition-transform"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : isSuspending ? (
                        <div className="space-y-2.5 animate-fade-in">
                          <p className="text-xs text-error font-semibold font-body text-center animate-pulse">
                            Confirm café suspension?
                          </p>
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() =>
                                verifyMutation.mutate({
                                  cafeId: c.id,
                                  status: 'suspended',
                                  reason: null,
                                })
                              }
                              className="border border-red-200 text-error bg-red-50 hover:bg-red-100 rounded-full text-xs py-2 flex-1 font-semibold active:scale-95 transition-transform"
                            >
                              Yes, Suspend
                            </button>
                            <button
                              type="button"
                              onClick={() => setSuspendingId(null)}
                              className="btn-outline text-xs py-2 flex-1 rounded-full active:scale-95 transition-transform"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() =>
                              verifyMutation.mutate({
                                cafeId: c.id,
                                status: 'verified',
                                reason: null,
                              })
                            }
                            className="bg-primary hover:bg-primary-dark text-white rounded-full text-xs py-2 flex-1 font-semibold flex items-center justify-center gap-1 active:scale-95 transition-transform"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>Approve</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setRejectingId(c.id)}
                            className="border border-red-200 text-error bg-red-50 hover:bg-red-100 rounded-full text-xs py-2 flex-1 font-semibold flex items-center justify-center gap-1 active:scale-95 transition-transform"
                          >
                            <XCircle className="w-3.5 h-3.5" />
                            <span>Reject</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setSuspendingId(c.id)}
                            className="border border-red-200 text-error bg-red-50 hover:bg-red-100 rounded-full text-xs py-2 flex-1 font-semibold flex items-center justify-center gap-1 active:scale-95 transition-transform"
                          >
                            <Ban className="w-3.5 h-3.5" />
                            <span>Suspend</span>
                          </button>
                        </div>
                      )}
                    </div>
                  ) : c.verificationStatus !== 'pending' ? (
                    <div className="pt-2 border-t border-border flex justify-end mt-2">
                      <button
                        type="button"
                        onClick={() => setReevaluatingId(c.id)}
                        className="btn-outline text-xs py-1 px-3 min-h-[30px] rounded-full active:scale-95 transition-transform"
                      >
                        Re-evaluate
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
