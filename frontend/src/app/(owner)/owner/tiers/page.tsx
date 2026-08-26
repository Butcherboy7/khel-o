'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { listCafeTiers, createTier, updateTier, deleteTier } from '@/lib/api/tiers';
import { getOwnerCafeId } from '@/lib/api/owner';
import { useAuthStore } from '@/store/authStore';
import { queryKeys } from '@/hooks/queries/keys';
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
import type { HardwareTier, TierConfig } from '@/types';
import { Edit, AlertCircle, Power, PowerOff, Plus, Zap } from 'lucide-react';

export default function HardwareTiersPage() {
  const queryClient = useQueryClient();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [deactivateTarget, setDeactivateTarget] = useState<HardwareTier | null>(null);

  // Form State
  const [editingTierId, setEditingTierId] = useState<string | null>(null);
  const [configs, setConfigs] = useState<TierConfig[]>([]);
  const [formError, setFormError] = useState<string | null>(null);

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
      return createTier(targetId, {
        specs: {},
        totalSeats: config.totalSeats,
        appBookableSeats: config.appBookableSeats,
        pricePerHour: config.pricePerHour,
        platform: config.platform,
        model: config.model,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['owner-hardware-tiers'] });
      setIsModalOpen(false);
      resetForm();
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
      return updateTier(targetId, editingTierId!, {
        totalSeats: config.totalSeats,
        appBookableSeats: config.appBookableSeats,
        pricePerHour: config.pricePerHour,
        platform: config.platform,
        model: config.model,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['owner-hardware-tiers'] });
      setIsModalOpen(false);
      resetForm();
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
  };

  const handleOpenEdit = (tier: HardwareTier) => {
    setEditingTierId(tier.id);
    setConfigs([{
      id: tier.id,
      platform: tier.platform || 'other',
      model: tier.model || tier.name,
      totalSeats: tier.totalSeats,
      appBookableSeats: tier.appBookableSeats,
      pricePerHour: tier.pricePerHour,
    }]);
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
      setFormError('App bookable seats cannot exceed total seats.');
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
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-heading text-h1 text-text-primary">Hardware Tiers</h1>
          <p className="text-body text-text-secondary mt-0.5">
            Define PC specs, seat count, app-bookable vs walk-in quota, and hourly rates.
          </p>
        </div>

        <Button
          variant="primary"
          size="md"
          onClick={() => {
            resetForm();
            setIsModalOpen(true);
          }}
          className="gap-2 w-full sm:w-auto justify-center whitespace-nowrap"
        >
          <Plus className="h-4 w-4" />
          <span>+ Add Tier</span>
        </Button>
      </div>

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
            title="Failed to load hardware tiers"
            message={(error as Error)?.message || 'Could not fetch hardware configurations.'}
            onRetry={() => refetch()}
          />
        )}

        {!isLoading && !isError && tiers.length === 0 && (
          <EmptyState
            title="No Hardware Tiers Configured"
            description="Create your first tier (e.g. Esports Starter, RTX 4090 Ultra) to allow gamers to book your stations."
            actionLabel="Add First Hardware Tier"
            onAction={() => {
              resetForm();
              setIsModalOpen(true);
            }}
          />
        )}

        {!isLoading && !isError && tiers.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {tiers.map((tier) => (
              <Card key={tier.id} elevation="resting" className="overflow-hidden">
                <CardContent className="p-5 flex flex-col gap-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="font-heading text-h3 text-text-primary">{tier.name}</h3>
                      <div className="flex flex-col gap-0.5 mt-0.5">
                        <p className="text-caption text-text-secondary">
                          Total Capacity: <span className="font-semibold text-text-primary">{tier.totalSeats} Stations</span>
                        </p>
                        <div className="flex items-center gap-2 text-xs font-semibold">
                          <span className="text-emerald-500 bg-emerald-500/10 px-2 py-0.5 rounded-md">
                            📱 {tier.appBookableSeats} App Bookable
                          </span>
                          <span className="text-amber-500 bg-amber-500/10 px-2 py-0.5 rounded-md">
                            🚶 {Math.max(0, tier.totalSeats - tier.appBookableSeats)} Walk-in Reserved
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleOpenEdit(tier)}
                        className="p-1.5 h-8 w-8 text-text-secondary hover:text-text-primary"
                        title="Edit Tier & Seat Allocations"
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      {tier.isActive ? (
                        <button
                          type="button"
                          onClick={() => setDeactivateTarget(tier)}
                          title="Deactivate tier — hides it from booking, doesn't delete data"
                          className="h-8 w-8 rounded-lg flex items-center justify-center text-text-secondary hover:bg-error/10 hover:text-error transition-colors"
                        >
                          <PowerOff className="h-4 w-4" />
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => reactivateMutation.mutate(tier.id)}
                          disabled={reactivateMutation.isPending && reactivateMutation.variables === tier.id}
                          title="Reactivate tier"
                          className="h-8 w-8 rounded-lg flex items-center justify-center text-text-secondary hover:bg-success/10 hover:text-success transition-colors disabled:opacity-50"
                        >
                          <Power className="h-4 w-4" />
                        </button>
                      )}
                      <Badge variant={tier.isActive ? 'success' : 'default'}>
                        {tier.isActive ? 'Active' : 'Disabled'}
                      </Badge>
                    </div>
                  </div>

                  {tier.model && (
                    <div className="flex items-center gap-1.5 text-caption font-semibold text-text-primary bg-surface p-3 rounded-xl">
                      <Zap className="h-3.5 w-3.5 text-primary flex-shrink-0" />
                      <span>{tier.model}</span>
                    </div>
                  )}

                  <div className="flex items-center justify-between border-t border-border pt-3">
                    <PriceDisplay amount={tier.pricePerHour} size="md" />
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleOpenEdit(tier)}
                      className="gap-1 text-xs"
                    >
                      <Edit className="h-3 w-3" />
                      <span>Edit Seats & Price</span>
                    </Button>
                  </div>
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
        title={editingTierId ? 'Edit Hardware Tier & Seat Quota' : 'Add Hardware Tier'}
        description="Configure station specs, total seats, app-bookable vs walk-in quota, and hourly rates."
      >
        <form onSubmit={handleFormSubmit} className="flex flex-col gap-4">
          {formError && (
            <div className="p-3 rounded-xl bg-error/10 border border-error/20 text-caption text-error">
              {formError}
            </div>
          )}

          <PlatformTierConfigurator configs={configs} onChange={setConfigs} />

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
              {editingTierId ? 'Save Changes' : 'Create Hardware Tier'}
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
