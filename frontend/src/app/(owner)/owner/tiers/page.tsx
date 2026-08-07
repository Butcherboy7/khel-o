'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Monitor, Cpu, HardDrive, Zap, Tag, Edit, AlertCircle } from 'lucide-react';
import { listCafeTiers, createTier, updateTier } from '@/lib/api/tiers';
import { getOwnerCafeId } from '@/lib/api/owner';
import { useAuthStore } from '@/store/authStore';
import { queryKeys } from '@/hooks/queries/keys';
import {
  Button,
  Input,
  Card,
  CardContent,
  PriceDisplay,
  Badge,
  Modal,
  SkeletonCard,
  ErrorState,
  EmptyState,
} from '@/components/ui';
import type { HardwareTier, PresetCategory } from '@/types';

export default function HardwareTiersPage() {
  const queryClient = useQueryClient();
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Form State
  const [name, setName] = useState('');
  const [gpu, setGpu] = useState('NVIDIA RTX 4070');
  const [cpu, setCpu] = useState('Intel Core i7-13700K');
  const [ram, setRam] = useState('32GB DDR5');
  const [monitor, setMonitor] = useState('240Hz 1440p');
  const [totalSeats, setTotalSeats] = useState(10);
  const [pricePerHour, setPricePerHour] = useState(120);
  const [presetCategory, setPresetCategory] = useState<PresetCategory>('pro_gaming');
  const [formError, setFormError] = useState<string | null>(null);

  const cafeId = useAuthStore((s) => s.user?.cafeId) || '';
  
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: queryKeys.cafes.tiers(cafeId),
    queryFn: async () => {
      if (!cafeId) {
        const cafeData = await getOwnerCafeId();
        return (await listCafeTiers(cafeData.cafeId)).hardwareTiers;
      }
      return (await listCafeTiers(cafeId)).hardwareTiers;
    },
    enabled: Boolean(cafeId) || true,
  });

  const tiers = data || [];

  // Create Tier Mutation
  const createMutation = useMutation({
    mutationFn: () =>
      createTier(cafeId, {
        name,
        specs: { gpu, cpu, ram, monitor },
        totalSeats: Number(totalSeats),
        appBookableSeats: Number(totalSeats),
        presetCategory,
        pricePerHour: Number(pricePerHour),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.cafes.tiers(cafeId) });
      setIsModalOpen(false);
      resetForm();
    },
    onError: (err: any) => {
      setFormError(err?.message || 'Failed to create tier.');
    },
  });

  const resetForm = () => {
    setName('');
    setGpu('NVIDIA RTX 4070');
    setCpu('Intel Core i7-13700K');
    setRam('32GB DDR5');
    setMonitor('240Hz 1440p');
    setTotalSeats(10);
    setPricePerHour(120);
    setFormError(null);
  };

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !pricePerHour || !totalSeats) {
      setFormError('Please fill in all required fields.');
      return;
    }
    createMutation.mutate();
  };

  return (
    <div className="flex flex-col gap-6 pb-12">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-h1 text-text-primary">Hardware Tiers</h1>
          <p className="text-body text-text-secondary mt-0.5">
            Define PC specs, seat count, and hourly rates for your stations.
          </p>
        </div>

        <Button
          variant="primary"
          size="md"
          onClick={() => setIsModalOpen(true)}
          className="gap-2"
        >
          <Plus className="h-4 w-4" />
          <span>Add New Tier</span>
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
            onAction={() => setIsModalOpen(true)}
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
                      <p className="text-caption text-text-secondary">
                        {tier.totalSeats} Total Stations ({tier.appBookableSeats} Bookable via App)
                      </p>
                    </div>
                    <Badge variant={tier.isActive ? 'success' : 'default'}>
                      {tier.isActive ? 'Active' : 'Disabled'}
                    </Badge>
                  </div>

                  {/* Spec List */}
                  <div className="grid grid-cols-2 gap-2 text-caption bg-surface p-3 rounded-xl">
                    <div className="flex items-center gap-1.5 font-semibold text-text-primary">
                      <Zap className="h-3.5 w-3.5 text-primary flex-shrink-0" />
                      <span>{tier.specs?.gpu || 'N/A'}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-text-secondary">
                      <Cpu className="h-3.5 w-3.5 text-text-secondary flex-shrink-0" />
                      <span>{tier.specs?.cpu || 'N/A'}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-text-secondary">
                      <HardDrive className="h-3.5 w-3.5 text-text-secondary flex-shrink-0" />
                      <span>{tier.specs?.ram || 'N/A'}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-text-secondary">
                      <Monitor className="h-3.5 w-3.5 text-text-secondary flex-shrink-0" />
                      <span>{tier.specs?.monitor || 'N/A'}</span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between border-t border-border pt-3">
                    <PriceDisplay amount={tier.pricePerHour} size="md" />
                    <span className="text-caption text-text-secondary font-medium">
                      Category: {tier.presetCategory || 'Custom'}
                    </span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Create Tier Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Add Hardware Tier"
        description="Configure station specs and pricing."
      >
        <form onSubmit={handleCreateSubmit} className="flex flex-col gap-4">
          {formError && (
            <div className="p-3 rounded-xl bg-error/10 border border-error/20 text-caption text-error">
              {formError}
            </div>
          )}

          <Input
            label="Tier Name *"
            placeholder="e.g. RTX 4090 Ultra VIP Pod"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />

          <div className="grid grid-cols-2 gap-3">
            <Input
              label="GPU *"
              placeholder="NVIDIA RTX 4080"
              value={gpu}
              onChange={(e) => setGpu(e.target.value)}
              required
            />
            <Input
              label="CPU"
              placeholder="Intel Core i9"
              value={cpu}
              onChange={(e) => setCpu(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Input
              label="RAM"
              placeholder="32GB DDR5"
              value={ram}
              onChange={(e) => setRam(e.target.value)}
            />
            <Input
              label="Monitor Display"
              placeholder="240Hz 1440p"
              value={monitor}
              onChange={(e) => setMonitor(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Total Seats *"
              type="number"
              min="1"
              value={totalSeats}
              onChange={(e) => setTotalSeats(Number(e.target.value))}
              required
            />
            <Input
              label="Price per Hour (₹) *"
              type="number"
              min="1"
              value={pricePerHour}
              onChange={(e) => setPricePerHour(Number(e.target.value))}
              required
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-border">
            <Button type="button" variant="ghost" onClick={() => setIsModalOpen(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              isLoading={createMutation.isPending}
              loadingText="Creating..."
            >
              Create Hardware Tier
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
