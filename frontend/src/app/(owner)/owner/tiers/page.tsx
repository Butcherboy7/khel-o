'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Monitor, Cpu, HardDrive, Zap, Tag, Edit, AlertCircle, Power, PowerOff } from 'lucide-react';
import { listCafeTiers, createTier, updateTier, deleteTier } from '@/lib/api/tiers';
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

const POPULAR_GPUS = [
  'NVIDIA RTX 4090 (24GB VRAM)',
  'NVIDIA RTX 4080 Super (16GB VRAM)',
  'NVIDIA RTX 4070 Ti Super (16GB VRAM)',
  'NVIDIA RTX 4070 (12GB VRAM)',
  'NVIDIA RTX 3070 Ti (8GB VRAM)',
  'NVIDIA RTX 3060 (12GB VRAM)',
  'AMD Radeon RX 7900 XTX (24GB)',
  'PlayStation 5 Console',
  'Xbox Series X Console',
  'Custom GPU (Type custom GPU below)',
];

const POPULAR_CPUS = [
  'Intel Core i9-14900KS (5.9GHz)',
  'Intel Core i7-14700K (20 Cores)',
  'Intel Core i7-13700K (16 Cores)',
  'AMD Ryzen 7 7800X3D (Esports King)',
  'AMD Ryzen 9 7950X3D (16 Cores)',
  'Intel Core i5-13400F',
  'PS5 Custom AMD Zen 2 CPU',
  'Custom CPU (Type custom CPU below)',
];

const POPULAR_MONITORS = [
  'BenQ ZOWIE XL2566K (360Hz Esports)',
  'ASUS ROG Swift 240Hz QHD OLED',
  'LG Ultragear 240Hz 1ms IPS',
  'BenQ ZOWIE 144Hz 1ms Gaming',
  'Samsung Odyssey G7 240Hz Curved',
  'LG 55" 4K OLED HDR TV (PS5)',
  'Custom Monitor (Type custom monitor below)',
];

export default function HardwareTiersPage() {
  const queryClient = useQueryClient();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [deactivateTarget, setDeactivateTarget] = useState<HardwareTier | null>(null);

  // Form State
  const [editingTierId, setEditingTierId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [gpu, setGpu] = useState('NVIDIA RTX 4070');
  const [cpu, setCpu] = useState('Intel Core i7-13700K');
  const [ram, setRam] = useState('32GB DDR5');
  const [monitor, setMonitor] = useState('240Hz 1440p');
  const [totalSeats, setTotalSeats] = useState(10);
  const [appBookableSeats, setAppBookableSeats] = useState(8);
  const [pricePerHour, setPricePerHour] = useState(120);
  const [presetCategory, setPresetCategory] = useState<PresetCategory>('pro_gaming');
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
      return createTier(targetId, {
        name,
        specs: { gpu, cpu, ram, monitor },
        totalSeats: Number(totalSeats),
        appBookableSeats: Number(appBookableSeats),
        presetCategory,
        pricePerHour: Number(pricePerHour),
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
      return updateTier(targetId, editingTierId!, {
        name,
        specs: { gpu, cpu, ram, monitor },
        totalSeats: Number(totalSeats),
        appBookableSeats: Number(appBookableSeats),
        pricePerHour: Number(pricePerHour),
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
    setName('');
    setGpu('NVIDIA RTX 4070');
    setCpu('Intel Core i7-13700K');
    setRam('32GB DDR5');
    setMonitor('240Hz 1440p');
    setTotalSeats(10);
    setAppBookableSeats(8);
    setPricePerHour(120);
    setFormError(null);
  };

  const handleOpenEdit = (tier: HardwareTier) => {
    setEditingTierId(tier.id);
    setName(tier.name);
    setGpu(tier.specs?.gpu || 'NVIDIA RTX 4070');
    setCpu(tier.specs?.cpu || 'Intel Core i7-13700K');
    setRam(tier.specs?.ram || '32GB DDR5');
    setMonitor(tier.specs?.monitor || '240Hz 1440p');
    setTotalSeats(tier.totalSeats);
    setAppBookableSeats(tier.appBookableSeats ?? tier.totalSeats);
    setPricePerHour(tier.pricePerHour);
    setFormError(null);
    setIsModalOpen(true);
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !pricePerHour || !totalSeats) {
      setFormError('Please fill in all required fields.');
      return;
    }
    if (appBookableSeats > totalSeats) {
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
      <div className="flex items-center justify-between">
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

          <Input
            label="Tier Name *"
            placeholder="e.g. RTX 4090 Ultra VIP Pod"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />

          {/* Dropdowns for GPU, CPU, Monitor matching Onboarding */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {/* GPU Selector */}
            <div className="flex flex-col gap-1.5">
              <label className="text-caption font-semibold text-text-primary">GPU / Graphics Card *</label>
              <select
                value={POPULAR_GPUS.includes(gpu) ? gpu : 'Custom GPU (Type custom GPU below)'}
                onChange={(e) => {
                  const val = e.target.value;
                  setGpu(val.includes('Custom') ? 'NVIDIA RTX 4070' : val);
                }}
                className="flex h-10 w-full rounded-xl border border-border bg-card px-3 py-2 text-caption text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
              >
                {POPULAR_GPUS.map((g) => (
                  <option key={g} value={g}>{g}</option>
                ))}
              </select>
              {!POPULAR_GPUS.includes(gpu) && (
                <Input
                  placeholder="Type custom GPU..."
                  value={gpu}
                  onChange={(e) => setGpu(e.target.value)}
                />
              )}
            </div>

            {/* CPU Selector */}
            <div className="flex flex-col gap-1.5">
              <label className="text-caption font-semibold text-text-primary">CPU / Processor</label>
              <select
                value={POPULAR_CPUS.includes(cpu) ? cpu : 'Custom CPU (Type custom CPU below)'}
                onChange={(e) => {
                  const val = e.target.value;
                  setCpu(val.includes('Custom') ? 'Intel Core i7-13700K' : val);
                }}
                className="flex h-10 w-full rounded-xl border border-border bg-card px-3 py-2 text-caption text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
              >
                {POPULAR_CPUS.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
              {!POPULAR_CPUS.includes(cpu) && (
                <Input
                  placeholder="Type custom CPU..."
                  value={cpu}
                  onChange={(e) => setCpu(e.target.value)}
                />
              )}
            </div>

            {/* Monitor Selector */}
            <div className="flex flex-col gap-1.5">
              <label className="text-caption font-semibold text-text-primary">Monitor / Display</label>
              <select
                value={POPULAR_MONITORS.includes(monitor) ? monitor : 'Custom Monitor (Type custom monitor below)'}
                onChange={(e) => {
                  const val = e.target.value;
                  setMonitor(val.includes('Custom') ? '240Hz Display' : val);
                }}
                className="flex h-10 w-full rounded-xl border border-border bg-card px-3 py-2 text-caption text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
              >
                {POPULAR_MONITORS.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
              {!POPULAR_MONITORS.includes(monitor) && (
                <Input
                  placeholder="Type custom monitor..."
                  value={monitor}
                  onChange={(e) => setMonitor(e.target.value)}
                />
              )}
            </div>
          </div>

          <Input
            label="RAM Memory"
            placeholder="e.g. 32GB DDR5"
            value={ram}
            onChange={(e) => setRam(e.target.value)}
          />

          <div className="p-3 bg-surface rounded-xl border border-border/80 flex flex-col gap-3">
            <span className="text-xs font-semibold text-text-primary uppercase tracking-wider">
              Seat Quota Allocation (App vs Walk-in)
            </span>
            <div className="grid grid-cols-2 gap-3">
              <Input
                label="Total Physical Stations *"
                type="number"
                min="1"
                value={totalSeats}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  setTotalSeats(val);
                  if (appBookableSeats > val) {
                    setAppBookableSeats(val);
                  }
                }}
                required
              />
              <Input
                label="App-Bookable Seats *"
                type="number"
                min="0"
                max={totalSeats}
                value={appBookableSeats}
                onChange={(e) => setAppBookableSeats(Number(e.target.value))}
                required
              />
            </div>
            <div className="flex items-center justify-between text-xs text-text-secondary px-1">
              <span>🚶 Walk-in Reserved: <strong className="text-amber-500 font-bold">{Math.max(0, totalSeats - appBookableSeats)} Stations</strong></span>
              <span>📱 App Bookable: <strong className="text-emerald-500 font-bold">{appBookableSeats} Stations</strong></span>
            </div>
          </div>

          <Input
            label="Price per Hour (₹) *"
            type="number"
            min="1"
            value={pricePerHour}
            onChange={(e) => setPricePerHour(Number(e.target.value))}
            required
          />

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-border">
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setIsModalOpen(false);
                resetForm();
              }}
            >
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
