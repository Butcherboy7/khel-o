'use client';

import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { listCafeTiers, createTier, updateTier, deleteTier } from '@/lib/api/tiers';
import { getOwnerCafeId } from '@/lib/api/owner';
import { useAuthStore } from '@/store/authStore';
import { queryKeys } from '@/hooks/queries/keys';
import { cn } from '@/lib/cn';
import {
  Button,
  Card,
  CardContent,
  PriceDisplay,
  Badge,
  Modal,
  SkeletonCard,
  ErrorState,
  EmptyState,
} from '@/components/ui';
import { PlatformTierConfigurator } from '@/components/owner/PlatformTierConfigurator';
import { ActivityUnitsManager } from '@/components/owner/ActivityUnitsManager';
import { OwnerPageHeader } from '@/components/owner/OwnerPageHeader';
import type { HardwareTier, TierConfig, TierCreateRequest, TierUpdateRequest } from '@/types';
import { Edit, AlertCircle, Power, PowerOff, Plus, Zap, ChevronDown, ChevronUp, CheckCircle2 } from 'lucide-react';

export default function HardwareTiersPage() {
  const queryClient = useQueryClient();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [deactivateTarget, setDeactivateTarget] = useState<HardwareTier | null>(null);
  const [expandedUnitsTierId, setExpandedUnitsTierId] = useState<string | null>(null);

  // Lightweight, dependency-free success feedback for create/update — the
  // codebase has no toast library in place yet, so this is a small
  // self-dismissing banner plus a brief highlight on the affected card
  // (which lands at the top of the list — see the backend's newest-first
  // ordering — so the highlight itself doubles as "look, it's right here").
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [highlightedTierId, setHighlightedTierId] = useState<string | null>(null);
  useEffect(() => {
    if (!toastMessage) return;
    const t = setTimeout(() => setToastMessage(null), 3000);
    return () => clearTimeout(t);
  }, [toastMessage]);
  useEffect(() => {
    if (!highlightedTierId) return;
    const t = setTimeout(() => setHighlightedTierId(null), 2200);
    return () => clearTimeout(t);
  }, [highlightedTierId]);

  // Form State
  const [editingTierId, setEditingTierId] = useState<string | null>(null);
  const [configs, setConfigs] = useState<TierConfig[]>([]);
  const [formError, setFormError] = useState<string | null>(null);
  // Set only when editing an un-migrated (platform=NULL) tier: the real
  // seats/price to carry over onto whichever platform the owner explicitly
  // picks next, since the configurator starts empty for these (see
  // handleOpenEdit) and a fresh platform pick would otherwise default to
  // the configurator's generic seats/price instead of this tier's actual
  // values.
  const [legacyTierDefaults, setLegacyTierDefaults] = useState<{
    totalSeats: number;
    appBookableSeats: number;
    pricePerHour: number;
  } | null>(null);

  const storeCafeId = useAuthStore((s) => s.user?.cafeId);
  const [resolvedCafeId, setResolvedCafeId] = useState<string>(storeCafeId || '');

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['owner-hardware-tiers', resolvedCafeId || storeCafeId || 'my-cafe'],
    queryFn: async () => {
      let activeCafeId = resolvedCafeId || storeCafeId;
      if (!activeCafeId) {
        const cafeData = await getOwnerCafeId();
        activeCafeId = cafeData?.cafeId;
        if (activeCafeId) setResolvedCafeId(activeCafeId);
      }
      if (!activeCafeId) {
        throw new Error('No verified café associated with your owner account.');
      }
      const res = await listCafeTiers(activeCafeId);
      return res.hardwareTiers;
    },
    enabled: true,
  });

  const tiers = data || [];

  const getActiveCafeId = async () => {
    let activeId = resolvedCafeId || storeCafeId;
    if (!activeId) {
      const cafeData = await getOwnerCafeId();
      activeId = cafeData?.cafeId;
      if (activeId) setResolvedCafeId(activeId);
    }
    return activeId;
  };

  // Create Tier Mutation
  const createMutation = useMutation({
    mutationFn: async () => {
      const targetId = await getActiveCafeId();
      const config = configs[0];
      const payload: TierCreateRequest =
        config.tierType === 'activity'
          ? {
              name: config.activityKind || 'Activity',
              totalSeats: config.totalSeats,
              appBookableSeats: config.appBookableSeats,
              pricePerHour: config.pricePerHour,
              specs: {},
              tierType: 'activity',
              activityKind: config.activityKind,
              individualUnits: config.individualUnits,
            }
          : {
              specs: {},
              totalSeats: config.totalSeats,
              appBookableSeats: config.appBookableSeats,
              pricePerHour: config.pricePerHour,
              platform: config.platform,
              model: config.model,
            };
      return createTier(targetId, payload);
    },
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['owner-hardware-tiers'] });
      setIsModalOpen(false);
      resetForm();
      setToastMessage('Resource created');
      setHighlightedTierId(res.hardwareTier?.id ?? null);
    },
    onError: (err: any) => {
      setFormError(err?.message || 'Failed to create tier.');
    },
  });

  // Update Tier Mutation
  const updateMutation = useMutation({
    mutationFn: async () => {
      const targetId = await getActiveCafeId();
      const config = configs[0];
      // Note: individualUnits is create-only (backend individual_units field
      // has no effect after creation) and TierUpdateRequest deliberately has
      // no tierType field, so neither is included here.
      const payload: TierUpdateRequest =
        config.tierType === 'activity'
          ? {
              name: config.activityKind || 'Activity',
              totalSeats: config.totalSeats,
              appBookableSeats: config.appBookableSeats,
              pricePerHour: config.pricePerHour,
              specs: {},
              activityKind: config.activityKind,
            }
          : {
              totalSeats: config.totalSeats,
              appBookableSeats: config.appBookableSeats,
              pricePerHour: config.pricePerHour,
              platform: config.platform,
              model: config.model,
            };
      return updateTier(targetId, editingTierId!, payload);
    },
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['owner-hardware-tiers'] });
      setIsModalOpen(false);
      resetForm();
      setToastMessage('Resource updated');
      setHighlightedTierId(res.hardwareTier?.id ?? null);
    },
    onError: (err: any) => {
      setFormError(err?.message || 'Failed to update tier.');
    },
  });

  // Deactivate Tier Mutation
  const deactivateMutation = useMutation({
    mutationFn: async (tierId: string) => {
      const targetId = await getActiveCafeId();
      return deleteTier(targetId, tierId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['owner-hardware-tiers'] });
      setDeactivateTarget(null);
    },
  });

  // Reactivate Tier Mutation
  const reactivateMutation = useMutation({
    mutationFn: async (tierId: string) => {
      const targetId = await getActiveCafeId();
      return updateTier(targetId, tierId, { isActive: true });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['owner-hardware-tiers'] });
    },
  });

  const resetForm = () => {
    setEditingTierId(null);
    setConfigs([]);
    setFormError(null);
    setLegacyTierDefaults(null);
  };

  const handleOpenEdit = (tier: HardwareTier) => {
    setEditingTierId(tier.id);
    if (tier.tierType === 'activity') {
      // Activity tiers always have platform=null by design (they're not a
      // gaming platform at all), so they must never fall into the
      // legacy-migration "un-migrated tier" branch below — that branch
      // opens an empty configurator with gaming platform chips and no
      // activity data loaded (see final-review.md I3).
      //
      // individualUnits is create-only — HardwareTier (the read-back type)
      // doesn't carry a units count, so there's no reliable signal here for
      // whether this tier currently uses individual units or pooled
      // capacity. Default to `true` (the more common/manageable choice for
      // a multi-unit activity like Snooker tables); the toggle itself
      // remains editable in the form, so this only affects the initial
      // pre-filled state, not correctness of the tier's real name/
      // quantity/price, which all load from the tier as-is.
      setConfigs([{
        id: tier.id,
        platform: 'other',
        model: tier.activityKind || tier.name,
        totalSeats: tier.totalSeats,
        appBookableSeats: tier.appBookableSeats,
        pricePerHour: tier.pricePerHour,
        tierType: 'activity',
        activityKind: tier.activityKind ?? undefined,
        individualUnits: true,
      }]);
      setLegacyTierDefaults(null);
    } else if (tier.platform && tier.model) {
      setConfigs([{
        id: tier.id,
        platform: tier.platform,
        model: tier.model,
        totalSeats: tier.totalSeats,
        appBookableSeats: tier.appBookableSeats,
        pricePerHour: tier.pricePerHour,
        tierType: tier.tierType,
        activityKind: tier.activityKind ?? undefined,
      }]);
      setLegacyTierDefaults(null);
    } else {
      // Un-migrated tier: never default platform to 'other' — that silently
      // coerces the tier to platform:'other', model: tier.name on save,
      // overwriting its real specs with {"other": "<its own name>"} and
      // flipping the customer-facing badge to a false console claim (see
      // final-review.md I3, BUG #3's exact symptom via a new route). Leave
      // the configurator empty; the owner must explicitly pick a real
      // platform. handleFormSubmit already blocks Save while configs is
      // empty. The tier's real seats/price are preserved in
      // legacyTierDefaults and merged in once a platform is picked (see the
      // PlatformTierConfigurator onChange below), so choosing a platform
      // doesn't silently reset them to the configurator's generic defaults.
      setConfigs([]);
      setLegacyTierDefaults({
        totalSeats: tier.totalSeats,
        appBookableSeats: tier.appBookableSeats,
        pricePerHour: tier.pricePerHour,
      });
    }
    setFormError(null);
    setIsModalOpen(true);
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (configs.length === 0) {
      setFormError('Please configure at least one platform.');
      return;
    }
    const config = configs[0];
    if (!config.model || !config.pricePerHour || !config.totalSeats) {
      setFormError('Please fill in all required fields.');
      return;
    }
    if (config.appBookableSeats > config.totalSeats) {
      setFormError('App bookable units cannot exceed total units.');
      return;
    }
    if (editingTierId) {
      updateMutation.mutate();
    } else {
      createMutation.mutate();
    }
  };

  return (
    <div className="flex flex-col gap-6 pb-12">
      {/* Success toast */}
      {toastMessage && (
        <div
          role="status"
          className="fixed top-4 right-4 z-50 flex items-center gap-2 px-4 py-3 rounded-xl bg-success text-white shadow-float animate-in fade-in slide-in-from-top-2 duration-300"
        >
          <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
          <span className="text-caption font-semibold">{toastMessage}</span>
        </div>
      )}

      <OwnerPageHeader
        title="Resources & Pricing"
        description="Group your machines by what they are — gaming PCs, PS5s, a snooker table — and set an hourly rate for each group."
        action={
          <Button
            variant="primary"
            size="md"
            onClick={() => {
              resetForm();
              setIsModalOpen(true);
            }}
            className="w-full justify-center gap-2 whitespace-nowrap sm:w-auto"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            <span>Add a group</span>
          </Button>
        }
      />

      {/* Tiers Grid */}
      <div className="min-h-[300px]">
        {isLoading && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <SkeletonCard />
            <SkeletonCard />
          </div>
        )}

        {isError && (
          <ErrorState
            title="Failed to load resources"
            message={(error as Error)?.message || 'Could not fetch resource configurations.'}
            onRetry={() => refetch()}
          />
        )}

        {!isLoading && !isError && tiers.length === 0 && (
          <EmptyState
            title="No resources set up yet"
            description="Add a group for each kind of resource you have — say “Gaming PCs” or “PS5”. Customers can't book until at least one group exists."
            actionLabel="Add your first group"
            onAction={() => {
              resetForm();
              setIsModalOpen(true);
            }}
          />
        )}

        {!isLoading && !isError && tiers.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {tiers.map((tier) => (
              <Card
                key={tier.id}
                elevation="resting"
                className={cn(
                  'overflow-hidden transition-all duration-700',
                  highlightedTierId === tier.id && 'ring-2 ring-success ring-offset-2 ring-offset-background'
                )}
              >
                <CardContent className="flex flex-col gap-4 p-4 sm:p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="font-heading text-h3 text-text-primary">{tier.name}</h3>
                      <p className="mt-0.5 text-caption text-text-secondary">
                        {tier.totalSeats} {tier.totalSeats === 1 ? 'unit' : 'units'} in total
                      </p>
                    </div>
                    <Badge variant={tier.isActive ? 'success' : 'default'} className="mt-1">
                      {tier.isActive ? 'On' : 'Off'}
                    </Badge>
                  </div>

                  {/* The split between online-bookable and walk-in seats, said in
                      a sentence. Two coloured chips carrying emoji (📱 / 🚶) wrapped
                      to three ragged lines on a phone and left the owner guessing
                      what the pictures meant. */}
                  <dl className="grid grid-cols-2 gap-2">
                    <div className="rounded-xl bg-surface px-3 py-2">
                      <dt className="text-caption text-text-secondary">Bookable in the app</dt>
                      <dd className="font-heading text-h3 text-text-primary">{tier.appBookableSeats}</dd>
                    </div>
                    <div className="rounded-xl bg-surface px-3 py-2">
                      <dt className="text-caption text-text-secondary">Kept for walk-ins</dt>
                      <dd className="font-heading text-h3 text-text-primary">
                        {Math.max(0, tier.totalSeats - tier.appBookableSeats)}
                      </dd>
                    </div>
                  </dl>

                  {tier.model && (
                    <div className="flex items-center gap-1.5 rounded-xl bg-surface p-3 text-caption font-semibold text-text-primary">
                      <Zap className="h-3.5 w-3.5 flex-shrink-0 text-primary" aria-hidden="true" />
                      <span>{tier.model}</span>
                    </div>
                  )}

                  {/* One edit path, named. There used to be a bare pencil icon up
                      in the corner AND this button, doing the same thing — so the
                      card offered two answers to "how do I change the price?". */}
                  <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
                    <PriceDisplay amount={tier.pricePerHour} size="md" />
                    <div className="flex items-center gap-2">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => handleOpenEdit(tier)}
                        className="gap-1.5"
                      >
                        <Edit className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>Edit</span>
                      </Button>
                      {tier.isActive ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setDeactivateTarget(tier)}
                          title="Hides this group from customers. Nothing is deleted."
                          className="gap-1.5"
                        >
                          <PowerOff className="h-3.5 w-3.5" aria-hidden="true" />
                          <span>Turn off</span>
                        </Button>
                      ) : (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => reactivateMutation.mutate(tier.id)}
                          isLoading={reactivateMutation.isPending && reactivateMutation.variables === tier.id}
                          className="gap-1.5"
                        >
                          <Power className="h-3.5 w-3.5" aria-hidden="true" />
                          <span>Turn on</span>
                        </Button>
                      )}
                    </div>
                  </div>

                  {tier.tierType === 'activity' && (
                    <div className="border-t border-border pt-3">
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedUnitsTierId(expandedUnitsTierId === tier.id ? null : tier.id)
                        }
                        className="flex items-center gap-1.5 text-caption font-semibold text-text-secondary hover:text-text-primary transition-colors"
                      >
                        {expandedUnitsTierId === tier.id ? (
                          <ChevronUp className="h-3.5 w-3.5" />
                        ) : (
                          <ChevronDown className="h-3.5 w-3.5" />
                        )}
                        <span>Manage Units</span>
                      </button>
                      {expandedUnitsTierId === tier.id && (
                        <ActivityUnitsManager
                          cafeId={tier.cafeId}
                          tierId={tier.id}
                          tierName={tier.name}
                        />
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Create / Edit Tier Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          resetForm();
        }}
        title={editingTierId ? 'Edit Resource & Unit Quota' : 'Add Resource'}
        description="Configure specs, total units, app-bookable vs walk-in quota, and hourly rates."
      >
        <form onSubmit={handleFormSubmit} className="flex flex-col gap-4">
          {formError && (
            <div className="p-3 rounded-xl bg-error/10 border border-error/20 text-caption text-error">
              {formError}
            </div>
          )}

          <PlatformTierConfigurator
            configs={configs}
            onChange={(next) => {
              if (legacyTierDefaults && next.length > 0) {
                // First platform pick on a legacy tier: carry over its real
                // seats/price instead of the configurator's generic defaults.
                setConfigs(next.map((c) => ({ ...c, ...legacyTierDefaults })));
                setLegacyTierDefaults(null);
              } else {
                setConfigs(next);
              }
            }}
            maxConfigs={1}
          />

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-border">
            <Button type="button" variant="ghost" onClick={() => { setIsModalOpen(false); resetForm(); }}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              isLoading={createMutation.isPending || updateMutation.isPending}
              loadingText={editingTierId ? 'Saving...' : 'Creating...'}
            >
              {editingTierId ? 'Save Changes' : 'Create Resource'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Deactivate Confirmation */}
      <Modal
        isOpen={!!deactivateTarget}
        onClose={() => setDeactivateTarget(null)}
        title="Deactivate this tier?"
      >
        {deactivateTarget && (
          <div className="flex flex-col gap-4">
            <p className="text-caption text-text-secondary">
              <strong className="text-text-primary">{deactivateTarget.name}</strong> will stop appearing to customers for new bookings. Existing bookings on this tier are unaffected, and you can reactivate it anytime.
            </p>
            <div className="flex items-center justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setDeactivateTarget(null)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                size="sm"
                isLoading={deactivateMutation.isPending}
                onClick={() => deactivateMutation.mutate(deactivateTarget.id)}
              >
                Deactivate Tier
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
