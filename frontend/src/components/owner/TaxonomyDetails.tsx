'use client';

import { useEffect } from 'react';
import { Select, Input, NumericField } from '@/components/ui';
import { guessActivityKey, optionLabel, resolveKey, useTaxonomy } from '@/lib/taxonomy';
import type { TierAttributes } from '@/types/taxonomy';
import type { TierConfig } from '@/types/tier';

interface Props {
  config: Pick<TierConfig, 'id' | 'activityKind' | 'taxonomyKey' | 'attributes'>;
  onChange: (patch: Partial<TierConfig>) => void;
}

const DONT_KNOW = '';

/**
 * "What kind?" for one activity setup. The owner never sees the taxonomy tree —
 * only: pick what this is (pre-filled when the name is unambiguous), pick a
 * style if one exists, then a few optional details. Every answer can be
 * "Don't know" and nothing here is required, so it can never block saving.
 */
export function TaxonomyDetails({ config, onChange }: Props) {
  const { data: tax } = useTaxonomy();
  const resolved = resolveKey(tax, config.taxonomyKey);
  const activity = resolved?.activity;

  // Pre-select when the typed name clearly means one activity ("Bowling").
  // "Snooker / Pool" names two, so it stays unset and the owner is asked.
  useEffect(() => {
    if (!tax || config.taxonomyKey) return;
    const guess = guessActivityKey(tax, config.activityKind);
    if (guess) onChange({ taxonomyKey: guess, attributes: {} });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tax, config.activityKind]);

  if (!tax) return null;

  const attrs: TierAttributes = config.attributes ?? {};
  const setAttr = (key: string, value: TierAttributes[string] | undefined) => {
    const next = { ...attrs };
    if (value === undefined || value === '' || (Array.isArray(value) && value.length === 0)) delete next[key];
    else next[key] = value;
    onChange({ attributes: next });
  };

  const categories = [...tax.categories].sort((a, b) => a.rank - b.rank);
  // Gaming consoles/PC are configured in the platform section above, not here.
  const pickable = tax.activities.filter((a) => a.category !== 'gaming');

  return (
    <div className="flex flex-col gap-3 sm:col-span-2 rounded-xl bg-surface/60 border border-border/60 p-3">
      <Select
        label="What kind of activity is this?"
        hint={!activity ? 'Helps customers find you. You can skip this.' : undefined}
        value={activity?.key ?? DONT_KNOW}
        onChange={(e) => onChange({ taxonomyKey: e.target.value || null, attributes: {} })}
      >
        <option value={DONT_KNOW}>Not sure / something else</option>
        {categories
          .filter((c) => pickable.some((a) => a.category === c.key))
          .map((c) => (
            <optgroup key={c.key} label={c.label}>
              {pickable
                .filter((a) => a.category === c.key)
                .sort((a, b) => a.rank - b.rank)
                .map((a) => (
                  <option key={a.key} value={a.key}>
                    {a.label}
                  </option>
                ))}
            </optgroup>
          ))}
      </Select>

      {activity && activity.styles.length > 0 && (
        <Select
          label="What type?"
          value={resolved?.style?.key ?? DONT_KNOW}
          onChange={(e) => onChange({ taxonomyKey: e.target.value || activity.key })}
        >
          <option value={DONT_KNOW}>Don&apos;t know</option>
          {activity.styles.map((s) => (
            <option key={s.key} value={s.key}>
              {s.label}
            </option>
          ))}
        </Select>
      )}

      {activity?.attributes.map((a) => {
        const label = a.unit ? `${a.label} (${a.unit})` : a.label;
        const value = attrs[a.key];
        if (a.type === 'enum') {
          return (
            <Select
              key={a.key}
              label={label}
              value={typeof value === 'string' ? value : DONT_KNOW}
              onChange={(e) => setAttr(a.key, e.target.value || undefined)}
            >
              <option value={DONT_KNOW}>Don&apos;t know</option>
              {a.options?.map((o) => (
                <option key={o} value={o}>
                  {optionLabel(o)}
                </option>
              ))}
            </Select>
          );
        }
        if (a.type === 'multi') {
          const chosen = Array.isArray(value) ? value : [];
          return (
            <div key={a.key} className="flex flex-col gap-1.5">
              <span className="text-h4 text-text-primary">{label}</span>
              <div className="flex flex-wrap gap-2">
                {a.options?.map((o) => {
                  const on = chosen.includes(o);
                  return (
                    <button
                      key={o}
                      type="button"
                      aria-pressed={on}
                      onClick={() => setAttr(a.key, on ? chosen.filter((x) => x !== o) : [...chosen, o])}
                      className={`px-3 py-1.5 rounded-full border text-caption font-semibold transition-all ${
                        on ? 'bg-primary text-white border-primary' : 'bg-surface text-text-secondary border-border'
                      }`}
                    >
                      {optionLabel(o)}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        }
        if (a.type === 'int') {
          return (
            <NumericField
              key={a.key}
              label={a.level === 'required' ? `${label} — required` : `${label} — optional`}
              min={1}
              value={typeof value === 'number' ? value : 0}
              onChange={(n) => setAttr(a.key, n > 0 ? n : undefined)}
            />
          );
        }
        if (a.type === 'bool') {
          return (
            <Select
              key={a.key}
              label={label}
              value={typeof value === 'boolean' ? String(value) : DONT_KNOW}
              onChange={(e) => setAttr(a.key, e.target.value === '' ? undefined : e.target.value === 'true')}
            >
              <option value={DONT_KNOW}>Don&apos;t know</option>
              <option value="true">Yes</option>
              <option value="false">No</option>
            </Select>
          );
        }
        const listId = `tx-${config.id}-${a.key}`;
        return (
          <div key={a.key}>
            <Input
              label={`${label} — optional`}
              list={a.suggestions ? listId : undefined}
              value={typeof value === 'string' ? value : ''}
              onChange={(e) => setAttr(a.key, e.target.value || undefined)}
            />
            {a.suggestions && (
              <datalist id={listId}>
                {a.suggestions.map((o) => (
                  <option key={o} value={o} />
                ))}
              </datalist>
            )}
          </div>
        );
      })}
    </div>
  );
}
