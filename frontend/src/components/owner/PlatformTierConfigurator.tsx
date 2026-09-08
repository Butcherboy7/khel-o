// frontend/src/components/owner/PlatformTierConfigurator.tsx
'use client';

import { useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { PLATFORMS, PLATFORM_MODELS, type Platform } from '@/constants/platforms';
import { PlatformIcon } from '@/components/icons/PlatformIcons';
import { ACTIVITY_PRESETS, ActivityIcon } from '@/components/icons/ActivityIcons';
import { Input } from '@/components/ui';
import { cn } from '@/lib/cn';
import type { TierConfig } from '@/types/tier';
import { safeRandomUUID } from '@/lib/uuid';

/**
 * Numeric field for the tier form (total stations / bookable seats / price
 * per hour). Binding a native `<input type="number">` straight to a
 * `number` piece of state has a classic controlled-input bug: clearing the
 * field to retype a value momentarily makes `e.target.value === ''`,
 * `Number('')` coerces that to `0`, React snaps the DOM back to "0" mid-edit,
 * and the next keystrokes land next to that phantom zero — so typing "10"
 * after a clear ends up as "010"/"0010" instead of replacing the value.
 *
 * This keeps its own text buffer so the owner can freely clear/retype, only
 * ever committing a clean, leading-zero-stripped integer upward, and
 * clamping to [min, max] once a full number is present.
 */
interface NumericFieldProps {
  label?: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  placeholder?: string;
}

function NumericField({ label, value, onChange, min, max, placeholder }: NumericFieldProps) {
  const [raw, setRaw] = useState(String(value));

  // Keep the local buffer in sync with external changes (switching which
  // tier is being edited, a sibling field's auto-fill recomputing this one,
  // etc). Every keystroke below commits an already-normalized string, so
  // this is a no-op during normal typing and never fights the caret.
  useEffect(() => {
    setRaw(String(value));
  }, [value]);

  const commit = (nextRaw: string) => {
    if (nextRaw === '') return; // let the owner finish clearing/retyping first
    let n = Number(nextRaw);
    if (Number.isNaN(n)) return;
    if (min !== undefined) n = Math.max(min, n);
    if (max !== undefined) n = Math.min(max, n);
    onChange(n);
  };

  return (
    <Input
      label={label}
      type="text"
      inputMode="numeric"
      placeholder={placeholder}
      value={raw}
      onChange={(e) => {
        const digitsOnly = e.target.value.replace(/[^\d]/g, '');
        const stripped = digitsOnly.replace(/^0+(?=\d)/, '');
        setRaw(stripped);
        commit(stripped);
      }}
      onBlur={() => {
        if (raw === '') {
          const fallback = min ?? 0;
          setRaw(String(fallback));
          onChange(fallback);
        }
      }}
    />
  );
}

interface PlatformTierConfiguratorProps {
  configs: TierConfig[];
  onChange: (configs: TierConfig[]) => void;
  /**
   * Caps the total number of configs across all platforms. When set (e.g.
   * `1` for the owner/tiers page, which manages exactly one tier per modal
   * open), the "Add configuration" button is hidden once the cap is
   * reached, and selecting a new platform chip replaces the existing
   * config(s) instead of adding alongside them — so the cap is enforced by
   * making the extra state unreachable, not by silently dropping data on
   * submit. Omit for uncapped multi-platform, multi-config behavior (e.g.
   * the onboarding wizard).
   */
  maxConfigs?: number;
}

function makeDefaultConfig(platform: Platform): TierConfig {
  const models = platform === 'other' ? [] : PLATFORM_MODELS[platform];
  return {
    id: safeRandomUUID(),
    platform,
    model: platform === 'other' ? '' : models[0],
    totalSeats: 4,
    appBookableSeats: 1, // 25% of 4, rounded — matches the per-field recompute below on edit
    pricePerHour: 100,
    tierType: 'gaming',
  };
}

function makeDefaultActivityConfig(activityKind: string, defaultIndividualUnits: boolean): TierConfig {
  return {
    id: safeRandomUUID(),
    platform: 'other',
    model: activityKind,
    totalSeats: 2,
    appBookableSeats: 2,
    pricePerHour: 300,
    tierType: 'activity',
    activityKind,
    individualUnits: defaultIndividualUnits,
  };
}

export function PlatformTierConfigurator({ configs, onChange, maxConfigs }: PlatformTierConfiguratorProps) {
  // Activity configs also carry `platform: 'other'` internally (see
  // makeDefaultActivityConfig), but must never surface in the gaming
  // platform-chip/specs flow below — so this and the platform-scoped
  // helpers filter them out by tierType.
  const selectedPlatforms = Array.from(
    new Set(configs.filter((c) => c.tierType !== 'activity').map((c) => c.platform))
  );
  const atCap = maxConfigs !== undefined && configs.length >= maxConfigs;

  // Tracks which config cards have had "Bookable on KHEL-O app" edited
  // directly by the owner in this session. Once a card is in this set, the
  // 25%-of-total auto-fill (below) stops recomputing that card's
  // appBookableSeats when totalSeats changes — otherwise every tweak to
  // "Total stations" would silently clobber a value the owner just typed.
  const [touchedSeatsIds, setTouchedSeatsIds] = useState<Set<string>>(new Set());

  // Newly selected/added config card, briefly highlighted so picking a
  // platform or activity visibly drops the owner straight into that card's
  // details instead of looking like a no-op. Cleared automatically below.
  const [justAddedId, setJustAddedId] = useState<string | null>(null);
  useEffect(() => {
    if (!justAddedId) return;
    const t = setTimeout(() => setJustAddedId(null), 1400);
    return () => clearTimeout(t);
  }, [justAddedId]);

  const togglePlatform = (platform: Platform) => {
    if (selectedPlatforms.includes(platform)) {
      onChange(configs.filter((c) => c.tierType === 'activity' || c.platform !== platform));
    } else if (maxConfigs !== undefined) {
      // Capped mode: only one platform's config(s) may exist at a time, so
      // switching platforms replaces the selection rather than adding a
      // second platform alongside it. Activity configs aren't part of this
      // cap/replace behavior, so they're preserved across the swap.
      const next = makeDefaultConfig(platform);
      onChange([...configs.filter((c) => c.tierType === 'activity'), next]);
      setJustAddedId(next.id);
    } else {
      const next = makeDefaultConfig(platform);
      onChange([...configs, next]);
      setJustAddedId(next.id);
    }
  };

  const addConfig = (platform: Platform) => {
    if (atCap) return;
    const next = makeDefaultConfig(platform);
    onChange([...configs, next]);
    setJustAddedId(next.id);
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
        // Re-derive appBookableSeats only when totalSeats changes and the
        // owner hasn't already set a custom appBookableSeats for this card
        // — once they touch appBookableSeats directly, this branch is
        // skipped for the rest of the session. Activities never expose an
        // appBookableSeats input of their own (see the activity card below),
        // so touchedSeatsIds is never populated for them — the 25%
        // walk-in-reservation heuristic below is a gaming-tier concept only
        // and must never apply here, or an owner typing "8" into an
        // activity's Quantity field would silently persist bookable
        // capacity of 2 (25% of 8) instead of 8.
        if (patch.totalSeats !== undefined && patch.appBookableSeats === undefined) {
          if (next.tierType === 'activity') {
            next.appBookableSeats = patch.totalSeats;
          } else if (!touchedSeatsIds.has(id)) {
            next.appBookableSeats = Math.max(1, Math.round(patch.totalSeats * 0.25));
          }
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
              className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-caption font-semibold border transition-all ${
                selectedPlatforms.includes(p.value)
                  ? 'bg-primary text-white border-primary'
                  : 'bg-surface text-text-secondary border-border hover:border-primary/60'
              }`}
            >
              <PlatformIcon platform={p.value} className="h-4 w-4" />
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="text-caption font-semibold text-text-primary mb-2 block">
          Activities (snooker, arcade, and other bookable extras)
        </label>
        <div className="flex flex-wrap gap-2 mb-3">
          {ACTIVITY_PRESETS.map(({ key, label, icon: Icon, defaultIndividualUnits }) => (
            <button
              key={key}
              type="button"
              onClick={() => {
                const next = makeDefaultActivityConfig(key, defaultIndividualUnits);
                onChange([...configs, next]);
                setJustAddedId(next.id);
              }}
              className="flex items-center gap-1.5 px-4 py-2 rounded-full text-caption font-semibold border border-border bg-surface text-text-secondary hover:border-primary/60 transition-all"
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => {
              const next = makeDefaultActivityConfig('', true);
              onChange([...configs, next]);
              setJustAddedId(next.id);
            }}
            className="flex items-center gap-1.5 px-4 py-2 rounded-full text-caption font-semibold border border-border bg-surface text-text-secondary hover:border-primary/60 transition-all"
          >
            <ActivityIcon activityKind={null} className="h-4 w-4" />
            Other
          </button>
        </div>

        {configs.filter((c) => c.tierType === 'activity').map((config) => (
          <div
            key={config.id}
            className={cn(
              'grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 rounded-xl bg-card border mb-3 transition-all duration-500',
              justAddedId === config.id ? 'border-primary ring-2 ring-primary/30' : 'border-border/80'
            )}
          >
            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <label className="text-overline font-semibold text-text-secondary">Activity name</label>
              <Input
                placeholder="e.g. Snooker"
                value={config.activityKind || ''}
                onChange={(e) => updateConfig(config.id, { activityKind: e.target.value, model: e.target.value })}
              />
            </div>

            <NumericField
              label={config.individualUnits ? 'Quantity (tables/machines)' : 'Capacity (people at once)'}
              min={1}
              value={config.totalSeats}
              onChange={(n) => updateConfig(config.id, { totalSeats: n })}
            />

            <NumericField
              label="Price per hour (₹)"
              min={1}
              value={config.pricePerHour}
              onChange={(n) => updateConfig(config.id, { pricePerHour: n, appBookableSeats: config.totalSeats })}
            />

            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <label className="text-overline font-semibold text-text-secondary">Availability tracking</label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => updateConfig(config.id, { individualUnits: true })}
                  className={`flex-1 px-3 py-2 rounded-xl text-caption font-semibold border transition-all ${
                    config.individualUnits ? 'border-primary bg-primary/5 text-primary' : 'border-border bg-surface text-text-secondary'
                  }`}
                >
                  Individual units (e.g. Table 1, 2, 3)
                </button>
                <button
                  type="button"
                  onClick={() => updateConfig(config.id, { individualUnits: false })}
                  className={`flex-1 px-3 py-2 rounded-xl text-caption font-semibold border transition-all ${
                    !config.individualUnits ? 'border-primary bg-primary/5 text-primary' : 'border-border bg-surface text-text-secondary'
                  }`}
                >
                  Pooled capacity (one shared count)
                </button>
              </div>
            </div>

            <div className="flex items-end justify-end sm:col-span-2">
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

      {PLATFORMS.filter((p) => selectedPlatforms.includes(p.value)).map((p) => {
        const platformConfigs = configs.filter((c) => c.platform === p.value && c.tierType !== 'activity');
        const models = p.value === 'other' ? [] : PLATFORM_MODELS[p.value as Exclude<Platform, 'other'>];

        return (
          <div key={p.value} className="flex flex-col gap-3 p-4 rounded-2xl border border-border bg-surface">
            <div className="flex items-center justify-between">
              <h3 className="flex items-center gap-2 font-heading text-body-emphasis font-bold text-text-primary">
                <PlatformIcon platform={p.value} className="h-4 w-4 text-primary" />
                {p.label}
              </h3>
              {!atCap && (
                <button
                  type="button"
                  onClick={() => addConfig(p.value)}
                  className="flex items-center gap-1 text-caption font-semibold text-primary hover:text-primary/80"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add configuration
                </button>
              )}
            </div>

            {platformConfigs.map((config) => (
              <div
                key={config.id}
                className={cn(
                  'grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 rounded-xl bg-card border transition-all duration-500',
                  justAddedId === config.id ? 'border-primary ring-2 ring-primary/30' : 'border-border/80'
                )}
              >
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

                <NumericField
                  label="Total stations"
                  min={1}
                  value={config.totalSeats}
                  onChange={(n) => updateConfig(config.id, { totalSeats: n })}
                />

                <NumericField
                  label="Bookable on KHEL-O app"
                  min={0}
                  max={config.totalSeats}
                  value={config.appBookableSeats}
                  onChange={(n) => updateConfig(config.id, { appBookableSeats: n })}
                />

                <NumericField
                  label="Price per hour (₹)"
                  min={1}
                  value={config.pricePerHour}
                  onChange={(n) => updateConfig(config.id, { pricePerHour: n })}
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
