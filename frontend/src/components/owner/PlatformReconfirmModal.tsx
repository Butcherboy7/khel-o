'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Modal, Button } from '@/components/ui';
import { PLATFORMS, PLATFORM_MODELS, type Platform } from '@/constants/platforms';
import { getTiersNeedingConfirmation, confirmTierPlatform } from '@/lib/api/platformReconfirm';

export function PlatformReconfirmModal() {
  const queryClient = useQueryClient();
  const { data } = useQuery({
    queryKey: ['tiers-needing-confirmation'],
    queryFn: getTiersNeedingConfirmation,
    staleTime: 60_000,
  });

  const [draft, setDraft] = useState<Record<string, { platform: Platform; model: string }>>({});
  // Dismissed for this browser session only — no persistence (no new column,
  // no new endpoint). Per the spec this prompt must never be a blocker; it
  // simply reappears next session until every legacy tier is confirmed.
  const [dismissed, setDismissed] = useState(false);

  const confirmMutation = useMutation({
    mutationFn: async (vars: { tierId: string; platform: Platform; model: string }) => {
      await confirmTierPlatform(vars.tierId, vars.platform, vars.model);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tiers-needing-confirmation'] });
    },
  });

  if (dismissed || !data?.needsConfirmation || data.tiers.length === 0) return null;

  return (
    <Modal
      isOpen
      title="Confirm what your café offers"
      onClose={() => setDismissed(true)}
      description="A quick one-time check so your café shows the right platforms to customers."
    >
      <div className="flex flex-col gap-4">
        {confirmMutation.isError && (
          <div className="p-3 rounded-xl bg-error/10 border border-error/20 text-caption text-error">
            {(confirmMutation.error as Error)?.message || 'Failed to confirm platform. Please try again.'}
          </div>
        )}
        {data.tiers.map((tier) => {
          const current = draft[tier.id] || { platform: tier.guessedPlatform, model: tier.guessedModel };
          const models = current.platform === 'other' ? [] : PLATFORM_MODELS[current.platform as Exclude<Platform, 'other'>];
          // The select's value must always be a value that's actually in `models`
          // (or the browser silently desyncs the visible selection from state) —
          // this is also what we submit, since a tier can be confirmed without
          // ever touching a dropdown (accepting the guess as-is). Defensive even
          // though the backend guess is now always picklist-safe: a stale/edited
          // draft value must never be submitted as free text either.
          const resolvedModel =
            current.platform === 'other'
              ? current.model
              : current.model && models.includes(current.model)
                ? current.model
                : models[0];

          return (
            <div key={tier.id} className="p-3 rounded-xl border border-border bg-surface flex flex-col gap-2">
              <span className="text-caption font-semibold text-text-primary">{tier.name}</span>
              <div className="flex gap-2">
                <label className="sr-only" htmlFor={`reconfirm-platform-${tier.id}`}>Platform</label>
                <select
                  id={`reconfirm-platform-${tier.id}`}
                  value={current.platform}
                  onChange={(e) => setDraft((d) => ({ ...d, [tier.id]: { platform: e.target.value as Platform, model: '' } }))}
                  className="flex-1 h-9 rounded-lg border border-border bg-card px-2 text-caption"
                >
                  {PLATFORMS.map((p) => (
                    <option key={p.value} value={p.value}>{p.label}</option>
                  ))}
                </select>
                {current.platform !== 'other' && (
                  <>
                    <label className="sr-only" htmlFor={`reconfirm-model-${tier.id}`}>Model</label>
                    <select
                      id={`reconfirm-model-${tier.id}`}
                      value={resolvedModel}
                      onChange={(e) => setDraft((d) => ({ ...d, [tier.id]: { ...current, model: e.target.value } }))}
                      className="flex-1 h-9 rounded-lg border border-border bg-card px-2 text-caption"
                    >
                      {models.map((m) => (
                        <option key={m} value={m}>{m}</option>
                      ))}
                    </select>
                  </>
                )}
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => confirmMutation.mutate({ tierId: tier.id, platform: current.platform, model: resolvedModel })}
                isLoading={confirmMutation.isPending && confirmMutation.variables?.tierId === tier.id}
              >
                Confirm
              </Button>
            </div>
          );
        })}
        <Button size="sm" variant="ghost" onClick={() => setDismissed(true)} className="self-start">
          Remind me later
        </Button>
      </div>
    </Modal>
  );
}
