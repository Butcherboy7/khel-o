'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Zap,
  Calendar,
  Clock,
  Monitor,
  Pencil,
  Trash2,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Store,
} from 'lucide-react';
import { getOwnerCafe, listCafeTiers, listPromotions, createPromotion, updatePromotion, deletePromotion, PromotionFormData } from '@/lib/api';
import { getTodayString } from '@/lib/format';

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// Reusable Switch Component
function ToggleSwitch({
  checked,
  onChange,
  disabled = false,
}: {
  checked: boolean;
  onChange: (val: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`w-12 h-6 rounded-full transition-colors relative flex items-center shrink-0 p-0.5 focus:outline-none ${
        disabled ? 'opacity-50 pointer-events-none' : ''
      } ${checked ? 'bg-primary' : 'bg-border'}`}
    >
      <div
        className={`w-5 h-5 bg-white rounded-full shadow-md transition-transform transform ${
          checked ? 'translate-x-6' : 'translate-x-0'
        }`}
      />
    </button>
  );
}

function SkeletonRow() {
  return (
    <div className="mx-4 card-base h-32 animate-pulse mb-3 bg-card border border-border rounded-2xl" />
  );
}

const DEFAULT_PROMO_FORM = (cafeId: string): PromotionFormData => ({
  cafeId,
  title: '',
  description: '',
  discountPercentage: 20,
  applicableTierId: null,
  validFrom: getTodayString(),
  validUntil: getTodayString(),
  daysOfWeek: [1, 2, 3, 4, 5],
  startHour: 10,
  endHour: 18,
  maxUses: null,
  isActive: true,
});

export default function OwnerPromotionsPage() {
  const router = useRouter();
  const queryClient = useQueryClient();

  // local states
  const [sheetMode, setSheetMode] = useState<'none' | 'create' | 'edit'>('none');
  const [editingPromoId, setEditingPromoId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const [formData, setFormData] = useState<PromotionFormData>(DEFAULT_PROMO_FORM(''));
  const [sheetError, setSheetError] = useState<string | null>(null);
  const [successToast, setSuccessToast] = useState<string | null>(null);

  // Queries
  const { data: ownerCafe, isLoading: isCafeLoading } = useQuery({
    queryKey: ['ownerCafe'],
    queryFn: getOwnerCafe,
    staleTime: 120_000,
  });

  const cafeId = ownerCafe?.id;

  const { data: tiers, isLoading: isTiersLoading } = useQuery({
    queryKey: ['tiers', cafeId],
    queryFn: () => listCafeTiers(cafeId!),
    enabled: !!cafeId,
    staleTime: 120_000,
  });

  const {
    data: promotions,
    isLoading: isPromosLoading,
    isError: isPromosError,
    error: promosError,
    refetch: refetchPromos,
  } = useQuery({
    queryKey: ['promotions', cafeId],
    queryFn: () => listPromotions(cafeId!),
    enabled: !!cafeId,
    staleTime: 60_000,
  });

  const showSuccessToast = (msg: string) => {
    setSuccessToast(msg);
    setTimeout(() => setSuccessToast(null), 3000);
  };

  // Mutations
  const createPromoMutation = useMutation({
    mutationFn: createPromotion,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['promotions', cafeId] });
      setSheetMode('none');
      showSuccessToast('Deal created.');
    },
    onError: (err: unknown) => {
      const errObj = err as { response?: { data?: { error?: { message?: string }; detail?: string } } };
      const msg = errObj?.response?.data?.error?.message || errObj?.response?.data?.detail || 'Failed to create deal.';
      setSheetError(msg);
    },
  });

  const updatePromoMutation = useMutation({
    mutationFn: (data: Partial<PromotionFormData>) => updatePromotion(editingPromoId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['promotions', cafeId] });
      setSheetMode('none');
      showSuccessToast('Deal updated.');
    },
    onError: (err: unknown) => {
      const errObj = err as { response?: { data?: { error?: { message?: string }; detail?: string } } };
      const msg = errObj?.response?.data?.error?.message || errObj?.response?.data?.detail || 'Failed to update deal.';
      setSheetError(msg);
    },
  });

  const deletePromoMutation = useMutation({
    mutationFn: deletePromotion,
    onMutate: (id) => {
      setDeletingId(id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['promotions', cafeId] });
      showSuccessToast('Deal deleted.');
    },
    onSettled: () => {
      setDeletingId(null);
      setConfirmDeleteId(null);
    },
  });

  const toggleActiveMutation = useMutation({
    mutationFn: ({ promoId, isActive }: { promoId: string; isActive: boolean }) =>
      updatePromotion(promoId, { isActive }),
    onMutate: ({ promoId }) => {
      setTogglingId(promoId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['promotions', cafeId] });
    },
    onSettled: () => {
      setTogglingId(null);
    },
  });

  // Pre-fill form
  useEffect(() => {
    if (cafeId) {
      if (sheetMode === 'edit' && editingPromoId && promotions) {
        const promo = promotions.find((p) => p.id === editingPromoId);
        if (promo) {
          setFormData({
            cafeId: promo.cafeId,
            title: promo.title,
            description: promo.description || '',
            discountPercentage: promo.discountPercentage,
            applicableTierId: promo.applicableTierId || null,
            validFrom: promo.validFrom,
            validUntil: promo.validUntil,
            daysOfWeek: promo.daysOfWeek,
            startHour: promo.startHour,
            endHour: promo.endHour,
            maxUses: promo.maxUses || null,
            isActive: promo.isActive,
          });
        }
      } else if (sheetMode === 'create') {
        setFormData(DEFAULT_PROMO_FORM(cafeId));
      }
      setSheetError(null);
    }
  }, [sheetMode, editingPromoId, promotions, cafeId]);

  // Form submission validation
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSheetError(null);

    if (!formData.title.trim()) {
      setSheetError('Title is required');
      return;
    }
    if (formData.discountPercentage < 1 || formData.discountPercentage > 50) {
      setSheetError('Discount must be between 1% and 50%');
      return;
    }
    if (formData.daysOfWeek.length === 0) {
      setSheetError('Select at least 1 day for the deal');
      return;
    }
    if (formData.validUntil < formData.validFrom) {
      setSheetError('End date must be after start date');
      return;
    }
    if (formData.endHour <= formData.startHour) {
      setSheetError('End hour must be after start hour');
      return;
    }

    if (sheetMode === 'edit') {
      updatePromoMutation.mutate(formData);
    } else {
      createPromoMutation.mutate(formData);
    }
  };

  // Toggle index in day array
  const toggleDay = (dayIndex: number) => {
    setFormData((prev) => {
      const active = prev.daysOfWeek.includes(dayIndex)
        ? prev.daysOfWeek.filter((d) => d !== dayIndex)
        : [...prev.daysOfWeek, dayIndex];
      return { ...prev, daysOfWeek: active.sort() };
    });
  };

  // Delete automatic timeout trigger
  useEffect(() => {
    if (confirmDeleteId) {
      const t = setTimeout(() => {
        setConfirmDeleteId(null);
      }, 5000);
      return () => clearTimeout(t);
    }
  }, [confirmDeleteId]);

  const isSubmitting = createPromoMutation.isPending || updatePromoMutation.isPending;

  if (isCafeLoading || (cafeId && (isTiersLoading || isPromosLoading))) {
    return (
      <div className="space-y-4 pb-24">
        <div className="h-14 bg-surface rounded w-full" />
        <div className="space-y-3 pt-2">
          <SkeletonRow />
          <SkeletonRow />
          <SkeletonRow />
        </div>
      </div>
    );
  }

  // Cafe Profile check warning
  if (!ownerCafe) {
    return (
      <div className="mx-4 mt-8 card-base p-6 flex flex-col items-center gap-3 text-center shadow-md">
        <Store className="w-12 h-12 text-text-secondary/30" />
        <h3 className="font-heading font-semibold text-lg text-text-primary">
          Set up your café first
        </h3>
        <p className="font-body text-xs text-text-secondary leading-relaxed">
          You need to create your café profile before configuring promotions.
        </p>
        <button
          type="button"
          onClick={() => router.push('/owner/cafe')}
          className="btn-primary mt-2 text-xs py-2 px-5"
        >
          Go to Café Profile
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-24 relative">
      {/* TOAST NOTIFICATION */}
      {successToast && (
        <div className="fixed top-16 left-0 right-0 z-30 px-4 animate-fade-in">
          <div className="bg-success/10 border border-success/20 rounded-2xl mx-4 p-3 flex items-center gap-2 shadow-md">
            <CheckCircle2 className="w-5 h-5 text-success shrink-0" />
            <span className="font-body text-sm text-text-primary">{successToast}</span>
          </div>
        </div>
      )}

      {/* STICKY TOP APP BAR */}
      <div className="sticky top-0 z-20 bg-card border-b border-border shadow-sm h-14 flex items-center justify-between px-4 -mx-4">
        <button
          type="button"
          onClick={() => router.push('/owner/dashboard')}
          className="p-2 hover:bg-surface rounded-full transition-colors text-text-secondary"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <span className="font-heading font-semibold text-base text-text-primary">
          Promotions
        </span>
        <button
          type="button"
          onClick={() => setSheetMode('create')}
          className="btn-primary text-xs px-3 py-1.5 min-h-[32px] rounded-full flex items-center gap-1"
        >
          <Zap className="w-3.5 h-3.5" />
          <span>New Deal</span>
        </button>
      </div>

      {/* ERROR STATE */}
      {isPromosError && (
        <div className="bg-card border border-border rounded-2xl p-8 flex flex-col items-center justify-center text-center space-y-3 shadow-md mx-4 mt-4">
          <AlertTriangle className="w-12 h-12 text-error" />
          <h3 className="font-heading font-semibold text-lg text-text-primary">
            Couldn&apos;t load promotions
          </h3>
          <p className="text-text-secondary text-sm">
            {promosError?.message || 'Failed to fetch deals details.'}
          </p>
          <button
            type="button"
            onClick={() => refetchPromos()}
            className="btn-outline text-sm py-2 px-6 rounded-2xl"
          >
            Try Again
          </button>
        </div>
      )}

      {/* EMPTY STATE */}
      {!isPromosError && promotions?.length === 0 && (
        <div className="mx-4 mt-4 card-base p-8 text-center flex flex-col items-center gap-3 shadow-sm">
          <Zap className="w-10 h-10 text-text-secondary/30" />
          <h3 className="font-heading font-semibold text-base text-text-primary">
            No promotions yet
          </h3>
          <p className="text-xs text-text-secondary leading-relaxed max-w-[240px]">
            Create flash deals to attract gamers during off-peak hours.
          </p>
          <button
            type="button"
            onClick={() => setSheetMode('create')}
            className="btn-primary mt-2 text-xs py-2 px-5 min-h-[36px]"
          >
            Create First Deal
          </button>
        </div>
      )}

      {/* PROMOTIONS LIST */}
      {!isPromosError && promotions && promotions.length > 0 && (
        <div className="space-y-3">
          {promotions.map((p) => {
            const isToggling = togglingId === p.id;
            const isDeleting = deletingId === p.id;
            const activeDays = p.daysOfWeek.map((d) => DAY_LABELS[d]).join(', ');
            const matchedTier = tiers?.find((t) => t.id === p.applicableTierId);

            return (
              <div
                key={p.id}
                className="mx-4 card-base p-4 flex flex-col gap-3 shadow-sm"
              >
                {/* Title & Toggle */}
                <div className="flex justify-between items-start gap-4">
                  <div className="flex items-start space-x-2">
                    <Zap className="w-4 h-4 text-primary shrink-0 mt-1 animate-pulse" />
                    <h3 className="font-heading font-semibold text-base text-text-primary line-clamp-1">
                      {p.title}
                    </h3>
                  </div>
                  <div className={isToggling ? 'opacity-50 pointer-events-none' : ''}>
                    <ToggleSwitch
                      checked={p.isActive}
                      onChange={(activeVal) =>
                        toggleActiveMutation.mutate({ promoId: p.id, isActive: activeVal })
                      }
                    />
                  </div>
                </div>

                {/* Badges */}
                <div className="flex items-center gap-2">
                  <span className="bg-primary text-white font-data font-bold text-xs px-2.5 py-0.5 rounded-full">
                    {p.discountPercentage}% OFF
                  </span>
                  <span className="text-text-secondary text-xs font-data">
                    {p.currentUses} / {p.maxUses ? p.maxUses : '∞'} uses
                  </span>
                </div>

                {/* Row 3: Validity Dates */}
                <div className="flex items-center space-x-2 text-xs text-text-secondary">
                  <Calendar className="w-3.5 h-3.5 text-primary shrink-0" />
                  <span className="font-data">
                    {p.validFrom} to {p.validUntil}
                  </span>
                </div>

                {/* Row 4: Active Days & Hours */}
                <div className="flex items-center space-x-2 text-xs text-text-secondary">
                  <Clock className="w-3.5 h-3.5 text-primary shrink-0" />
                  <span>
                    {activeDays} · <span className="font-data">{p.startHour}:00 — {p.endHour}:00</span>
                  </span>
                </div>

                {/* Row 5: Applicable Tier */}
                <div className="flex items-center space-x-2 text-xs text-text-secondary">
                  <Monitor className="w-3.5 h-3.5 text-primary shrink-0" />
                  <span>{matchedTier ? matchedTier.name : 'All tiers'}</span>
                </div>

                {/* Edit & Delete actions */}
                <div className="pt-2 border-t border-border flex items-center justify-end mt-1">
                  {confirmDeleteId === p.id ? (
                    <div className="flex items-center space-x-3">
                      <span className="text-xs text-error font-semibold font-body animate-pulse">
                        Confirm delete?
                      </span>
                      <button
                        type="button"
                        disabled={isDeleting}
                        onClick={() => deletePromoMutation.mutate(p.id)}
                        className="border border-red-200 text-error bg-red-50 hover:bg-red-100 rounded-full text-xs py-1.5 px-3 min-h-[30px] font-semibold flex items-center gap-1 active:scale-95 transition-transform"
                      >
                        {isDeleting ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <span>Yes, Delete</span>
                        )}
                      </button>
                      <button
                        type="button"
                        disabled={isDeleting}
                        onClick={() => setConfirmDeleteId(null)}
                        className="btn-outline text-xs py-1.5 px-3 min-h-[30px] rounded-full active:scale-95 transition-transform"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingPromoId(p.id);
                          setSheetMode('edit');
                        }}
                        className="btn-outline text-xs py-1 px-3 min-h-[30px] rounded-full flex items-center gap-1 active:scale-95 transition-transform"
                      >
                        <Pencil className="w-3 h-3 text-primary" />
                        <span>Edit</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteId(p.id)}
                        className="border border-red-100 text-error bg-red-50 hover:bg-red-100 rounded-full text-xs py-1 px-3 min-h-[30px] flex items-center gap-1 active:scale-95 transition-transform"
                      >
                        <Trash2 className="w-3 h-3" />
                        <span>Delete</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* BOTTOM SHEET DEAL PANEL */}
      {sheetMode !== 'none' && (
        <div
          onClick={() => setSheetMode('none')}
          className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm flex items-end justify-center animate-fade-in"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md bg-card rounded-t-3xl max-h-[90vh] overflow-y-auto z-50 shadow-2xl flex flex-col animate-slide-up"
          >
            {/* Drag Handle */}
            <div className="w-12 h-1 bg-border rounded-full mx-auto mt-3 mb-4 shrink-0" />

            {/* Title */}
            <div className="px-4 pb-2 border-b border-border">
              <h2 className="font-heading font-bold text-lg text-text-primary">
                {sheetMode === 'create' ? 'Create Flash Promotion' : 'Edit Promotion'}
              </h2>
            </div>

            {/* Error inside sheet */}
            {sheetError && (
              <div className="mx-4 mt-3 rounded-2xl border border-error/20 bg-error/10 p-3 flex items-center gap-2 text-xs text-text-primary font-body animate-fade-in">
                <AlertTriangle className="w-4 h-4 text-error shrink-0" />
                <span>{sheetError}</span>
              </div>
            )}

            {/* Form */}
            <form onSubmit={handleSubmit} className="p-4 space-y-4 flex-1">
              <div className="space-y-1">
                <label className="block text-xs font-semibold text-text-secondary">Title *</label>
                <input
                  type="text"
                  required
                  maxLength={80}
                  value={formData.title}
                  onChange={(e) => setFormData((prev) => ({ ...prev, title: e.target.value }))}
                  placeholder="e.g., Weekday Morning Happy Hours"
                  className="w-full bg-card border border-border rounded-2xl px-4 py-3 text-sm font-body text-text-primary focus:outline-none focus:border-primary"
                />
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-semibold text-text-secondary">Description</label>
                <textarea
                  rows={2}
                  maxLength={300}
                  value={formData.description}
                  onChange={(e) => setFormData((prev) => ({ ...prev, description: e.target.value }))}
                  placeholder="Brief deal details..."
                  className="w-full bg-card border border-border rounded-2xl px-4 py-3 text-sm font-body text-text-primary focus:outline-none focus:border-primary"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="block text-xs font-semibold text-text-secondary">Discount Percentage *</label>
                  <div className="relative flex items-center">
                    <input
                      type="number"
                      required
                      min={1}
                      max={50}
                      value={formData.discountPercentage || ''}
                      onChange={(e) => {
                        const val = parseInt(e.target.value, 10);
                        setFormData((prev) => ({ ...prev, discountPercentage: isNaN(val) ? 0 : val }));
                      }}
                      placeholder="20"
                      className="w-full bg-card border border-border rounded-2xl pl-4 pr-8 py-3 text-sm font-data text-text-primary focus:outline-none focus:border-primary"
                    />
                    <span className="absolute right-4 text-text-secondary text-sm font-body">%</span>
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="block text-xs font-semibold text-text-secondary">Applicable Tier</label>
                  <select
                    value={formData.applicableTierId || ''}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, applicableTierId: e.target.value || null }))
                    }
                    className="w-full bg-card border border-border rounded-2xl px-4 py-3 text-sm font-body text-text-primary focus:outline-none focus:border-primary"
                  >
                    <option value="">All Tiers</option>
                    {tiers?.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="block text-xs font-semibold text-text-secondary">Valid From *</label>
                  <input
                    type="date"
                    required
                    value={formData.validFrom}
                    onChange={(e) => setFormData((prev) => ({ ...prev, validFrom: e.target.value }))}
                    className="w-full bg-card border border-border rounded-2xl px-4 py-3 text-sm font-body text-text-primary focus:outline-none focus:border-primary"
                  />
                </div>

                <div className="space-y-1">
                  <label className="block text-xs font-semibold text-text-secondary">Valid Until *</label>
                  <input
                    type="date"
                    required
                    value={formData.validUntil}
                    onChange={(e) => setFormData((prev) => ({ ...prev, validUntil: e.target.value }))}
                    className="w-full bg-card border border-border rounded-2xl px-4 py-3 text-sm font-body text-text-primary focus:outline-none focus:border-primary"
                  />
                </div>
              </div>

              {/* Days of Week toggle chips */}
              <div className="space-y-2">
                <label className="block text-xs font-semibold text-text-secondary">Active Days *</label>
                <div className="flex flex-wrap gap-1.5">
                  {DAY_LABELS.map((day, idx) => {
                    const isSelected = formData.daysOfWeek.includes(idx);
                    return (
                      <button
                        key={day}
                        type="button"
                        onClick={() => toggleDay(idx)}
                        className={`px-3 py-1.5 rounded-full border text-xs font-body active:scale-95 transition-all ${
                          isSelected
                            ? 'bg-primary text-white border-primary shadow-sm font-semibold'
                            : 'bg-card border-border text-text-secondary'
                        }`}
                      >
                        {day}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Hours dropdowns */}
              <div className="space-y-2">
                <label className="block text-xs font-semibold text-text-secondary">Active Hours Range *</label>
                <div className="flex items-center space-x-2">
                  <select
                    value={formData.startHour}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, startHour: parseInt(e.target.value, 10) }))
                    }
                    className="flex-1 bg-card border border-border rounded-2xl px-4 py-2.5 text-sm font-data text-text-primary focus:outline-none"
                  >
                    {Array.from({ length: 24 }).map((_, i) => (
                      <option key={i} value={i}>
                        {String(i).padStart(2, '0')}:00
                      </option>
                    ))}
                  </select>
                  <span className="text-text-secondary text-sm font-body">to</span>
                  <select
                    value={formData.endHour}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, endHour: parseInt(e.target.value, 10) }))
                    }
                    className="flex-1 bg-card border border-border rounded-2xl px-4 py-2.5 text-sm font-data text-text-primary focus:outline-none"
                  >
                    {Array.from({ length: 24 }).map((_, i) => (
                      <option key={i} value={i}>
                        {String(i).padStart(2, '0')}:00
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-semibold text-text-secondary">Max Capacity Uses</label>
                <input
                  type="number"
                  min={1}
                  max={10000}
                  value={formData.maxUses || ''}
                  onChange={(e) => {
                    const val = parseInt(e.target.value, 10);
                    setFormData((prev) => ({ ...prev, maxUses: isNaN(val) ? null : val }));
                  }}
                  placeholder="Unlimited usage"
                  className="w-full bg-card border border-border rounded-2xl px-4 py-3 text-sm font-data text-text-primary focus:outline-none focus:border-primary"
                />
              </div>

              {/* Is Active Toggle */}
              <div className="flex items-center justify-between pt-3 mt-2 border-t border-border">
                <div>
                  <label className="block text-sm font-medium text-text-primary font-body">
                    Deal is active
                  </label>
                  <span className="text-xs text-text-secondary font-body">
                    Inactive deals are hidden from marketplace
                  </span>
                </div>
                <ToggleSwitch
                  checked={formData.isActive}
                  onChange={(val) => setFormData((prev) => ({ ...prev, isActive: val }))}
                />
              </div>

              {/* Save / Cancel buttons */}
              <div className="mt-6 flex flex-col gap-2">
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="btn-primary w-full flex items-center justify-center gap-2"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Saving...</span>
                    </>
                  ) : sheetMode === 'create' ? (
                    <span>Create Deal</span>
                  ) : (
                    <span>Save Changes</span>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => setSheetMode('none')}
                  className="btn-outline text-sm w-full py-3"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
