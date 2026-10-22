'use client';

import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button, Card, CardContent, Input } from '@/components/ui';
import { adminCafeOptions, type Challenge, type ChallengeInput, type ChallengeStatus } from '@/lib/api/challenges';
import { isApiError } from '@/lib/api/errors';

/** Admin create/edit for one challenge. Times are typed in India time. */

const STATUS_HELP: Record<ChallengeStatus, string> = {
  draft: 'Draft: only admins can see it',
  open: 'Open: public, sign-ups on',
  closed: 'Closed: public, sign-ups off',
  live: 'Live: the day itself',
  finished: 'Finished',
};

/** ISO → "2026-11-01T15:00" in India time, for a datetime-local input. */
function toLocalIst(iso: string | undefined): string {
  if (!iso) return '';
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(new Date(iso));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '00';
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour') === '24' ? '00' : get('hour')}:${get('minute')}`;
}

/** "2026-11-01T15:00" plus some minutes, as the same kind of string (no time zone involved). */
function addMinutes(v: string, minutes: number): string {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v)) return '';
  const [d, t] = v.split('T');
  const [y, mo, day] = d.split('-').map(Number);
  const [h, mi] = t.split(':').map(Number);
  return new Date(Date.UTC(y, mo - 1, day, h, mi + minutes)).toISOString().slice(0, 16);
}

/** "2026-11-01T15:00" typed as India time → an ISO string with +05:30. */
function fromLocalIst(v: string): string {
  return v ? `${v}:00+05:30` : '';
}

const EMPTY = {
  slug: '', title: '', cafeId: '', game: '', setupLine: '', format: 'Single elimination + 3rd-place match',
  bestOf: 3, finalBestOf: 5, startsAt: '', endsAt: '', checkinOpensAt: '', checkinClosesAt: '', capacity: 10, minAge: 18,
  status: 'draft' as ChallengeStatus, rulesMd: '', prizesMd: '', coverImageUrl: '', communityUrl: '', instagramHandle: 'khelo.journey',
};

type FormState = typeof EMPTY;

/** Minutes from the start for the times the form fills in by itself. */
const AUTO_OFFSETS = { endsAt: 180, checkinOpensAt: -30, checkinClosesAt: 15 } as const;
type AutoTime = keyof typeof AUTO_OFFSETS;

/** Refusals that aren't validation errors but still belong to one box. */
const CODE_FIELD: Record<string, keyof FormState> = { SLUG_TAKEN: 'slug', CAFE_NOT_FOUND: 'cafeId' };

/** The API's field names, as the admin sees them on this form. */
const LABELS: Record<string, string> = {
  slug: 'Link name', title: 'Title', cafeId: 'Café', game: 'Game', setupLine: 'Setup line', status: 'Status',
  startsAt: 'Starts', endsAt: 'Ends', checkinOpensAt: 'Check-in opens', checkinClosesAt: 'Check-in closes',
  format: 'Format', capacity: 'Spots', bestOf: 'Best of', finalBestOf: 'Final best of', minAge: 'Minimum age',
  prizesMd: 'Rewards', rulesMd: 'Rules', coverImageUrl: 'Cover image', communityUrl: 'WhatsApp community link',
  instagramHandle: 'Instagram handle',
};

function fromChallenge(c: Challenge): FormState {
  return {
    slug: c.slug, title: c.title, cafeId: c.cafe.id, game: c.game, setupLine: c.setupLine ?? '', format: c.format,
    bestOf: c.bestOf, finalBestOf: c.finalBestOf, startsAt: toLocalIst(c.startsAt), endsAt: toLocalIst(c.endsAt),
    checkinOpensAt: toLocalIst(c.checkinOpensAt), checkinClosesAt: toLocalIst(c.checkinClosesAt), capacity: c.capacity,
    minAge: c.minAge, status: c.status, rulesMd: c.rulesMd, prizesMd: c.prizesMd, coverImageUrl: c.coverImageUrl ?? '',
    communityUrl: c.communityUrl ?? '', instagramHandle: c.instagramHandle ?? '',
  };
}

export function ChallengeForm({
  initial,
  submitLabel,
  onSubmit,
}: {
  initial?: Challenge;
  submitLabel: string;
  onSubmit: (body: ChallengeInput) => Promise<void>;
}) {
  const [f, setF] = useState<FormState>(initial ? fromChallenge(initial) : EMPTY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Which box the API refused, and why: shown under that box. Typed values stay put.
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  // Times this form filled in from the start: they follow the start until the admin edits them.
  const [autoTimes, setAutoTimes] = useState<Set<AutoTime>>(new Set());
  const cafes = useQuery({ queryKey: ['admin', 'challenge-cafes'], queryFn: adminCafeOptions, staleTime: 300_000 });

  useEffect(() => {
    if (initial) setF(fromChallenge(initial));
  }, [initial]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setF((s) => ({ ...s, [key]: value }));
    setFieldErrors((e) => (e[key] ? { ...e, [key]: undefined } : e));
    if (key in AUTO_OFFSETS) setAutoTimes((a) => (a.has(key as AutoTime) ? new Set(Array.from(a).filter((k) => k !== key)) : a));
  };

  // Picking the start fills the empty times around it (check-in on the day, 30 min before to
  // 15 min after) and moves the ones it filled earlier, so they never drift away from the start.
  const setStart = (v: string) => {
    const follow = (Object.keys(AUTO_OFFSETS) as AutoTime[]).filter((k) => autoTimes.has(k) || !f[k]);
    const next = addMinutes(v, 0) ? follow : [];
    setF((s) => ({
      ...s,
      startsAt: v,
      ...Object.fromEntries(next.map((k) => [k, addMinutes(v, AUTO_OFFSETS[k])])),
    }));
    if (next.length) setAutoTimes(new Set(next));
    setFieldErrors((e) => ({ ...e, startsAt: undefined, ...Object.fromEntries(next.map((k) => [k, undefined])) }));
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setFieldErrors({});
    for (const [key, label] of [['startsAt', 'Start'], ['endsAt', 'End'], ['checkinOpensAt', 'Check-in opens'], ['checkinClosesAt', 'Check-in closes']] as const) {
      if (!f[key]) return setError(`${label} time is missing.`);
    }
    if (!f.cafeId) return setError('Pick the café.');
    setBusy(true);
    try {
      await onSubmit({
        ...f,
        slug: f.slug.trim().toLowerCase(),
        setupLine: f.setupLine.trim() || null,
        coverImageUrl: f.coverImageUrl.trim() || null,
        communityUrl: f.communityUrl.trim() || null,
        instagramHandle: f.instagramHandle.trim().replace(/^@/, '') || null,
        startsAt: fromLocalIst(f.startsAt),
        endsAt: fromLocalIst(f.endsAt),
        checkinOpensAt: fromLocalIst(f.checkinOpensAt),
        checkinClosesAt: fromLocalIst(f.checkinClosesAt),
      });
    } catch (err) {
      if (isApiError(err) && err.fieldErrors.length) {
        const byField: Partial<Record<keyof FormState, string>> = {};
        for (const fe of err.fieldErrors) if (fe.field in f) byField[fe.field as keyof FormState] = fe.message;
        setFieldErrors(byField);
        const line = (fe: { field: string; message: string }) => {
          const label = LABELS[fe.field];
          return !label || fe.message.startsWith(label) ? fe.message : `${label}: ${fe.message}`;
        };
        setError(`Not saved yet. ${err.fieldErrors.map(line).join('. ')}.`);
      } else if (isApiError(err) && err.code && CODE_FIELD[err.code]) {
        setFieldErrors({ [CODE_FIELD[err.code]]: err.message });
        setError(`Not saved yet. ${err.message}.`);
      } else {
        setError((err as Error).message || 'Could not save.');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <Section title="Basics">
        <Input label="Title" value={f.title} onChange={(e) => set('title', e.target.value)} placeholder="KHELO Tekken Challenge #01" error={fieldErrors.title} required />
        <Input
          label="Link name"
          hint={`khel-o.com/challenge/${f.slug || 'your-link'} — lowercase, numbers and dashes`}
          value={f.slug}
          onChange={(e) => set('slug', e.target.value)}
          placeholder="tekken-01"
          error={fieldErrors.slug}
          required
        />
        <Field label="Café" error={fieldErrors.cafeId}>
          <select
            value={f.cafeId}
            onChange={(e) => set('cafeId', e.target.value)}
            className="h-12 w-full rounded-xl border border-border bg-card px-3 text-body text-text-primary"
            required
          >
            <option value="">Pick a café…</option>
            {(cafes.data ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} · {c.city}
              </option>
            ))}
          </select>
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Input label="Game" value={f.game} onChange={(e) => set('game', e.target.value)} placeholder="Tekken 8" error={fieldErrors.game} required />
          <Input label="Setup line (optional)" value={f.setupLine} onChange={(e) => set('setupLine', e.target.value)} placeholder="One PS5 on a projector" error={fieldErrors.setupLine} />
        </div>
        <Field label="Status">
          <select
            value={f.status}
            onChange={(e) => set('status', e.target.value as ChallengeStatus)}
            className="h-12 w-full rounded-xl border border-border bg-card px-3 text-body text-text-primary"
          >
            {(Object.keys(STATUS_HELP) as ChallengeStatus[]).map((s) => (
              <option key={s} value={s}>{STATUS_HELP[s]}</option>
            ))}
          </select>
        </Field>
      </Section>

      <Section title="When (India time)">
        <div className="grid gap-3 sm:grid-cols-2">
          <DateTime label="Starts" value={f.startsAt} onChange={setStart} error={fieldErrors.startsAt} />
          <DateTime label="Ends" value={f.endsAt} onChange={(v) => set('endsAt', v)} error={fieldErrors.endsAt} />
          <DateTime label="Check-in opens" value={f.checkinOpensAt} onChange={(v) => set('checkinOpensAt', v)} error={fieldErrors.checkinOpensAt} />
          <DateTime label="Check-in closes" value={f.checkinClosesAt} onChange={(v) => set('checkinClosesAt', v)} error={fieldErrors.checkinClosesAt} />
        </div>
        <p className="text-xs text-text-secondary">
          Check-in is at the café on the day: it opens up to 6 hours before the start and closes before the end. Players only see the times.
        </p>
      </Section>

      <Section title="Format and spots">
        <Input label="Format" value={f.format} onChange={(e) => set('format', e.target.value)} error={fieldErrors.format} />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Input label="Spots" type="number" min={1} max={256} value={f.capacity} onChange={(e) => set('capacity', Number(e.target.value))} error={fieldErrors.capacity} />
          <Input label="Best of" type="number" min={1} max={9} value={f.bestOf} onChange={(e) => set('bestOf', Number(e.target.value))} error={fieldErrors.bestOf} />
          <Input label="Final best of" type="number" min={1} max={9} value={f.finalBestOf} onChange={(e) => set('finalBestOf', Number(e.target.value))} error={fieldErrors.finalBestOf} />
          <Input label="Minimum age" type="number" min={0} max={99} value={f.minAge} onChange={(e) => set('minAge', Number(e.target.value))} error={fieldErrors.minAge} />
        </div>
      </Section>

      <Section title="Rewards and rules">
        <TextArea
          label="Rewards (shown on the public page)"
          hint="One per line, starting with “- ”. **bold** works. Never put a code here: this is public."
          value={f.prizesMd}
          onChange={(v) => set('prizesMd', v)}
          error={fieldErrors.prizesMd}
          rows={6}
        />
        <TextArea label="Rules" hint="One rule per line, starting with “- ”." value={f.rulesMd} onChange={(v) => set('rulesMd', v)} error={fieldErrors.rulesMd} rows={10} />
      </Section>

      <Section title="Links">
        <Input label="WhatsApp community link (optional)" value={f.communityUrl} onChange={(e) => set('communityUrl', e.target.value)} placeholder="https://chat.whatsapp.com/…" error={fieldErrors.communityUrl} />
        <Input label="Instagram handle" value={f.instagramHandle} onChange={(e) => set('instagramHandle', e.target.value)} placeholder="khelo.journey" error={fieldErrors.instagramHandle} />
      </Section>

      {error && (
        <p role="alert" className="rounded-xl bg-error/10 px-3 py-2 text-caption text-error">
          {error}
        </p>
      )}
      <Button type="submit" variant="primary" size="lg" isLoading={busy} loadingText="Saving…">
        {submitLabel}
      </Button>
    </form>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-3 p-4">
        <h2 className="font-heading text-h2 text-text-primary">{title}</h2>
        {children}
      </CardContent>
    </Card>
  );
}

function Field({ label, error, children }: { label: string; error?: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-caption font-semibold text-text-primary">{label}</span>
      {children}
      {error && (
        <span role="alert" className="text-caption text-error">
          {error}
        </span>
      )}
    </label>
  );
}

function DateTime({ label, value, onChange, error }: { label: string; value: string; onChange: (v: string) => void; error?: string }) {
  return (
    <Field label={label} error={error}>
      <input
        type="datetime-local"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={error ? true : undefined}
        className={`h-12 w-full rounded-xl border bg-card px-3 text-body text-text-primary ${error ? 'border-error' : 'border-border'}`}
        required
      />
    </Field>
  );
}

function TextArea({
  label, hint, value, onChange, rows, error,
}: { label: string; hint?: string; value: string; onChange: (v: string) => void; rows: number; error?: string }) {
  return (
    <Field label={label} error={error}>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
        aria-invalid={error ? true : undefined}
        className={`w-full rounded-xl border bg-card p-3 font-mono text-caption text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/40 ${error ? 'border-error' : 'border-border'}`}
      />
      {hint && !error && <span className="text-xs text-text-secondary">{hint}</span>}
    </Field>
  );
}
