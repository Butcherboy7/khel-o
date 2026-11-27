'use client';

import { useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import type { TeamDesk } from '@/lib/api/teamChallenges';

const REFUND_ID = /^rfnd_[A-Za-z0-9]+$/;

type Row = TeamDesk['refundNeeded'][number];

/**
 * Payments where the money was taken, no team or player could be made, and the automatic refund
 * failed. The admin refunds it by hand in the Razorpay dashboard, then types the real refund id
 * here. Nothing is refunded from this screen and nothing is retried automatically.
 */
export function RefundNeeded({ rows, busy, onResolve }: {
  rows: Row[];
  busy: string | null;
  onResolve: (paymentId: string, refundId: string) => void;
}) {
  const [ids, setIds] = useState<Record<string, string>>({});
  const [sure, setSure] = useState<Record<string, boolean>>({});
  if (!rows || rows.length === 0) return null;
  return (
    <section role="alert" aria-label="Refund needed" className="mt-4 rounded-2xl border border-error/60 bg-error/10 p-4">
      <h2 className="flex items-center gap-2 text-body font-bold text-text-primary">
        <AlertTriangle className="h-5 w-5 text-error" aria-hidden /> Refund needed ({rows.length})
      </h2>
      <p className="mt-1 text-body-sm text-text-secondary">
        These people paid, but no team or player could be made, and the automatic refund did not go through.
        Refund each one in the Razorpay dashboard, check it is there, then paste the refund id (starts with rfnd_) and confirm.
        It is only marked refunded after you do.
      </p>
      <ul className="mt-3 flex flex-col gap-2">
        {rows.map((r) => {
          const v = (ids[r.id] || '').trim();
          const valid = REFUND_ID.test(v);
          return (
            <li key={r.id} className="rounded-xl bg-card p-3">
              <p className="text-body-sm text-text-primary">
                <b>{r.name || 'A player'}</b> · {r.kind} · ₹{r.amount.toLocaleString('en-IN')}
                {r.email && <> · {r.email}</>}
              </p>
              <p className="text-caption text-text-secondary">
                {r.reason || 'No reason recorded'}{r.razorpayPaymentId ? ` · Razorpay payment ${r.razorpayPaymentId}` : ''}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <input
                  className="h-10 min-w-[220px] flex-1 rounded-xl border border-border bg-card px-3 text-body-sm text-text-primary"
                  placeholder="Razorpay refund id (rfnd_…)"
                  aria-label={`Razorpay refund id for ${r.name || 'this payment'}`}
                  value={ids[r.id] || ''}
                  onChange={(e) => setIds((s) => ({ ...s, [r.id]: e.target.value }))}
                />
                <label className="flex items-center gap-1.5 text-caption text-text-primary">
                  <input type="checkbox" checked={!!sure[r.id]} onChange={(e) => setSure((s) => ({ ...s, [r.id]: e.target.checked }))} />
                  I saw this refund in Razorpay
                </label>
                <button
                  type="button"
                  className="inline-flex min-h-[40px] items-center justify-center rounded-xl bg-primary px-3 text-caption font-semibold text-white hover:bg-primary/90 disabled:opacity-50"
                  disabled={!valid || !sure[r.id] || busy === `rd${r.id}`}
                  onClick={() => onResolve(r.id, v)}
                >
                  Mark refunded
                </button>
              </div>
              {v && !valid && <p className="mt-1 text-caption text-error">A Razorpay refund id looks like rfnd_AbC123…</p>}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
