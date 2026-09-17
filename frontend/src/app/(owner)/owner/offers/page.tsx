'use client';

import { useState, type FormEvent } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Tag, Plus, Calendar, Clock, Users, Ban, RotateCcw, AlertCircle, QrCode, Copy, RefreshCw, Percent, IndianRupee, Sparkles, Trash2 } from 'lucide-react';
import {
  listOwnerPromotions,
  createPromotion,
  updatePromotion,
  deactivateOwnerPromotion,
  deleteOwnerPromotionPermanently,
  type Promotion,
  type PromotionType,
} from '@/lib/api/promotions';
import { listCafeTiers } from '@/lib/api/tiers';
import { getOwnerCafeId } from '@/lib/api/owner';
import { getPublicEnv } from '@/lib/runtimeEnv';
import {
  Card,
  CardContent,
  Badge,
  Button,
  Input,
  NumericField,
  Modal,
  SkeletonCard,
  ErrorState,
  EmptyState,
} from '@/components/ui';
import { OwnerPageHeader } from '@/components/owner/OwnerPageHeader';

const SITE_URL = getPublicEnv('NEXT_PUBLIC_APP_URL', 'https://khel-o.online');

function redeemUrl(code: string): string {
  return `${SITE_URL}/redeem/${code}`;
}

function qrImageUrl(data: string): string {
  return `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(data)}`;
}

function generateCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I ambiguity
  let out = '';
  for (let i = 0; i < 8; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function promotionStatus(p: Promotion): { label: string; variant: 'success' | 'default' | 'error' } {
  if (!p.isActive) return { label: 'Paused', variant: 'default' };
  const now = new Date();
  if (new Date(p.validFrom) > now) return { label: 'Scheduled', variant: 'default' };
  if (new Date(p.validUntil) < now) return { label: 'Expired', variant: 'error' };
  if (p.maxUses != null && p.currentUses >= p.maxUses) return { label: 'Exhausted', variant: 'error' };
  return { label: 'Active', variant: 'success' };
}

function toDateInput(iso: string): string {
  return iso.slice(0, 10);
}

const TYPE_OPTIONS: { value: PromotionType; label: string; hint: string; icon: typeof Percent }[] = [
  { value: 'percentage', label: 'Discount', hint: 'e.g. 20% off', icon: Percent },
  { value: 'fixed_price', label: 'Fixed Price Deal', hint: 'e.g. 4 hours for ₹360', icon: Sparkles },
  { value: 'fixed_amount', label: 'Fixed Amount Off', hint: 'e.g. ₹100 off', icon: IndianRupee },
];

interface FormState {
  title: string;
  description: string;
  promotionType: PromotionType;
  discountPercentage: number;
  fixedDiscountAmount: string;
  fixedPriceAmount: string;
  minDurationHours: number;
  applicableTierId: string;
  validFrom: string;
  validUntil: string;
  daysOfWeek: number[];
  startHour: number;
  endHour: number;
  maxUses: string;
  kheloCode: string;
  isActive: boolean;
}

function emptyForm(): FormState {
  return {
    title: '',
    description: '',
    promotionType: 'percentage',
    discountPercentage: 15,
    fixedDiscountAmount: '',
    fixedPriceAmount: '',
    minDurationHours: 4,
    applicableTierId: '',
    validFrom: new Date().toISOString().slice(0, 10),
    validUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
    daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
    startHour: 0,
    endHour: 24,
    maxUses: '',
    kheloCode: '',
    isActive: true,
  };
}

export default function OwnerOffersPage() {
  const queryClient = useQueryClient();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingUses, setEditingUses] = useState(0);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [formError, setFormError] = useState<string | null>(null);
  const [deactivateTarget, setDeactivateTarget] = useState<Promotion | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Promotion | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [qrTargetId, setQrTargetId] = useState<string | null>(null);

  const copyCode = async (id: string, code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedId(id);
      setTimeout(() => setCopiedId((cur) => (cur === id ? null : cur)), 1500);
    } catch {
      // Clipboard API can be unavailable (insecure context, permissions) —
      // the code is still visible on the card, so this is a soft failure.
    }
  };

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
    setForm(emptyForm());
    setEditingId(null);
    setEditingUses(0);
    setFormError(null);
  };

  const openCreate = () => {
    resetForm();
    setIsModalOpen(true);
  };

  const openEdit = (p: Promotion) => {
    setEditingId(p.id);
    setEditingUses(p.currentUses);
    setForm({
      title: p.title,
      description: p.description ?? '',
      promotionType: p.promotionType,
      discountPercentage: p.discountPercentage ?? 15,
      fixedDiscountAmount: p.fixedDiscountAmount != null ? String(p.fixedDiscountAmount) : '',
      fixedPriceAmount: p.fixedPriceAmount != null ? String(p.fixedPriceAmount) : '',
      minDurationHours: p.minDurationHours ?? 4,
      applicableTierId: p.applicableTierId ?? '',
      validFrom: toDateInput(p.validFrom),
      validUntil: toDateInput(p.validUntil),
      daysOfWeek: p.daysOfWeek,
      startHour: p.startHour,
      endHour: p.endHour,
      maxUses: p.maxUses != null ? String(p.maxUses) : '',
      kheloCode: p.kheloCode ?? '',
      isActive: p.isActive,
    });
    setFormError(null);
    setIsModalOpen(true);
  };

  // Locked only once the offer has been redeemed at least once — switching
  // between "20% off" and "4 hours for ₹360" mid-life is where genuine
  // ambiguity lives for customers who've already used it. Every other field
  // stays editable regardless of redemption count (matches
  // PromotionService.update_promotion's PROMOTION_TYPE_LOCKED rule).
  const typeLocked = !!editingId && editingUses > 0;

  const typeFieldsPayload = () => {
    if (form.promotionType === 'percentage') {
      return { discountPercentage: Number(form.discountPercentage), fixedDiscountAmount: null, fixedPriceAmount: null, minDurationHours: null };
    }
    if (form.promotionType === 'fixed_amount') {
      return { discountPercentage: null, fixedDiscountAmount: Number(form.fixedDiscountAmount), fixedPriceAmount: null, minDurationHours: null };
    }
    return { discountPercentage: null, fixedDiscountAmount: null, fixedPriceAmount: Number(form.fixedPriceAmount), minDurationHours: Number(form.minDurationHours) };
  };

  const createMut = useMutation({
    mutationFn: () =>
      createPromotion({
        cafeId: cafeId!,
        title: form.title,
        description: form.description || undefined,
        promotionType: form.promotionType,
        ...typeFieldsPayload(),
        applicableTierId: form.applicableTierId || null,
        validFrom: `${form.validFrom}T00:00:00`,
        validUntil: `${form.validUntil}T23:59:59`,
        daysOfWeek: form.daysOfWeek,
        startHour: Number(form.startHour),
        endHour: Number(form.endHour),
        maxUses: form.maxUses ? Number(form.maxUses) : null,
        kheloCode: form.kheloCode || null,
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
        ...(typeLocked ? {} : { promotionType: form.promotionType, ...typeFieldsPayload() }),
        applicableTierId: form.applicableTierId || null,
        validFrom: `${form.validFrom}T00:00:00`,
        validUntil: `${form.validUntil}T23:59:59`,
        daysOfWeek: form.daysOfWeek,
        startHour: Number(form.startHour),
        endHour: Number(form.endHour),
        maxUses: form.maxUses ? Number(form.maxUses) : null,
        kheloCode: form.kheloCode || null,
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

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteOwnerPromotionPermanently(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['owner-promotions'] });
      setDeleteTarget(null);
      setDeleteError(null);
    },
    onError: (err: any) => setDeleteError(err?.message || 'Failed to delete offer.'),
  });

  const toggleDay = (day: number) => {
    setForm((prev) => ({
      ...prev,
      daysOfWeek: prev.daysOfWeek.includes(day)
        ? prev.daysOfWeek.filter((d) => d !== day)
        : [...prev.daysOfWeek, day].sort(),
    }));
  };

  const selectedTier = tiers.find((t) => t.id === form.applicableTierId);
  const regularPricePreview =
    form.promotionType === 'fixed_price' && selectedTier
      ? selectedTier.pricePerHour * form.minDurationHours
      : null;
  const savingsPreview =
    regularPricePreview != null && form.fixedPriceAmount
      ? Math.max(regularPricePreview - Number(form.fixedPriceAmount), 0)
      : null;

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) {
      setFormError('Give this offer a title.');
      return;
    }
    if (form.promotionType === 'percentage' && (form.discountPercentage < 1 || form.discountPercentage > 50)) {
      setFormError('Discount must be between 1% and 50%.');
      return;
    }
    if (form.promotionType === 'fixed_amount' && (!form.fixedDiscountAmount || Number(form.fixedDiscountAmount) <= 0)) {
      setFormError('Enter how much money comes off, in rupees.');
      return;
    }
    if (form.promotionType === 'fixed_price') {
      if (!form.applicableTierId) {
        setFormError('A fixed-price deal must apply to a specific setup — choose one.');
        return;
      }
      if (!form.fixedPriceAmount || Number(form.fixedPriceAmount) <= 0) {
        setFormError('Enter the deal price, in rupees.');
        return;
      }
      if (!form.minDurationHours || form.minDurationHours < 1) {
        setFormError('Enter how many hours this deal covers.');
        return;
      }
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
    if (form.kheloCode && form.kheloCode.length < 4) {
      setFormError('KHELO code must be at least 4 characters.');
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
    <div className="flex flex-col gap-6">
      <OwnerPageHeader
        title="Offers"
        description="Run a discount, a fixed-price deal, or a flat amount off. It applies automatically at checkout — and each one also gets a code you can share or print as a QR."
        action={
          <Button
            variant="primary"
            size="md"
            onClick={openCreate}
            className="w-full justify-center gap-2 sm:w-auto"
            disabled={!cafeId}
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            <span>New offer</span>
          </Button>
        }
      />

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
          title="No offers running"
          description="A discount or a fixed-price deal is a good way to fill quiet hours — say 20% off weekday afternoons, or '4 hours for ₹360'. Customers see the lower price straight away."
          actionLabel="Create your first offer"
          onAction={openCreate}
        />
      )}

      {!isLoading && !isError && promotions.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {promotions.map((p) => {
            const status = promotionStatus(p);
            const cardTier = p.applicableTierId ? tiers.find((t) => t.id === p.applicableTierId) : null;
            const tierName = cardTier?.name ?? null;
            const cardRegularPrice =
              p.promotionType === 'fixed_price' && cardTier && p.minDurationHours != null
                ? cardTier.pricePerHour * p.minDurationHours
                : null;
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
                    {p.promotionType === 'percentage' && (
                      <span className="text-h3 font-heading font-bold text-primary">{p.discountPercentage}% OFF</span>
                    )}
                    {p.promotionType === 'fixed_amount' && (
                      <span className="text-h3 font-heading font-bold text-primary">₹{p.fixedDiscountAmount} OFF</span>
                    )}
                    {p.promotionType === 'fixed_price' && (
                      <span className="text-h3 font-heading font-bold text-primary">
                        {p.minDurationHours}h for ₹{p.fixedPriceAmount}
                        {cardRegularPrice != null && (
                          <span className="ml-1.5 text-caption font-normal text-text-secondary line-through">₹{cardRegularPrice}</span>
                        )}
                      </span>
                    )}
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

                  {p.kheloCode && (
                    <div className="flex flex-col gap-2 p-3 rounded-xl bg-accent/5 border border-accent/20">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <Tag className="h-3.5 w-3.5 text-accent flex-shrink-0" />
                          <span className="font-data font-bold tracking-wider text-text-primary truncate">{p.kheloCode}</span>
                        </div>
                        <div className="flex flex-shrink-0 items-center gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => copyCode(p.id, p.kheloCode!)}
                            className="gap-1"
                          >
                            <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                            {copiedId === p.id ? 'Copied' : 'Copy'}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setQrTargetId((cur) => (cur === p.id ? null : p.id))}
                            className="gap-1"
                          >
                            <QrCode className="h-3.5 w-3.5" aria-hidden="true" />
                            {qrTargetId === p.id ? 'Hide QR' : 'Show QR'}
                          </Button>
                        </div>
                      </div>
                      {qrTargetId === p.id && (
                        <div className="flex flex-col items-center gap-1.5 pt-1">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={qrImageUrl(redeemUrl(p.kheloCode))}
                            alt={`QR code for KHELO code ${p.kheloCode}`}
                            width={140}
                            height={140}
                            className="rounded-lg bg-white p-1.5 border border-border"
                          />
                          <span className="text-caption text-text-secondary text-center">
                            Scanning opens KHELO and applies this code after sign-in
                          </span>
                        </div>
                      )}
                    </div>
                  )}

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
                    {p.currentUses === 0 && (
                      <Button
                        variant="destructive-outline"
                        size="sm"
                        onClick={() => { setDeleteTarget(p); setDeleteError(null); }}
                        aria-label="Delete offer"
                        className="flex-shrink-0 px-3"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
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

          <div className="flex flex-col gap-1.5">
            <label className="text-caption font-semibold text-text-primary">What kind of offer are you running? *</label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {TYPE_OPTIONS.map((opt) => {
                const Icon = opt.icon;
                const selected = form.promotionType === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    disabled={typeLocked}
                    onClick={() => setForm((f) => ({ ...f, promotionType: opt.value }))}
                    className={`flex flex-col items-start gap-1 p-3 rounded-xl border text-left transition-colors disabled:opacity-60 disabled:cursor-not-allowed ${
                      selected
                        ? 'border-primary bg-primary/5 ring-1 ring-primary/30'
                        : 'border-border bg-surface hover:bg-surface-hover'
                    }`}
                  >
                    <Icon className={`h-4 w-4 ${selected ? 'text-primary' : 'text-text-secondary'}`} />
                    <span className="text-caption font-semibold text-text-primary">{opt.label}</span>
                    <span className="text-caption text-text-secondary">{opt.hint}</span>
                  </button>
                );
              })}
            </div>
            {typeLocked && (
              <p className="text-caption text-text-secondary">
                This offer has already been redeemed, so its type can&apos;t change. Everything else below is still editable.
              </p>
            )}
          </div>

          <Input
            label="Offer Title *"
            placeholder="e.g. 4 Hours Gaming Deal"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            required
          />
          <Input
            label="Description (shown to gamers)"
            placeholder="e.g. Pay for 3 hours, get the 4th free"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />

          {form.promotionType === 'percentage' && (
            <NumericField
              label="Discount % (1-50) *"
              min={1}
              max={50}
              disabled={typeLocked}
              value={form.discountPercentage}
              onChange={(n) => setForm({ ...form, discountPercentage: n })}
            />
          )}

          {form.promotionType === 'fixed_amount' && (
            <Input
              label="Amount off (₹) *"
              type="number"
              min={1}
              disabled={typeLocked}
              placeholder="e.g. 100"
              value={form.fixedDiscountAmount}
              onChange={(e) => setForm({ ...form, fixedDiscountAmount: e.target.value })}
            />
          )}

          {form.promotionType === 'fixed_price' && (
            <div className="flex flex-col gap-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <NumericField
                  label="Minimum Duration (hours) *"
                  min={1}
                  max={8}
                  disabled={typeLocked}
                  value={form.minDurationHours}
                  onChange={(n) => setForm({ ...form, minDurationHours: n })}
                />
                <Input
                  label="Deal Price (₹) *"
                  type="number"
                  min={1}
                  disabled={typeLocked}
                  placeholder="e.g. 360"
                  value={form.fixedPriceAmount}
                  onChange={(e) => setForm({ ...form, fixedPriceAmount: e.target.value })}
                />
              </div>
              {regularPricePreview != null && (
                <div className="p-3 rounded-xl bg-primary/5 border border-primary/20 text-caption">
                  <span className="text-text-secondary">Regular price: </span>
                  <span className="font-semibold text-text-primary line-through mr-2">₹{regularPricePreview}</span>
                  {savingsPreview != null && form.fixedPriceAmount && (
                    <>
                      <span className="text-text-secondary">Offer price: </span>
                      <span className="font-semibold text-primary mr-2">₹{form.fixedPriceAmount}</span>
                      <span className="font-semibold text-success">Save ₹{savingsPreview}</span>
                    </>
                  )}
                </div>
              )}
              {!selectedTier && (
                <p className="text-caption text-error">Choose a setup below to see the regular price and savings.</p>
              )}
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <label className="text-caption font-semibold text-text-primary">
              Applies To {form.promotionType === 'fixed_price' ? '*' : ''}
            </label>
            <select
              value={form.applicableTierId}
              disabled={typeLocked}
              onChange={(e) => setForm({ ...form, applicableTierId: e.target.value })}
              className="h-10 w-full rounded-xl border border-border bg-card px-3 text-caption text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-60"
            >
              {form.promotionType !== 'fixed_price' && <option value="">All hardware tiers</option>}
              {form.promotionType === 'fixed_price' && <option value="">Choose a setup...</option>}
              {tiers.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
            {form.promotionType === 'fixed_price' && (
              <p className="text-caption text-text-secondary">A fixed-price deal must apply to one specific setup, since its regular price is calculated from that setup&apos;s hourly rate.</p>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Start Date *"
              type="date"
              value={form.validFrom}
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
            <NumericField
              label="Start Hour (0-23) *"
              min={0}
              max={23}
              value={form.startHour}
              onChange={(n) => setForm({ ...form, startHour: n })}
            />
            <NumericField
              label="End Hour (1-24) *"
              min={1}
              max={24}
              value={form.endHour}
              onChange={(n) => setForm({ ...form, endHour: n })}
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
                    onClick={() => toggleDay(idx)}
                    className={`min-w-[44px] h-11 px-2 rounded-xl text-caption font-semibold transition-colors ${
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

          <div className="flex flex-col gap-1.5">
            <label className="text-caption font-semibold text-text-primary">KHELO Code (optional)</label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                placeholder="e.g. WEEKNIGHT15"
                value={form.kheloCode}
                onChange={(e) =>
                  setForm({ ...form, kheloCode: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 20) })
                }
                className="h-10 flex-1 min-w-0 rounded-xl border border-border bg-card px-3 font-data tracking-wider text-caption text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1.5 flex-shrink-0"
                onClick={() => setForm((f) => ({ ...f, kheloCode: generateCode() }))}
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Generate
              </Button>
            </div>
            <p className="text-caption text-text-secondary">
              Lets gamers redeem this offer by code or QR, in addition to it auto-applying at checkout. Uses the same validity window and redemption limit above. 4-20 letters/numbers.
            </p>
          </div>

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

      {/* Delete Confirmation — only reachable for an offer with zero
          redemptions (see the currentUses===0 guard on the Delete button),
          so this never orphans a Booking.promotion_id. */}
      <Modal
        isOpen={!!deleteTarget}
        onClose={() => { setDeleteTarget(null); setDeleteError(null); }}
        title="Delete this offer?"
      >
        {deleteTarget && (
          <div className="flex flex-col gap-4">
            {deleteError && (
              <div className="p-3 rounded-xl bg-error/10 border border-error/20 text-caption text-error flex items-center gap-2">
                <AlertCircle className="h-4 w-4 flex-shrink-0" />
                {deleteError}
              </div>
            )}
            <p className="text-caption text-text-secondary">
              <strong className="text-text-primary">{deleteTarget.title}</strong> will be permanently removed. This can&apos;t be undone — if you might want it back, use Pause instead.
            </p>
            <div className="flex items-center justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => { setDeleteTarget(null); setDeleteError(null); }}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                size="sm"
                isLoading={deleteMut.isPending}
                onClick={() => deleteMut.mutate(deleteTarget.id)}
              >
                Delete Offer
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
