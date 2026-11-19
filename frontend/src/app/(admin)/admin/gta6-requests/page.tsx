'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, MessageCircle, Phone, X } from 'lucide-react';
import {
  allowGta6Request,
  declineGta6Request,
  getGta6Settings,
  listAdminGta6Requests,
  putGta6Settings,
  suggestGta6Request,
  type Gta6Request,
} from '@/lib/api/gta6Requests';
import { Card, CardContent, EmptyState, ErrorState, PageSpinner } from '@/components/ui';

type Tab = 'waiting' | 'allowed' | 'declined';
const TABS: { value: Tab; label: string }[] = [
  { value: 'waiting', label: 'Waiting' },
  { value: 'allowed', label: 'Allowed' },
  { value: 'declined', label: 'Declined' },
];

const digits = (s: string | null | undefined) => (s ?? '').replace(/\D/g, '');
const wa = (phone: string | null | undefined, text: string) => (digits(phone) ? `https://wa.me/${digits(phone)}?text=${encodeURIComponent(text)}` : null);
const day = (r: Gta6Request) =>
  new Date(`${r.date}T12:00:00+05:30`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' });
const ago = (iso: string) => {
  const m = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60000));
  return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : `${Math.round(m / 60)} hr ago`;
};

function SettingsPanel() {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ['admin', 'gta6-settings'], queryFn: getGta6Settings });
  const save = useMutation({
    mutationFn: putGta6Settings,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'gta6-settings'] }),
  });
  if (!data) return null;
  return (
    <Card>
      <CardContent className="flex flex-col gap-3 p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="font-heading text-body-emphasis font-bold text-text-primary">Check-first mode for GTA 6</p>
            <p className="text-caption text-text-secondary">
              {data.effective
                ? 'On. Players booking a GTA 6 console send a request and you allow it.'
                : data.on
                ? 'Switched on, but the end date has passed, so bookings are normal.'
                : 'Off. GTA 6 consoles book normally.'}
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={data.on}
            onClick={() => save.mutate({ on: !data.on })}
            className={`relative h-8 w-14 flex-none rounded-full transition-colors ${data.on ? 'bg-success' : 'bg-border'}`}
          >
            <span className={`absolute top-1 h-6 w-6 rounded-full bg-white shadow transition-all ${data.on ? 'left-7' : 'left-1'}`} />
            <span className="sr-only">{data.on ? 'Turn off' : 'Turn on'}</span>
          </button>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-caption font-semibold text-text-primary">
            Stop automatically after
            <input
              type="date"
              value={data.until ?? ''}
              onChange={(e) => save.mutate({ until: e.target.value || null })}
              className="mt-1 min-h-[44px] w-full rounded-xl border border-border bg-card px-3 text-body"
            />
          </label>
          <label className="block text-caption font-semibold text-text-primary">
            WhatsApp number players message
            <input
              type="tel"
              defaultValue={data.whatsapp ?? ''}
              onBlur={(e) => e.target.value !== (data.whatsapp ?? '') && save.mutate({ whatsapp: e.target.value })}
              placeholder="918142128389"
              className="mt-1 min-h-[44px] w-full rounded-xl border border-border bg-card px-3 text-body"
            />
          </label>
        </div>
        {save.isError && <p role="alert" className="text-caption text-error">{(save.error as Error).message}</p>}
      </CardContent>
    </Card>
  );
}

function RequestCard({ r, onDone }: { r: Gta6Request; onDone: () => void }) {
  const [mode, setMode] = useState<'none' | 'decline' | 'suggest'>('none');
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const run = useMutation({
    mutationFn: async (kind: 'allow' | 'decline' | 'suggest') => {
      if (kind === 'allow') return allowGta6Request(r.id);
      if (kind === 'decline') return declineGta6Request(r.id, text.trim() || undefined);
      return suggestGta6Request(r.id, text.trim());
    },
    onSuccess: () => {
      setError(null);
      onDone();
    },
    onError: (e) => setError((e as Error).message),
  });
  const slot = `${day(r)}, ${r.startTime} for ${r.hours} hr`;
  const toCafe = wa(r.cafePhone, `Hi, a KHEL-O player wants ${r.tier?.name} for GTA 6 on ${slot}. Is it free?`);
  const toPlayer = wa(r.player?.phone, `Hi ${r.player?.name ?? ''}, this is KHEL-O about your GTA 6 request ${r.reference}.`);
  const open = r.status === 'requested';
  const link = 'inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-border px-3 text-caption font-bold text-text-primary';

  return (
    <Card>
      <CardContent className="flex flex-col gap-3 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-heading text-body-emphasis font-bold text-text-primary">
              {r.cafe?.name} · {r.tier?.name}
            </p>
            <p className="text-body text-text-primary">{slot}</p>
            <p className="text-caption text-text-secondary">
              {r.player?.name} · {r.player?.phone ?? 'no phone'} · {r.reference} · {ago(r.createdAt)}
            </p>
          </div>
          <span className="flex-none rounded-full bg-primary/10 px-2.5 py-1 text-caption font-bold capitalize text-primary">{r.status}</span>
        </div>

        {(r.note || r.suggestion) && (
          <p className="rounded-xl bg-card px-3 py-2 text-caption text-text-secondary">
            {r.note}
            {r.suggestion ? ` Suggested: ${r.suggestion}` : ''}
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          {toCafe ? (
            <a href={toCafe} target="_blank" rel="noopener noreferrer" className={link}>
              <MessageCircle className="h-4 w-4 text-[#25D366]" aria-hidden /> WhatsApp the café
            </a>
          ) : (
            <span className="inline-flex min-h-[44px] items-center text-caption text-text-secondary">No café number</span>
          )}
          {toPlayer && (
            <a href={toPlayer} target="_blank" rel="noopener noreferrer" className={link}>
              <Phone className="h-4 w-4" aria-hidden /> WhatsApp the player
            </a>
          )}
        </div>

        {open && mode === 'none' && (
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={run.isPending} onClick={() => run.mutate('allow')} className="btn-depth inline-flex min-h-[48px] items-center gap-1.5 rounded-xl bg-success px-5 text-body font-bold text-white disabled:opacity-60">
              <Check className="h-4 w-4" aria-hidden /> {run.isPending ? 'Holding the seat…' : 'Allow'}
            </button>
            <button type="button" onClick={() => setMode('decline')} className="inline-flex min-h-[48px] items-center gap-1.5 rounded-xl border border-error px-4 text-body font-bold text-error">
              <X className="h-4 w-4" aria-hidden /> Decline
            </button>
            <button type="button" onClick={() => setMode('suggest')} className="inline-flex min-h-[48px] items-center rounded-xl border border-border px-4 text-body font-bold text-text-primary">
              Suggest another slot
            </button>
          </div>
        )}

        {open && mode !== 'none' && (
          <div className="flex flex-col gap-2">
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={mode === 'suggest' ? 'e.g. Sat 21 Nov, 9 PM works' : 'Optional note for the player'}
              className="min-h-[44px] rounded-xl border border-border bg-card px-3 text-body"
              maxLength={300}
            />
            <div className="flex gap-2">
              <button
                type="button"
                disabled={run.isPending || (mode === 'suggest' && text.trim().length < 2)}
                onClick={() => run.mutate(mode)}
                className="btn-depth min-h-[44px] rounded-xl bg-primary px-5 text-body font-bold text-white disabled:opacity-60"
              >
                {mode === 'suggest' ? 'Send suggestion' : 'Decline'}
              </button>
              <button type="button" onClick={() => setMode('none')} className="min-h-[44px] px-3 text-body font-semibold text-text-secondary">
                Cancel
              </button>
            </div>
          </div>
        )}
        {error && <p role="alert" className="rounded-xl bg-error/10 px-3 py-2 text-caption text-error">{error}</p>}
      </CardContent>
    </Card>
  );
}

export default function AdminGta6RequestsPage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>('waiting');
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['admin', 'gta6-requests', tab],
    queryFn: () => listAdminGta6Requests(tab),
    refetchInterval: 15_000,
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ['admin', 'gta6-requests'] });

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="font-heading text-h2 font-bold text-text-primary">GTA 6 slot requests</h1>
        <p className="text-body text-text-secondary">Check each one with the café on WhatsApp, then Allow. Allow holds the seat for the player for 15 minutes.</p>
      </div>
      <SettingsPanel />
      <div className="flex gap-2" role="tablist" aria-label="Request status">
        {TABS.map((t) => (
          <button
            key={t.value}
            role="tab"
            aria-selected={tab === t.value}
            onClick={() => setTab(t.value)}
            className={`min-h-[44px] rounded-full border px-4 text-caption font-bold ${tab === t.value ? 'border-primary bg-primary text-white' : 'border-border bg-card text-text-primary'}`}
          >
            {t.label}
            {t.value === 'waiting' && data ? ` (${data.waiting})` : ''}
          </button>
        ))}
      </div>
      {isLoading ? (
        <PageSpinner label="Loading requests" />
      ) : isError || !data ? (
        <ErrorState title="Couldn't load requests" message={(error as Error)?.message || 'Failed to fetch.'} onRetry={() => refetch()} />
      ) : data.items.length === 0 ? (
        <EmptyState title="Nothing here" description={tab === 'waiting' ? 'No request is waiting.' : 'Nothing in this list yet.'} />
      ) : (
        data.items.map((r) => <RequestCard key={r.id} r={r} onDone={refresh} />)
      )}
    </div>
  );
}
