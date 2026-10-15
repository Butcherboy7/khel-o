'use client';

import { useQuery } from '@tanstack/react-query';
import { ShieldCheck } from 'lucide-react';
import { getBotBlocks } from '@/lib/api/adminAnalytics';

const KIND: Record<string, string> = { register: 'sign-ups', login: 'logins', forgot: 'password resets' };
const REASON: Record<string, string> = {
  too_fast: 'filled the form faster than a person can',
  trap: 'filled in the hidden field',
  no_ticket: 'skipped the page and posted straight to the server',
  limit_ip: 'too many tries from one connection',
  limit_email: 'too many tries for one email',
};

/** "Bots stopped": what the invisible sign-up/login checks blocked lately. */
export function BotsStoppedCard() {
  const { data } = useQuery({ queryKey: ['admin', 'bot-blocks', 14], queryFn: () => getBotBlocks(14), staleTime: 60_000 });
  if (!data) return null;
  const kinds = Object.entries(data.byKind).sort((a, b) => b[1] - a[1]);
  const reasons = Object.entries(data.byReason).sort((a, b) => b[1] - a[1]);
  return (
    <section className="flex flex-col gap-2 rounded-2xl border border-border bg-card p-4">
      <div className="flex items-center gap-2">
        <ShieldCheck className="h-5 w-5 text-success" aria-hidden />
        <h2 className="font-heading text-h3 text-text-primary">Bots stopped</h2>
      </div>
      {data.blocked === 0 ? (
        <p className="text-body text-text-secondary">
          No bot attempts in the last {data.days} days. {data.allowed} real sign-ups, logins and resets went through.
        </p>
      ) : (
        <>
          <p className="text-body text-text-primary">
            <strong className="font-data tabular-nums">{data.blocked}</strong> bot attempts blocked in the last {data.days} days
            {kinds.length > 0 && <> ({kinds.map(([k, n]) => `${n} ${KIND[k] ?? k}`).join(', ')})</>}. No captcha: real
            people never see these checks.
          </p>
          <ul className="flex flex-col gap-0.5 text-caption text-text-secondary">
            {reasons.map(([r, n]) => (
              <li key={r}>
                <span className="font-data tabular-nums text-text-primary">{n}</span> {REASON[r] ?? r}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
