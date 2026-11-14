'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Wrench } from 'lucide-react';
import { Button } from '@/components/ui';
import { listTierUnits, markMachineBroken, markMachineFixed } from '@/lib/api/hardwareTierUnits';

/**
 * "PC 7 is broken" for an ordinary PC or console setup. The owner types the name they
 * already use for the machine; nothing is numbered for them and customers never see it.
 * They just see one fewer machine to book until it is marked fixed.
 */
export function BrokenMachines({ cafeId, tierId, isRoom = false, onChanged, initialLabel = '' }: { cafeId: string; tierId: string; isRoom?: boolean; onChanged?: () => void; initialLabel?: string }) {
  const queryClient = useQueryClient();
  // Quick Find can arrive with the machine already typed ("PS5 2"); the owner still taps Mark broken.
  const [label, setLabel] = useState(initialLabel);
  useEffect(() => {
    if (initialLabel) setLabel(initialLabel);
  }, [initialLabel]);
  const key = ['tier-units', tierId];

  const { data } = useQuery({ queryKey: key, queryFn: () => listTierUnits(cafeId, tierId), staleTime: 10_000 });
  const broken = (data?.units ?? []).filter((u) => u.status === 'maintenance');

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: key });
    queryClient.invalidateQueries({ queryKey: ['owner-hardware-tiers'] });
    onChanged?.();
  };
  const addMut = useMutation({
    mutationFn: () => markMachineBroken(cafeId, tierId, label.trim()),
    onSuccess: () => {
      setLabel('');
      refresh();
    },
  });
  const fixMut = useMutation({ mutationFn: (unitId: string) => markMachineFixed(cafeId, tierId, unitId), onSuccess: refresh });
  const error = (addMut.error ?? fixMut.error) as Error | null;

  return (
    <div className="mt-2 flex flex-col gap-2">
      <p className="text-caption text-text-secondary">
        {isRoom
          ? 'Type the cabin as you know it, like “Blue cabin”. Customers can’t book it until you mark it open again, and they never see its name.'
          : 'Type the machine as you know it, like “PC 7”. Customers can’t book it until you mark it fixed, and they never see its name.'}
      </p>
      <form
        className="flex items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (label.trim()) addMut.mutate();
        }}
      >
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          maxLength={50}
          placeholder={isRoom ? 'Which cabin? e.g. Blue cabin' : 'Which machine? e.g. PC 7'}
          aria-label="Which machine is broken"
          data-qf-focus
          className="h-10 min-w-0 flex-1 rounded-xl border border-border bg-card px-3 text-body focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
        <Button type="submit" variant="secondary" size="sm" isLoading={addMut.isPending} disabled={!label.trim()} className="gap-1.5 whitespace-nowrap">
          <Wrench className="h-3.5 w-3.5" aria-hidden />
          Mark broken
        </Button>
      </form>
      {error && <p role="alert" className="text-caption font-medium text-error">{error.message || 'Couldn’t update that. Please try again.'}</p>}
      {broken.length === 0 ? (
        <p className="text-caption text-text-secondary">Nothing is broken right now.</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {broken.map((u) => (
            <li key={u.id} className="flex items-center justify-between gap-2 rounded-xl bg-warning/10 px-3 py-2">
              <span className="text-caption font-semibold text-text-primary">{u.label} is broken</span>
              <Button variant="ghost" size="sm" onClick={() => fixMut.mutate(u.id)} isLoading={fixMut.isPending && fixMut.variables === u.id} className="gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
                It’s fixed
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
