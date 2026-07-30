'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Plus,
  Store,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Pencil,
} from 'lucide-react';
import { getOwnerCafe, listCafeTiers, createTier, updateTier, TierFormData } from '@/lib/api';
import { HardwareTier } from '@/types';

const DEFAULT_TIER_FORM: TierFormData = {
  name: '',
  description: '',
  specs: {
    gpu: '',
    cpu: '',
    ram: '',
    storage: '',
    monitor: '',
    peripherals: '',
  },
  totalSeats: 1,
  appBookableSeats: 1,
  presetCategory: null,
  pricePerHour: 100,
  isActive: true,
};

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

function CardSkeleton() {
  return (
    <div className="bg-card rounded-2xl border border-border shadow-md p-4 space-y-3 animate-pulse">
      <div className="flex justify-between items-center">
        <div className="h-5 bg-surface rounded w-1/2" />
        <div className="h-6 bg-surface rounded-full w-12" />
      </div>
      <div className="h-4 bg-surface rounded w-1/3" />
      <div className="flex gap-2">
        <div className="h-5 bg-surface rounded-full w-16" />
        <div className="h-5 bg-surface rounded-full w-16" />
      </div>
    </div>
  );
}

export default function OwnerTiersPage() {
  const router = useRouter();
  const queryClient = useQueryClient();

  // Local UI States
  const [sheetMode, setSheetMode] = useState<'none' | 'create' | 'edit'>('none');
  const [editingTierId, setEditingTierId] = useState<string | null>(null);
  const [formData, setFormData] = useState<TierFormData>(DEFAULT_TIER_FORM);
  const [formErrors, setFormErrors] = useState<Partial<Record<string, string>>>({});
  const [sheetError, setSheetError] = useState<string | null>(null);
  const [successToast, setSuccessToast] = useState<string | null>(null);
  const [togglingTierId, setTogglingTierId] = useState<string | null>(null);

  // Queries
  const {
    data: ownerCafe,
    isLoading: isCafeLoading,
    isError: isCafeError,
    error: cafeError,
    refetch: refetchCafe,
  } = useQuery({
    queryKey: ['ownerCafe'],
    queryFn: getOwnerCafe,
    staleTime: 120_000,
  });

  const cafeId = ownerCafe?.id;

  const {
    data: tiersList,
    isLoading: isTiersLoading,
    isError: isTiersError,
    error: tiersError,
    refetch: refetchTiers,
  } = useQuery({
    queryKey: ['tiers', cafeId],
    queryFn: () => listCafeTiers(cafeId!),
    enabled: !!cafeId,
    staleTime: 60_000,
  });

  const handleRetryAll = () => {
    refetchCafe();
    if (cafeId) refetchTiers();
  };

  const tiers = tiersList || [];

  // Success toast helper
  const showSuccessToast = (msg: string) => {
    setSuccessToast(msg);
    setTimeout(() => {
      setSuccessToast(null);
    }, 3000);
  };

  // Mutations
  const createTierMutation = useMutation({
    mutationFn: (data: TierFormData) => createTier(cafeId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tiers', cafeId] });
      setSheetMode('none');
      showSuccessToast('Tier created.');
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.error?.message || err?.response?.data?.detail || 'Failed to create tier.';
      setSheetError(msg);
    },
  });

  const updateTierMutation = useMutation({
    mutationFn: (data: Partial<TierFormData>) => updateTier(cafeId!, editingTierId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tiers', cafeId] });
      setSheetMode('none');
      showSuccessToast('Tier updated.');
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.error?.message || err?.response?.data?.detail || 'Failed to update tier.';
      setSheetError(msg);
    },
  });

  const toggleActiveMutation = useMutation({
    mutationFn: ({ tierId, isActive }: { tierId: string; isActive: boolean }) =>
      updateTier(cafeId!, tierId, { isActive }),
    onMutate: ({ tierId }) => {
      setTogglingTierId(tierId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tiers', cafeId] });
    },
    onSettled: () => {
      setTogglingTierId(null);
    },
  });

  // Pre-fill form on edit mode change
  useEffect(() => {
    if (sheetMode === 'edit' && editingTierId && tiersList) {
      const tier = tiersList.find((t) => t.id === editingTierId);
      if (tier) {
        setFormData({
          name: tier.name ?? '',
          description: tier.description ?? '',
          specs: {
            gpu: tier.specs?.gpu ?? '',
            cpu: tier.specs?.cpu ?? '',
            ram: tier.specs?.ram ?? '',
            storage: tier.specs?.storage ?? '',
            monitor: tier.specs?.monitor ?? '',
            peripherals: tier.specs?.peripherals ?? '',
          },
          totalSeats: tier.totalSeats ?? 1,
          appBookableSeats: tier.appBookableSeats ?? 1,
          presetCategory: tier.presetCategory ?? null,
          pricePerHour: tier.pricePerHour ?? 100,
          isActive: tier.isActive ?? true,
        });
      }
    } else if (sheetMode === 'create') {
      setFormData(DEFAULT_TIER_FORM);
    }
    setFormErrors({});
    setSheetError(null);
  }, [sheetMode, editingTierId, tiersList]);

  const validateForm = () => {
    const errs: Partial<Record<string, string>> = {};
    if (!formData.name.trim()) errs.name = 'Tier Name is required';
    if (formData.totalSeats < 1 || formData.totalSeats > 200) {
      errs.totalSeats = 'Seats must be between 1 and 200';
    }
    if (formData.appBookableSeats < 0 || formData.appBookableSeats > formData.totalSeats) {
      errs.appBookableSeats = 'App-bookable seats cannot exceed total seats';
    }
    if (formData.pricePerHour < 10 || formData.pricePerHour > 10000) {
      errs.pricePerHour = 'Price must be between ₹10 and ₹10000';
    }
    setFormErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;

    if (sheetMode === 'edit') {
      updateTierMutation.mutate(formData);
    } else {
      createTierMutation.mutate(formData);
    }
  };

  const isSubmitting = createTierMutation.isPending || updateTierMutation.isPending;

  if (isCafeLoading || (cafeId && isTiersLoading)) {
    return (
      <div className="space-y-4 pb-24">
        <div className="h-14 bg-surface rounded w-full" />
        <div className="space-y-3 pt-2">
          <CardSkeleton />
          <CardSkeleton />
          <CardSkeleton />
        </div>
      </div>
    );
  }

  if (isCafeError || (cafeId && isTiersError)) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center text-center p-6 space-y-4 mx-4 card-base shadow-md">
        <AlertTriangle className="w-16 h-16 text-error" />
        <h2 className="font-heading font-bold text-xl text-text-primary">
          Couldn&apos;t load tiers
        </h2>
        <p className="text-text-secondary text-sm max-w-sm">
          {cafeError?.message || tiersError?.message || 'Unable to retrieve tiers catalog.'}
        </p>
        <button
          type="button"
          onClick={handleRetryAll}
          className="btn-outline text-sm py-2 px-6 rounded-2xl"
        >
          Try Again
        </button>
      </div>
    );
  }

  // Cafe Profile Warning if no cafe
  if (!ownerCafe) {
    return (
      <div className="mx-4 mt-8 card-base p-6 flex flex-col items-center gap-3 text-center shadow-md">
        <Store className="w-12 h-12 text-text-secondary/30" />
        <h3 className="font-heading font-semibold text-lg text-text-primary">
          Set up your café first
        </h3>
        <p className="font-body text-xs text-text-secondary leading-relaxed">
          You need to create your café profile before adding hardware tiers.
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
      {/* SUCCESS TOAST */}
      {successToast && (
        <div className="fixed top-16 left-0 right-0 z-30 px-4 animate-fade-in">
          <div className="bg-success/10 border border-success/20 rounded-2xl mx-4 p-3 flex items-center gap-2 shadow-md">
            <CheckCircle2 className="w-5 h-5 text-success shrink-0" />
            <span className="font-body text-sm text-text-primary">{successToast}</span>
          </div>
        </div>
      )}

      {/* TOP HEADER BAR */}
      <div className="sticky top-0 z-20 bg-card border-b border-border shadow-sm h-14 flex items-center justify-between px-4 -mx-4">
        <button
          type="button"
          onClick={() => router.push('/owner/dashboard')}
          className="p-2 hover:bg-surface rounded-full transition-colors text-text-secondary"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <span className="font-heading font-semibold text-base text-text-primary">
          Hardware Tiers
        </span>
        <button
          type="button"
          onClick={() => {
            setSheetMode('create');
            setEditingTierId(null);
          }}
          className="btn-primary text-xs px-3 py-1.5 min-h-[32px] rounded-full flex items-center gap-1.5"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Add Tier</span>
        </button>
      </div>

      {/* SUBTITLE STATS */}
      <div className="mx-4 mt-4">
        <p className="font-body text-sm text-text-secondary">
          {tiers.length === 0
            ? 'No tiers yet — add your first rig category.'
            : `${tiers.length} tier(s) configured`}
        </p>
      </div>

      {/* TIERS LIST */}
      <div className="space-y-3">
        {tiers.map((t) => {
          const isToggling = togglingTierId === t.id;
          const displaySpecs = Object.entries(t.specs || {})
            .filter(([_, val]) => val && typeof val === 'string' && val.trim() !== '')
            .slice(0, 4);

          return (
            <div key={t.id} className="mx-4 card-base p-4 flex flex-col gap-3 shadow-sm hover:border-primary/50 transition-colors">
              {/* Row 1: Title, Rating & Toggle */}
              <div className="flex justify-between items-start gap-4">
                <div className="space-y-1">
                  <div className="flex items-center space-x-2">
                    <h3 className="font-heading font-semibold text-base text-text-primary truncate max-w-[200px]">
                      {t.name}
                    </h3>
                    {t.performanceRating && (
                      <div className="flex items-center text-[10px] text-amber-500 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded-full font-data font-bold">
                        <span className="mr-0.5">★</span>
                        <span>{t.performanceRating.toFixed(1)}</span>
                      </div>
                    )}
                  </div>
                  {t.presetCategory && (
                    <span className="inline-block text-[9px] font-bold font-heading bg-emerald-50 text-primary border border-emerald-200 px-2 py-0.5 rounded-full capitalize">
                      Preset: {t.presetCategory.replace('_', ' ')}
                    </span>
                  )}
                </div>
                <div className={isToggling ? 'opacity-50 pointer-events-none' : ''}>
                  <ToggleSwitch
                    checked={t.isActive}
                    onChange={(checked) =>
                      toggleActiveMutation.mutate({ tierId: t.id, isActive: checked })
                    }
                  />
                </div>
              </div>

              {/* Row 2: Price & Seats */}
              <div className="flex items-center text-sm font-data">
                <span className="font-bold text-text-technical text-base">
                  ₹{t.pricePerHour}/hr
                </span>
                <span className="text-text-secondary mx-2 font-body">·</span>
                <span className="text-text-secondary font-body">
                  {t.appBookableSeats} / {t.totalSeats} seats bookable
                </span>
              </div>

              {/* Specs Baseline Warning */}
              {t.warning && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-2.5 flex items-start space-x-1.5 text-[11px] text-amber-700 font-body">
                  <span className="font-bold">⚠️</span>
                  <span>{t.warning}</span>
                </div>
              )}

              {/* Specs chips */}
              {displaySpecs.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {displaySpecs.map(([key, val]) => (
                    <span
                      key={key}
                      className="bg-surface border border-border rounded-full px-2 py-0.5 text-xs font-data text-text-secondary shrink-0"
                    >
                      {val}
                    </span>
                  ))}
                </div>
              )}

              {/* Description */}
              {t.description && (
                <p className="font-body text-xs text-text-secondary line-clamp-2 mt-1">
                  {t.description}
                </p>
              )}

              {/* Action Buttons Row */}
              <div className="pt-2 border-t border-border flex justify-end">
                <button
                  type="button"
                  onClick={() => {
                    setEditingTierId(t.id);
                    setSheetMode('edit');
                  }}
                  className="btn-outline text-xs py-1 px-3 min-h-[30px] rounded-full flex items-center gap-1"
                >
                  <Pencil className="w-3 h-3 text-primary" />
                  <span>Edit Tier</span>
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* BOTTOM SHEET DIALOG PANEL (State B) */}
      {sheetMode !== 'none' && (
        <div
          onClick={() => setSheetMode('none')}
          className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm flex items-end justify-center animate-fade-in"
        >
          {/* Sheet body */}
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md bg-card rounded-t-3xl max-h-[90vh] overflow-y-auto z-50 shadow-2xl flex flex-col animate-slide-up"
          >
            {/* Drag handle */}
            <div className="w-12 h-1 bg-border rounded-full mx-auto mt-3 mb-4 shrink-0" />

            {/* Form title */}
            <div className="px-4 pb-2 border-b border-border flex items-center justify-between">
              <h2 className="font-heading font-bold text-lg text-text-primary">
                {sheetMode === 'create' ? 'New Hardware Tier' : 'Edit Hardware Tier'}
              </h2>
            </div>

            {/* Error in sheet */}
            {sheetError && (
              <div className="mx-4 mt-3 rounded-2xl border border-error/20 bg-error/10 p-3 flex items-center gap-2 text-xs text-text-primary font-body">
                <AlertTriangle className="w-4 h-4 text-error shrink-0" />
                <span>{sheetError}</span>
              </div>
            )}

            {/* Form body */}
            <form onSubmit={handleFormSubmit} className="p-4 space-y-4 flex-1">
              <div className="space-y-1">
                <label className="block text-xs font-semibold text-text-secondary">Preset Category *</label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { id: 'esports_starter', label: 'Esports Starter' },
                    { id: 'pro_gaming', label: 'Pro Gaming' },
                    { id: 'ultra_streamer', label: 'Ultra / Streamer' },
                    { id: 'console', label: 'Console' },
                  ].map((p) => {
                    const isSel = formData.presetCategory === p.id;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => setFormData((prev) => ({ ...prev, presetCategory: p.id }))}
                        className={`p-2.5 rounded-xl border text-center text-xs font-heading font-bold transition-all ${
                          isSel
                            ? 'bg-primary/10 border-primary text-primary shadow-sm'
                            : 'bg-surface border-border text-text-secondary hover:border-primary/50'
                        }`}
                      >
                        {p.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-semibold text-text-secondary">Tier Name *</label>
                <input
                  type="text"
                  required
                  maxLength={80}
                  value={formData.name}
                  onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
                  placeholder="e.g., RTX 4080 VIP Tier"
                  className={`w-full bg-card border rounded-2xl px-4 py-3 text-sm font-body text-text-primary focus:outline-none focus:border-primary ${
                    formErrors.name ? 'border-error' : 'border-border'
                  }`}
                />
                {formErrors.name && (
                  <p className="text-xs text-error mt-1 font-body">{formErrors.name}</p>
                )}
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-semibold text-text-secondary">Description</label>
                <textarea
                  rows={2}
                  maxLength={300}
                  value={formData.description}
                  onChange={(e) => setFormData((prev) => ({ ...prev, description: e.target.value }))}
                  placeholder="Describe this rig setup..."
                  className="w-full bg-card border border-border rounded-2xl px-4 py-3 text-sm font-body text-text-primary focus:outline-none focus:border-primary"
                />
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-semibold text-text-secondary">Price per Hour *</label>
                <div className="relative flex items-center">
                  <span className="absolute left-3.5 text-text-secondary text-sm font-body">₹</span>
                  <input
                    type="number"
                    required
                    min={10}
                    max={10000}
                    step={0.5}
                    value={formData.pricePerHour || ''}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value);
                      setFormData((prev) => ({ ...prev, pricePerHour: isNaN(val) ? 0 : val }));
                    }}
                    placeholder="150"
                    className={`w-full bg-card border rounded-2xl pl-8 pr-4 py-3 text-sm font-data text-text-primary focus:outline-none focus:border-primary ${
                      formErrors.pricePerHour ? 'border-error' : 'border-border'
                    }`}
                  />
                </div>
                {formErrors.pricePerHour && (
                  <p className="text-xs text-error mt-1 font-body">{formErrors.pricePerHour}</p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="block text-xs font-semibold text-text-secondary">Total Seats *</label>
                  <input
                    type="number"
                    required
                    min={1}
                    max={200}
                    value={formData.totalSeats || ''}
                    onChange={(e) => {
                      const val = parseInt(e.target.value, 10);
                      setFormData((prev) => ({ ...prev, totalSeats: isNaN(val) ? 0 : val }));
                    }}
                    placeholder="10"
                    className={`w-full bg-card border rounded-2xl px-4 py-3 text-sm font-data text-text-primary focus:outline-none focus:border-primary ${
                      formErrors.totalSeats ? 'border-error' : 'border-border'
                    }`}
                  />
                  {formErrors.totalSeats && (
                    <p className="text-xs text-error mt-1 font-body">{formErrors.totalSeats}</p>
                  )}
                </div>

                <div className="space-y-1">
                  <label className="block text-xs font-semibold text-text-secondary">App Bookable *</label>
                  <input
                    type="number"
                    required
                    min={0}
                    max={200}
                    value={formData.appBookableSeats === undefined ? '' : formData.appBookableSeats}
                    onChange={(e) => {
                      const val = parseInt(e.target.value, 10);
                      setFormData((prev) => ({ ...prev, appBookableSeats: isNaN(val) ? 0 : val }));
                    }}
                    placeholder="8"
                    className={`w-full bg-card border rounded-2xl px-4 py-3 text-sm font-data text-text-primary focus:outline-none focus:border-primary ${
                      formErrors.appBookableSeats ? 'border-error' : 'border-border'
                    }`}
                  />
                  {formErrors.appBookableSeats && (
                    <p className="text-xs text-error mt-1 font-body">{formErrors.appBookableSeats}</p>
                  )}
                </div>
              </div>

              {/* Hardware Specs */}
              <div className="space-y-3 pt-2">
                <h3 className="font-heading font-semibold text-xs text-text-secondary uppercase tracking-widest border-b border-border pb-1">
                  Hardware Specs
                </h3>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="block text-[10px] font-semibold text-text-secondary">GPU Model</label>
                    <input
                      type="text"
                      value={formData.specs.gpu || ''}
                      onChange={(e) =>
                        setFormData((prev) => ({
                          ...prev,
                          specs: { ...prev.specs, gpu: e.target.value },
                        }))
                      }
                      placeholder="e.g., RTX 4080"
                      className="w-full bg-card border border-border rounded-xl px-3 py-2 text-xs font-body text-text-primary focus:outline-none focus:border-primary"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="block text-[10px] font-semibold text-text-secondary">CPU Model</label>
                    <input
                      type="text"
                      value={formData.specs.cpu || ''}
                      onChange={(e) =>
                        setFormData((prev) => ({
                          ...prev,
                          specs: { ...prev.specs, cpu: e.target.value },
                        }))
                      }
                      placeholder="e.g., i9-14900K"
                      className="w-full bg-card border border-border rounded-xl px-3 py-2 text-xs font-body text-text-primary focus:outline-none focus:border-primary"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="block text-[10px] font-semibold text-text-secondary">RAM</label>
                    <input
                      type="text"
                      value={formData.specs.ram || ''}
                      onChange={(e) =>
                        setFormData((prev) => ({
                          ...prev,
                          specs: { ...prev.specs, ram: e.target.value },
                        }))
                      }
                      placeholder="e.g., 32GB DDR5"
                      className="w-full bg-card border border-border rounded-xl px-3 py-2 text-xs font-body text-text-primary focus:outline-none focus:border-primary"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="block text-[10px] font-semibold text-text-secondary">Storage</label>
                    <input
                      type="text"
                      value={formData.specs.storage || ''}
                      onChange={(e) =>
                        setFormData((prev) => ({
                          ...prev,
                          specs: { ...prev.specs, storage: e.target.value },
                        }))
                      }
                      placeholder="e.g., 2TB NVMe"
                      className="w-full bg-card border border-border rounded-xl px-3 py-2 text-xs font-body text-text-primary focus:outline-none focus:border-primary"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="block text-[10px] font-semibold text-text-secondary">Monitor</label>
                    <input
                      type="text"
                      value={formData.specs.monitor || ''}
                      onChange={(e) =>
                        setFormData((prev) => ({
                          ...prev,
                          specs: { ...prev.specs, monitor: e.target.value },
                        }))
                      }
                      placeholder="e.g., 27' 240Hz OLED"
                      className="w-full bg-card border border-border rounded-xl px-3 py-2 text-xs font-body text-text-primary focus:outline-none focus:border-primary"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="block text-[10px] font-semibold text-text-secondary">Peripherals</label>
                    <input
                      type="text"
                      value={formData.specs.peripherals || ''}
                      onChange={(e) =>
                        setFormData((prev) => ({
                          ...prev,
                          specs: { ...prev.specs, peripherals: e.target.value },
                        }))
                      }
                      placeholder="Mechanical KB + Mouse"
                      className="w-full bg-card border border-border rounded-xl px-3 py-2 text-xs font-body text-text-primary focus:outline-none focus:border-primary"
                    />
                  </div>
                </div>
              </div>

              {/* Is Active toggle */}
              <div className="flex items-center justify-between pt-3 mt-2 border-t border-border">
                <div>
                  <label className="block text-sm font-medium text-text-primary font-body">
                    Tier is active
                  </label>
                  <span className="text-xs text-text-secondary font-body">
                    Inactive tiers are hidden from gamers
                  </span>
                </div>
                <ToggleSwitch
                  checked={formData.isActive}
                  onChange={(val) => setFormData((prev) => ({ ...prev, isActive: val }))}
                />
              </div>

              {/* Submit Buttons */}
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
                    <span>Create Tier</span>
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
