'use client';

import type { ReactNode } from 'react';
import { PLAY_STYLES, RANKS, type PlayerForm } from '@/lib/api/teamChallenges';
import { FieldError, field } from './ui';

/* The same checks the server makes (app/services/challenge_teams.py), so
   most mistakes show next to the box before anything is sent. */
export const TEAM_NAME_RE = /^[A-Za-z0-9 ]{3,20}$/;
export const RIOT_RE = /^[^#]{3,16}#[A-Za-z0-9]{3,5}$/;
const INSTA_RE = /^[A-Za-z0-9._]{1,30}$/;

export function cleanRiot(v: string): string {
  return v.trim().replace(/\s*#\s*/, '#');
}

export function cleanInsta(v: string): string {
  return v.trim().replace(/^@/, '').replace(/^(https?:\/\/)?(www\.)?instagram\.com\//i, '').replace(/\/+$/, '');
}

export function phoneDigits(v: string): string {
  const d = v.replace(/\D/g, '');
  return d.length === 12 && d.startsWith('91') ? d.slice(2) : d;
}

export type PlayerErrors = Partial<Record<keyof PlayerForm | 'teamName' | 'sub', string>>;

export function checkPlayer(p: PlayerForm, { needInsta = false }: { needInsta?: boolean } = {}): PlayerErrors {
  const e: PlayerErrors = {};
  const name = p.fullName.trim().replace(/\s+/g, ' ');
  if (name.length < 2 || name.length > 50) e.fullName = 'Write your full name.';
  if (!/^[6-9]\d{9}$/.test(phoneDigits(p.phone))) e.phone = 'WhatsApp number: 10 digits, like 9876543210.';
  if (!RIOT_RE.test(cleanRiot(p.riotId))) e.riotId = 'Riot ID looks like Name#TAG, for example Uzair#KHL1.';
  const insta = cleanInsta(p.instagram);
  if (needInsta && !insta) e.instagram = 'Add your Instagram username.';
  else if (insta && !INSTA_RE.test(insta)) e.instagram = 'Letters, numbers, dots and _ only.';
  return e;
}

export function Labelled({ id, label, hint, error, children }: { id: string; label: string; hint?: string; error?: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-[15px] font-semibold text-[#EDE9F0]">
        {label}
      </label>
      {children}
      {error ? <FieldError id={`${id}-err`}>{error}</FieldError> : hint ? <span id={`${id}-hint`} className="text-[13px] text-[#A49EA9]">{hint}</span> : null}
    </div>
  );
}

/** Name, WhatsApp, Riot ID, rank, Instagram, college (+ play style for solos). */
export function PlayerFields({
  value, onChange, errors, onBlurField, solo = false, idPrefix = 'p', lockedPhone = false,
}: {
  value: PlayerForm;
  onChange: (v: PlayerForm) => void;
  errors: PlayerErrors;
  onBlurField?: (k: keyof PlayerForm) => void;
  solo?: boolean;
  idPrefix?: string;
  lockedPhone?: boolean;
}) {
  const set = (k: keyof PlayerForm) => (e: { target: { value: string } }) => onChange({ ...value, [k]: e.target.value });
  const aria = (k: keyof PlayerForm, hint = false) => ({
    'aria-invalid': errors[k] ? true : undefined,
    'aria-describedby': errors[k] ? `${idPrefix}-${k}-err` : hint ? `${idPrefix}-${k}-hint` : undefined,
    onBlur: () => onBlurField?.(k),
  });
  return (
    <div className="flex flex-col gap-4">
      <Labelled id={`${idPrefix}-fullName`} label="Full name" error={errors.fullName}>
        <input id={`${idPrefix}-fullName`} className={field} autoComplete="name" value={value.fullName} onChange={set('fullName')} {...aria('fullName')} />
      </Labelled>
      <Labelled id={`${idPrefix}-phone`} label="WhatsApp number" hint="We send your match time here." error={errors.phone}>
        <div className="relative">
          <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[#A49EA9]">+91</span>
          <input
            id={`${idPrefix}-phone`}
            className={`${field} pl-12 tabular-nums`}
            inputMode="numeric"
            autoComplete="tel-national"
            maxLength={14}
            readOnly={lockedPhone}
            value={value.phone}
            onChange={set('phone')}
            {...aria('phone', true)}
          />
        </div>
      </Labelled>
      <Labelled id={`${idPrefix}-riotId`} label="Riot ID" hint="Name#TAG, for example Uzair#KHL1" error={errors.riotId}>
        <input
          id={`${idPrefix}-riotId`}
          className={field}
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          placeholder="Name#TAG"
          value={value.riotId}
          onChange={set('riotId')}
          {...aria('riotId', true)}
        />
      </Labelled>
      <details className="group rounded-xl border border-[#2C2530] bg-[#0F0C12] px-3.5 py-1">
        <summary className="flex min-h-[48px] cursor-pointer list-none items-center justify-between text-[15px] font-semibold text-[#DCD7E0] [&::-webkit-details-marker]:hidden">
          More about you (optional)
          <span className="text-[13px] font-normal text-[#A49EA9] group-open:hidden">Rank, Instagram, college</span>
        </summary>
        <div className="flex flex-col gap-4 pb-3 pt-1">
      <Labelled id={`${idPrefix}-rank`} label="Current rank (optional)" hint="Only for fun stats. Not checked." error={errors.rank}>
        <select id={`${idPrefix}-rank`} className={`${field} appearance-none bg-[length:18px] bg-[right_12px_center] bg-no-repeat`} value={value.rank} onChange={set('rank')} {...aria('rank', true)}
          style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23B4B0B8' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")" }}
        >
          <option value="">Skip</option>
          {RANKS.map((r) => (
            <option key={r} value={r}>{r}</option>
          ))}
        </select>
      </Labelled>
      <Labelled id={`${idPrefix}-instagram`} label="Instagram username (optional)" hint="Skip it if you like. We tag you in the reels." error={errors.instagram}>
        <div className="relative">
          <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[#A49EA9]">@</span>
          <input
            id={`${idPrefix}-instagram`}
            className={`${field} pl-8`}
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            value={value.instagram}
            onChange={set('instagram')}
            {...aria('instagram', true)}
          />
        </div>
      </Labelled>
      <Labelled id={`${idPrefix}-college`} label="College or work (optional)">
        <input id={`${idPrefix}-college`} className={field} autoComplete="organization" value={value.college} onChange={set('college')} />
      </Labelled>
      {solo && (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1.5 text-[15px] font-semibold text-[#EDE9F0]">How do you like to play? (optional)</legend>
          <div className="grid grid-cols-2 gap-2">
            {PLAY_STYLES.map((s) => (
              <label
                key={s.id}
                className={`flex min-h-[52px] cursor-pointer items-center rounded-xl border px-3 text-[14px] font-semibold transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-white/70 ${
                  value.playStyle === s.id ? 'border-[#D0463C] bg-[#D0463C]/15 text-white' : 'border-[#2C2530] bg-[#0F0C12] text-[#DCD7E0]'
                }`}
              >
                <input type="radio" name={`${idPrefix}-style`} className="sr-only" checked={value.playStyle === s.id} onChange={() => onChange({ ...value, playStyle: s.id })} />
                {s.label}
              </label>
            ))}
          </div>
        </fieldset>
      )}
        </div>
      </details>
    </div>
  );
}
