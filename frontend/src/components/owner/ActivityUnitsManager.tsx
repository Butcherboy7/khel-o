'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Wrench, CheckCircle2 } from 'lucide-react';
import { listTierUnits, updateTierUnitStatus } from '@/lib/api/hardwareTierUnits';

interface ActivityUnitsManagerProps {
  cafeId: string;
  tierId: string;
  tierName: string;
}

/** The owner-facing "Table 1 Available / Table 2 Maintenance" view (spec
 *  §6) — reads/writes hardware_tier_units, never touches booking data. A
 *  unit in maintenance is excluded from bookable capacity server-side
 *  (see booking_repository.get_overlapping_bookings_count_with_lock); this
 *  component only toggles that status, it does not compute availability
 *  itself.
 *
 *  Self-hides (renders nothing) for a pooled-capacity activity — one with
 *  no hardware_tier_units rows at all, per the existence-based mode signal
 *  (see Global Constraints in the plan) — since there's nothing to manage
 *  per-unit for e.g. an Arcade Zone. The caller (owner/tiers/page.tsx) can
 *  therefore render this unconditionally for every activity tier without
 *  needing to know its mode itself. A rejected maintenance toggle (booking
 *  conflict, requirement 3) surfaces the backend's error message inline. */
export function ActivityUnitsManager({ cafeId, tierId, tierName }: ActivityUnitsManagerProps) {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['tier-units', tierId],
    queryFn: () => listTierUnits(cafeId, tierId),
    staleTime: 10_000,
  });

  const toggleMut = useMutation({
    mutationFn: ({ unitId, status }: { unitId: string; status: 'available' | 'maintenance' }) =>
      updateTierUnitStatus(cafeId, tierId, unitId, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tier-units', tierId] });
    },
  });

  if (isLoading || !data) {
    return <p className="text-caption text-text-secondary">Loading {tierName} units...</p>;
  }

  if (data.units.length === 0) {
    return null; // pooled-capacity activity — nothing to manage per-unit
  }

  return (
    <div className="flex flex-col gap-1.5 mt-2">
      {toggleMut.isError && (
        <p className="text-caption text-error font-medium">
          {(toggleMut.error as Error)?.message || 'Could not update that unit.'}
        </p>
      )}
      {data.units.map((unit) => {
        const isMaintenance = unit.status === 'maintenance';
        return (
          <div key={unit.id} className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-surface border border-border/60">
            <span className="text-caption font-semibold text-text-primary">{unit.label}</span>
            <button
              type="button"
              disabled={toggleMut.isPending}
              onClick={() =>
                toggleMut.mutate({ unitId: unit.id, status: isMaintenance ? 'available' : 'maintenance' })
              }
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold transition-colors disabled:opacity-50 ${
                isMaintenance
                  ? 'bg-warning/15 text-warning hover:bg-warning/25'
                  : 'bg-success/15 text-success hover:bg-success/25'
              }`}
            >
              {isMaintenance ? <Wrench className="h-3 w-3" /> : <CheckCircle2 className="h-3 w-3" />}
              {isMaintenance ? 'Maintenance' : 'Available'}
            </button>
          </div>
        );
      })}
    </div>
  );
}
