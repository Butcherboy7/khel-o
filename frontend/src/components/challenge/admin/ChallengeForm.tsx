'use client';

import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button, Card, CardContent, Input } from '@/components/ui';
import { adminCafeOptions, type Challenge, type ChallengeInput, type ChallengeStatus } from '@/lib/api/challenges';

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
  const cafes = useQuery({ queryKey: ['admin', 'challenge-cafes'], queryFn: adminCafeOptions, staleTime: 300_000 });

  useEffect(() => {
    if (initial) setF(fromChallenge(initial));
  }, [initial]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setF((s) => ({ ...s, [key]: value }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
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
      setError((err as Error).message || 'Could not save.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <Section title="Basics">
        <Input label="Title" value={f.title} onChange={(e) => set('title', e.target.value)} placeholder="KHELO Tekken Challenge #01" required />
        <Input
          label="Link name"
          hint={`khel-o.com/challenge/${f.slug || 'your-link'} — lowercase, numbers and dashes`}
          value={f.slug}
          onChange={(e) => set('slug', e.target.value)}
          placeholder="tekken-01"
          required
        />
        <Field label="Café">
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
          <Input label="Game" value={f.game} onChange={(e) => set('game', e.target.value)} placeholder="Tekken 8" required />
          <Input label="Setup line (optional)" value={f.setupLine} onChange={(e) => set('setupLine', e.target.value)} placeholder="One PS5 on a projector" />
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
          <DateTime label="Starts" value={f.startsAt} onChange={(v) => set('startsAt', v)} />
          <DateTime label="Ends" value={f.endsAt} onChange={(v) => set('endsAt', v)} />
          <DateTime label="Check-in opens" value={f.checkinOpensAt} onChange={(v) => set('checkinOpensAt', v)} />
          <DateTime label="Check-in closes" value={f.checkinClosesAt} onChange={(v) => set('checkinClosesAt', v)} />
        </div>
      </Section>

      <Section title="Format and spots">
        <Input label="Format" value={f.format} onChange={(e) => set('format', e.target.value)} />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Input label="Spots" type="number" min={1} max={256} value={f.capacity} onChange={(e) => set('capacity', Number(e.target.value))} />
          <Input label="Best of" type="number" min={1} max={9} value={f.bestOf} onChange={(e) => set('bestOf', Number(e.target.value))} />
          <Input label="Final best of" type="number" min={1} max={9} value={f.finalBestOf} onChange={(e) => set('finalBestOf', Number(e.target.value))} />
          <Input label="Minimum age" type="number" min={0} max={99} value={f.minAge} onChange={(e) => set('minAge', Number(e.target.value))} />
        </div>
      </Section>

      <Section title="Rewards and rules">
        <TextArea
          label="Rewards (shown on the public page)"
          hint="One per line, starting with “- ”. **bold** works. Never put a code here: this is public."
          value={f.prizesMd}
          onChange={(v) => set('prizesMd', v)}
          rows={6}
        />
        <TextArea label="Rules" hint="One rule per line, starting with “- ”." value={f.rulesMd} onChange={(v) => set('rulesMd', v)} rows={10} />
      </Section>

      <Section title="Links">
        <Input label="WhatsApp community link (optional)" value={f.communityUrl} onChange={(e) => set('communityUrl', e.target.value)} placeholder="https://chat.whatsapp.com/…" />
        <Input label="Instagram handle" value={f.instagramHandle} onChange={(e) => set('instagramHandle', e.target.value)} placeholder="khelo.journey" />
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

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-caption font-semibold text-text-primary">{label}</span>
      {children}
    </label>
  );
}

function DateTime({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <Field label={label}>
      <input
        type="datetime-local"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-12 w-full rounded-xl border border-border bg-card px-3 text-body text-text-primary"
        required
      />
    </Field>
  );
}

function TextArea({ label, hint, value, onChange, rows }: { label: string; hint?: string; value: string; onChange: (v: string) => void; rows: number }) {
  return (
    <Field label={label}>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
        className="w-full rounded-xl border border-border bg-card p-3 font-mono text-caption text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
      />
      {hint && <span className="text-xs text-text-secondary">{hint}</span>}
    </Field>
  );
}
