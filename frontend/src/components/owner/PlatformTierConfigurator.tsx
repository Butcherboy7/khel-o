// frontend/src/components/owner/PlatformTierConfigurator.tsx
'use client';

import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { PLATFORMS, PLATFORM_MODELS, type Platform } from '@/constants/platforms';
import { Input } from '@/components/ui';
import type { TierConfig } from '@/types/tier';

interface PlatformTierConfiguratorProps {
  configs: TierConfig[];
  onChange: (configs: TierConfig[]) => void;
}

function makeDefaultConfig(platform: Platform): TierConfig {
  const models = platform === 'other' ? [] : PLATFORM_MODELS[platform];
  return {
    id: crypto.randomUUID(),
    platform,
    model: platform === 'other' ? '' : models[0],
    totalSeats: 4,
    appBookableSeats: 1, // 25% of 4, rounded — matches the per-field recompute below on edit
    pricePerHour: 100,
  };
}

export function PlatformTierConfigurator({ configs, onChange }: PlatformTierConfiguratorProps) {
  const selectedPlatforms = Array.from(new Set(configs.map((c) => c.platform)));

  // Tracks which config cards have had "Bookable on KHEL-O app" edited
  // directly by the owner in this session. Once a card is in this set, the
  // 25%-of-total auto-fill (below) stops recomputing that card's
  // appBookableSeats when totalSeats changes — otherwise every tweak to
  // "Total stations" would silently clobber a value the owner just typed.
  const [touchedSeatsIds, setTouchedSeatsIds] = useState<Set<string>>(new Set());

  const togglePlatform = (platform: Platform) => {
    if (selectedPlatforms.includes(platform)) {
      onChange(configs.filter((c) => c.platform !== platform));
    } else {
      onChange([...configs, makeDefaultConfig(platform)]);
    }
  };

  const addConfig = (platform: Platform) => {
    onChange([...configs, makeDefaultConfig(platform)]);
  };

  const removeConfig = (id: string) => {
    onChange(configs.filter((c) => c.id !== id));
  };

  const updateConfig = (id: string, patch: Partial<TierConfig>) => {
    if (patch.appBookableSeats !== undefined) {
      setTouchedSeatsIds((prev) => (prev.has(id) ? prev : new Set(prev).add(id)));
    }

    onChange(
      configs.map((c) => {
        if (c.id !== id) return c;
        const next = { ...c, ...patch };
        // Re-derive the 25% default only when totalSeats changes and the
        // owner hasn't already set a custom appBookableSeats for this card
        // — once they touch appBookableSeats directly, this branch is
        // skipped for the rest of the session.
        if (
          patch.totalSeats !== undefined &&
          patch.appBookableSeats === undefined &&
          !touchedSeatsIds.has(id)
        ) {
          next.appBookableSeats = Math.max(1, Math.round(patch.totalSeats * 0.25));
        }
        return next;
      })
    );
  };

  return (
    <div className="flex flex-col gap-5">
      <div>
        <label className="text-caption font-semibold text-text-primary mb-2 block">
          What does your café offer?
        </label>
        <div className="flex flex-wrap gap-2">
          {PLATFORMS.map((p) => (
            <button
              key={p.value}
              type="button"
              onClick={() => togglePlatform(p.value)}
              className={`px-4 py-2 rounded-full text-caption font-semibold border transition-all ${
                selectedPlatforms.includes(p.value)
                  ? 'bg-primary text-white border-primary'
                  : 'bg-surface text-text-secondary border-border hover:border-primary/60'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {PLATFORMS.filter((p) => selectedPlatforms.includes(p.value)).map((p) => {
        const platformConfigs = configs.filter((c) => c.platform === p.value);
        const models = p.value === 'other' ? [] : PLATFORM_MODELS[p.value as Exclude<Platform, 'other'>];

        return (
          <div key={p.value} className="flex flex-col gap-3 p-4 rounded-2xl border border-border bg-surface">
            <div className="flex items-center justify-between">
              <h3 className="font-heading text-body-emphasis font-bold text-text-primary">{p.label}</h3>
              <button
                type="button"
                onClick={() => addConfig(p.value)}
                className="flex items-center gap-1 text-caption font-semibold text-primary hover:text-primary/80"
              >
                <Plus className="h-3.5 w-3.5" />
                Add configuration
              </button>
            </div>

            {platformConfigs.map((config) => (
              <div key={config.id} className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 rounded-xl bg-card border border-border/80">
                <div className="flex flex-col gap-1.5 sm:col-span-2">
                  <label className="text-overline font-semibold text-text-secondary">Model</label>
                  {p.value === 'other' ? (
                    <Input
                      placeholder="e.g. VR Arcade Pod"
                      value={config.model}
                      onChange={(e) => updateConfig(config.id, { model: e.target.value })}
                    />
                  ) : (
                    <select
                      value={config.model}
                      onChange={(e) => updateConfig(config.id, { model: e.target.value })}
                      className="flex h-10 w-full rounded-xl border border-border bg-card px-3 py-2 text-caption text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                    >
                      {models.map((m) => (
                        <option key={m} value={m}>{m}</option>
                      ))}
                    </select>
                  )}
                </div>

                <Input
                  label="Total stations"
                  type="number"
                  min="1"
                  value={config.totalSeats}
                  onChange={(e) => updateConfig(config.id, { totalSeats: Number(e.target.value) })}
                />

                <Input
                  label="Bookable on KHEL-O app"
                  type="number"
                  min="0"
                  max={config.totalSeats}
                  value={config.appBookableSeats}
                  onChange={(e) => updateConfig(config.id, { appBookableSeats: Number(e.target.value) })}
                />

                <Input
                  label="Price per hour (₹)"
                  type="number"
                  min="1"
                  value={config.pricePerHour}
                  onChange={(e) => updateConfig(config.id, { pricePerHour: Number(e.target.value) })}
                />

                <div className="flex items-end justify-end">
                  <button
                    type="button"
                    onClick={() => removeConfig(config.id)}
                    className="flex items-center gap-1 text-caption font-semibold text-error hover:text-error/80 p-2"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}
