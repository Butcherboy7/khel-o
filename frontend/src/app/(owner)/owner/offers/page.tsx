'use client';

import { useState, type FormEvent } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Tag, Plus, Percent, Calendar, Clock, Users, Ban, RotateCcw, AlertCircle } from 'lucide-react';
import {
  listOwnerPromotions,
  createPromotion,
  updatePromotion,
  deactivateOwnerPromotion,
  type Promotion,
} from '@/lib/api/promotions';
import { listCafeTiers } from '@/lib/api/tiers';
import { getOwnerCafeId } from '@/lib/api/owner';
import {
  Card,
  CardContent,
  Badge,
  Button,
  Input,
  Modal,
  SkeletonCard,
  ErrorState,
  EmptyState,
} from '@/components/ui';

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function promotionStatus(p: Promotion): { label: string; variant: 'success' | 'default' | 'error' } {
  if (!p.isActive) return { label: 'Paused', variant: 'default' };
  const now = new Date();
  if (new Date(p.validUntil) < now) return { label: 'Expired', variant: 'error' };
  if (p.maxUses != null && p.currentUses >= p.maxUses) return { label: 'Exhausted', variant: 'error' };
  return { label: 'Active', variant: 'success' };
}

function toDateInput(iso: string): string {
  return iso.slice(0, 10);
}

interface FormState {
  title: string;
  description: string;
  discountPercentage: number;
  applicableTierId: string;
  validFrom: string;
  validUntil: string;
  daysOfWeek: number[];
  startHour: number;
  endHour: number;
  maxUses: string;
}

const EMPTY_FORM: FormState = {
  title: '',
  description: '',
  discountPercentage: 15,
  applicableTierId: '',
  validFrom: new Date().toISOString().slice(0, 10),
  validUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
  daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
  startHour: 0,
  endHour: 24,
  maxUses: '',
};

export default function OwnerOffersPage() {
  const queryClient = useQueryClient();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [deactivateTarget, setDeactivateTarget] = useState<Promotion | null>(null);

  const { data: cafeData } = useQuery({
    queryKey: ['owner-cafe-id-offers'],
    queryFn: getOwnerCafeId,
  });
  const cafeId = cafeData?.cafeId;

  const { data: tiersData } = useQuery({
    queryKey: ['owner-hardware-tiers', cafeId, 'for-offers'],
    queryFn: () => listCafeTiers(cafeId!),
    enabled: !!cafeId,
  });
  const tiers = tiersData?.hardwareTiers ?? [];

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['owner-promotions', cafeId],
    queryFn: () => listOwnerPromotions(cafeId!),
    enabled: !!cafeId,
  });
  const promotions = data?.promotions ?? [];

  const resetForm = () => {
    setForm(EMPTY_FORM);
    setEditingId(null);
    setFormError(null);
  };

  const openCreate = () => {
    resetForm();
    setIsModalOpen(true);
  };

  const openEdit = (p: Promotion) => {
    setEditingId(p.id);
    setForm({
      title: p.title,
      description: p.description ?? '',
      discountPercentage: p.discountPercentage,
      applicableTierId: p.applicableTierId ?? '',
      validFrom: toDateInput(p.validFrom),
      validUntil: toDateInput(p.validUntil),
      daysOfWeek: p.daysOfWeek,
      startHour: p.startHour,
      endHour: p.endHour,
      maxUses: p.maxUses != null ? String(p.maxUses) : '',
    });
    setFormError(null);
    setIsModalOpen(true);
  };

  const createMut = useMutation({
    mutationFn: () =>
      createPromotion({
        cafeId: cafeId!,
        title: form.title,
        description: form.description || undefined,
        discountPercentage: Number(form.discountPercentage),
        applicableTierId: form.applicableTierId || null,
        validFrom: `${form.validFrom}T00:00:00`,
        validUntil: `${form.validUntil}T23:59:59`,
        daysOfWeek: form.daysOfWeek,
        startHour: Number(form.startHour),
        endHour: Number(form.endHour),
        maxUses: form.maxUses ? Number(form.maxUses) : null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['owner-promotions'] });
      setIsModalOpen(false);
      resetForm();
    },
    onError: (err: any) => setFormError(err?.message || 'Failed to create offer.'),
  });

  const updateMut = useMutation({
    mutationFn: () =>
      updatePromotion(editingId!, {
        title: form.title,
        description: form.description || undefined,
        discountPercentage: Number(form.discountPercentage),
        validUntil: `${form.validUntil}T23:59:59`,
        maxUses: form.maxUses ? Number(form.maxUses) : null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['owner-promotions'] });
      setIsModalOpen(false);
      resetForm();
    },
    onError: (err: any) => setFormError(err?.message || 'Failed to update offer.'),
  });

  const deactivateMut = useMutation({
    mutationFn: (id: string) => deactivateOwnerPromotion(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['owner-promotions'] });
      setDeactivateTarget(null);
    },
  });

  const reactivateMut = useMutation({
    mutationFn: (id: string) => updatePromotion(id, { isActive: true }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['owner-promotions'] }),
  });

  const toggleDay = (day: number) => {
    setForm((prev) => ({
      ...prev,
      daysOfWeek: prev.daysOfWeek.includes(day)
        ? prev.daysOfWeek.filter((d) => d !== day)
        : [...prev.daysOfWeek, day].sort(),
    }));
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) {
      setFormError('Give this offer a title.');
      return;
    }
    if (form.discountPercentage < 1 || form.discountPercentage > 50) {
      setFormError('Discount must be between 1% and 50%.');
      return;
    }
    if (new Date(form.validUntil) <= new Date(form.validFrom)) {
      setFormError('End date must be after the start date.');
      return;
    }
    if (form.endHour <= form.startHour) {
      setFormError('End hour must be after the start hour.');
      return;
    }
    if (form.daysOfWeek.length === 0) {
      setFormError('Select at least one day of the week.');
      return;
    }
    setFormError(null);
    if (editingId) {
      updateMut.mutate();
    } else {
      createMut.mutate();
    }
  };

  return (
    <div className="flex flex-col gap-6 pb-12">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-heading text-h1 text-text-primary flex items-center gap-2">
            <Tag className="h-6 w-6 text-primary" />
            <span>Promotional Offers</span>
          </h1>
          <p className="text-caption text-text-secondary mt-0.5">
            Time-boxed discounts gamers see automatically at checkout — no promo codes to share.
          </p>
        </div>
        <Button variant="primary" size="md" onClick={openCreate} className="gap-2" disabled={!cafeId}>
          <Plus className="h-4 w-4" />
          <span>Create Offer</span>
        </Button>
      </div>

      {isLoading && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <SkeletonCard />
          <SkeletonCard />
        </div>
      )}

      {isError && (
        <ErrorState
          title="Failed to load offers"
          message={(error as Error)?.message || 'Could not fetch your promotions.'}
          onRetry={() => refetch()}
        />
      )}

      {!isLoading && !isError && promotions.length === 0 && (
        <EmptyState
          title="No offers yet"
          description="Create a time-boxed discount — e.g. 20% off weeknights before 6 PM — and it applies automatically at checkout."
          actionLabel="Create Your First Offer"
          onAction={openCreate}
        />
      )}

      {!isLoading && !isError && promotions.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {promotions.map((p) => {
            const status = promotionStatus(p);
            const tierName = p.applicableTierId ? tiers.find((t) => t.id === p.applicableTierId)?.name : null;
            return (
              <Card key={p.id} elevation="resting" className="overflow-hidden">
                <CardContent className="p-5 flex flex-col gap-3.5">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="font-heading text-h3 text-text-primary">{p.title}</h3>
                      {p.description && <p className="text-caption text-text-secondary mt-0.5">{p.description}</p>}
                    </div>
                    <Badge variant={status.variant} size="sm" className="whitespace-nowrap flex-shrink-0">
                      {status.label}
                    </Badge>
                  </div>

                  <div className="flex items-center gap-2 p-3 rounded-xl bg-surface border border-border">
                    <Percent className="h-4 w-4 text-primary flex-shrink-0" />
                    <span className="text-h3 font-heading font-bold text-primary">{p.discountPercentage}% OFF</span>
                    <span className="text-caption text-text-secondary">{tierName ?? 'All tiers'}</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-caption text-text-secondary">
                    <div className="flex items-center gap-1.5">
                      <Calendar className="h-3.5 w-3.5 flex-shrink-0" />
                      <span>
                        {new Date(p.validFrom).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} –{' '}
                        {new Date(p.validUntil).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Clock className="h-3.5 w-3.5 flex-shrink-0" />
                      <span>{p.startHour}:00 – {p.endHour}:00</span>
                    </div>
                    <div className="flex items-center gap-1.5 sm:col-span-2">
                      <span className="font-semibold text-text-primary">
                        {p.daysOfWeek.length === 7 ? 'Every day' : p.daysOfWeek.map((d) => DAY_LABELS[d]).join(', ')}
                      </span>
                    </div>
                    {p.maxUses != null && (
                      <div className="flex items-center gap-1.5 sm:col-span-2">
                        <Users className="h-3.5 w-3.5 flex-shrink-0" />
                        <span>{p.currentUses} / {p.maxUses} redeemed</span>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-2 pt-3 border-t border-border">
                    <Button variant="outline" size="sm" onClick={() => openEdit(p)} className="flex-1">
                      Edit
                    </Button>
                    {p.isActive ? (
                      <Button
                        variant="destructive-outline"
                        size="sm"
                        onClick={() => setDeactivateTarget(p)}
                        className="flex-1 gap-1.5"
                      >
                        <Ban className="h-3.5 w-3.5" />
                        Pause
                      </Button>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => reactivateMut.mutate(p.id)}
                        isLoading={reactivateMut.isPending && reactivateMut.variables === p.id}
                        className="flex-1 gap-1.5 text-success border-success/30 hover:bg-success/10"
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                        Resume
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Create / Edit Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => { setIsModalOpen(false); resetForm(); }}
        title={editingId ? 'Edit Offer' : 'Create Offer'}
        description="Applies automatically at checkout when the conditions below are met — no code needed."
        size="lg"
      >
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {formError && (
            <div className="p-3 rounded-xl bg-error/10 border border-error/20 text-caption text-error flex items-center gap-2">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              {formError}
            </div>
          )}

          <Input
            label="Offer Title *"
            placeholder="e.g. Weeknight Happy Hour"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            required
          />
          <Input
            label="Description (shown to gamers)"
            placeholder="e.g. 20% off all weeknight sessions before 6 PM"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Discount % (1-50) *"
              type="number"
              min={1}
              max={50}
              value={form.discountPercentage}
              onChange={(e) => setForm({ ...form, discountPercentage: Number(e.target.value) })}
              required
            />
            <div className="flex flex-col gap-1.5">
              <label className="text-caption font-semibold text-text-primary">Applies To</label>
              <select
                value={form.applicableTierId}
                disabled={!!editingId}
                onChange={(e) => setForm({ ...form, applicableTierId: e.target.value })}
                className="h-10 w-full rounded-xl border border-border bg-card px-3 text-caption text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-60"
              >
                <option value="">All hardware tiers</option>
                {tiers.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
              {editingId && <p className="text-[11px] text-text-tertiary">Tier scope can&apos;t change after creation — pause and create a new offer instead.</p>}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Start Date *"
              type="date"
              value={form.validFrom}
              disabled={!!editingId}
              onChange={(e) => setForm({ ...form, validFrom: e.target.value })}
              required
            />
            <Input
              label="End Date *"
              type="date"
              value={form.validUntil}
              onChange={(e) => setForm({ ...form, validUntil: e.target.value })}
              required
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Start Hour (0-23) *"
              type="number"
              min={0}
              max={23}
              value={form.startHour}
              disabled={!!editingId}
              onChange={(e) => setForm({ ...form, startHour: Number(e.target.value) })}
              required
            />
            <Input
              label="End Hour (1-24) *"
              type="number"
              min={1}
              max={24}
              value={form.endHour}
              disabled={!!editingId}
              onChange={(e) => setForm({ ...form, endHour: Number(e.target.value) })}
              required
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-caption font-semibold text-text-primary">Days of Week *</label>
            <div className="flex flex-wrap gap-1.5">
              {DAY_LABELS.map((label, idx) => {
                const selected = form.daysOfWeek.includes(idx);
                return (
                  <button
                    key={label}
                    type="button"
                    disabled={!!editingId}
                    onClick={() => toggleDay(idx)}
                    className={`min-w-[44px] h-11 px-2 rounded-xl text-caption font-semibold transition-colors disabled:opacity-60 ${
                      selected
                        ? 'bg-primary text-white'
                        : 'bg-surface border border-border text-text-secondary hover:bg-surface-hover'
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          <Input
            label="Max Redemptions (optional)"
            type="number"
            min={1}
            placeholder="Leave blank for unlimited"
            value={form.maxUses}
            onChange={(e) => setForm({ ...form, maxUses: e.target.value })}
          />

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-border">
            <Button type="button" variant="ghost" onClick={() => { setIsModalOpen(false); resetForm(); }}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              isLoading={createMut.isPending || updateMut.isPending}
              loadingText={editingId ? 'Saving...' : 'Creating...'}
            >
              {editingId ? 'Save Changes' : 'Create Offer'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Pause Confirmation */}
      <Modal
        isOpen={!!deactivateTarget}
        onClose={() => setDeactivateTarget(null)}
        title="Pause this offer?"
      >
        {deactivateTarget && (
          <div className="flex flex-col gap-4">
            <p className="text-caption text-text-secondary">
              <strong className="text-text-primary">{deactivateTarget.title}</strong> will stop applying to new bookings immediately. You can resume it anytime.
            </p>
            <div className="flex items-center justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setDeactivateTarget(null)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                size="sm"
                isLoading={deactivateMut.isPending}
                onClick={() => deactivateMut.mutate(deactivateTarget.id)}
              >
                Pause Offer
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
