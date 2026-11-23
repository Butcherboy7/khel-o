'use client';

import { useRef, type KeyboardEvent } from 'react';
import Image from 'next/image';
import { Check, PencilLine } from 'lucide-react';
import { CONSOLE_MODELS, type ConsolePlatform } from '@/constants/consoles';
import { PlatformIcon } from '@/components/icons/PlatformIcons';
import { cn } from '@/lib/cn';
import { InfoTip } from './InfoTip';

export const CUSTOM_MODEL = 'Custom';

/** Pick the exact console with photo cards (a radio group). `value` is the saved model, or CUSTOM_MODEL while the
 *  owner types their own. Arrow keys move between cards like any radio group; Enter/Space picks. */
export function ConsoleModelPicker({
  platform,
  value,
  onChange,
}: {
  platform: ConsolePlatform;
  value: string;
  onChange: (model: string) => void;
}) {
  const models = CONSOLE_MODELS[platform];
  const options = [...models.map((m) => m.model), CUSTOM_MODEL];
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const selectedIndex = Math.max(0, options.indexOf(value));

  const move = (e: KeyboardEvent, i: number) => {
    const step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const next = (i + step + options.length) % options.length;
    onChange(options[next]);
    refs.current[next]?.focus();
  };

  return (
    <div
      role="radiogroup"
      aria-label="Which console is it?"
      className="grid grid-cols-2 gap-2.5 sm:grid-cols-3"
    >
      {models.map((m, i) => {
        const selected = value === m.model;
        return (
          <div
            key={m.model}
            className={cn(
              'relative flex flex-col rounded-2xl border bg-card transition-[border-color,box-shadow] duration-200',
              selected ? 'border-primary ring-2 ring-primary/25' : 'border-border hover:border-primary/50',
            )}
          >
            <button
              ref={(el) => { refs.current[i] = el; }}
              type="button"
              role="radio"
              aria-checked={selected}
              tabIndex={i === selectedIndex ? 0 : -1}
              onClick={() => onChange(m.model)}
              onKeyDown={(e) => move(e, i)}
              className="flex flex-1 flex-col text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
            >
              <span className="relative block aspect-[4/3] w-full overflow-hidden rounded-t-[15px] bg-white">
                {m.hasPhoto ? (
                  <Image
                    src={`/consoles/${m.key}.webp`}
                    alt={`${m.model} console`}
                    fill
                    sizes="(min-width: 640px) 180px, 45vw"
                    className="object-contain p-2.5"
                  />
                ) : (
                  <span className="grid h-full w-full place-items-center bg-surface">
                    <PlatformIcon platform={platform} className="h-10 w-10 text-text-tertiary" />
                  </span>
                )}
                {selected && (
                  <span className="absolute left-2 top-2 grid h-6 w-6 place-items-center rounded-full bg-primary text-white shadow">
                    <Check className="h-3.5 w-3.5" strokeWidth={3} aria-hidden />
                  </span>
                )}
              </span>
              <span className="flex flex-1 flex-col gap-0.5 px-3 pb-3 pt-2">
                <span className="text-body-emphasis font-bold leading-tight text-text-primary">{m.model}</span>
                <span className="text-[12.5px] leading-snug text-text-secondary">{m.blurb}</span>
                {m.playsGta6 && (
                  <span className="mt-1 w-fit whitespace-nowrap rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-bold text-primary"
                    title="Customers will see a Plays GTA 6 tag on this setup">
                    Plays GTA 6
                  </span>
                )}
              </span>
            </button>
            <InfoTip label={`How to tell it is a ${m.model}`} className="absolute right-1 top-1">
              {m.tip}
            </InfoTip>
          </div>
        );
      })}

      <button
        ref={(el) => { refs.current[models.length] = el; }}
        type="button"
        role="radio"
        aria-checked={value === CUSTOM_MODEL}
        tabIndex={selectedIndex === models.length ? 0 : -1}
        onClick={() => onChange(CUSTOM_MODEL)}
        onKeyDown={(e) => move(e, models.length)}
        className={cn(
          'flex min-h-[9rem] flex-col items-center justify-center gap-1.5 rounded-2xl border-2 border-dashed px-3 py-4 text-center transition-colors',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
          value === CUSTOM_MODEL ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50',
        )}
      >
        <PencilLine className="h-5 w-5 text-text-secondary" aria-hidden />
        <span className="text-body-emphasis font-bold text-text-primary">Something else</span>
        <span className="text-[12.5px] leading-snug text-text-secondary">Not in the list? Type it.</span>
      </button>
    </div>
  );
}
