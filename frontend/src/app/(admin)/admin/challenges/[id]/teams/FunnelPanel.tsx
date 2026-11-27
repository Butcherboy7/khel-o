'use client';

import { useEffect, useState } from 'react';
import { adminTeams, type ChallengeFunnel, type FunnelRow } from '@/lib/api/teamChallenges';

const pct = (n: number | null) => (n === null ? '' : `${n}%`);

/**
 * Who opened the sign-up page, who got how far, and what really happened to the money.
 * "Browser" rows are people's taps (our own devices and bots removed). "Database" rows are the payment
 * records: only those count as real payments and real registrations.
 */
export function FunnelPanel({ id }: { id: string }) {
  const [f, setF] = useState<ChallengeFunnel | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    adminTeams.funnel(id).then(setF).catch(() => setFailed(true));
  }, [id]);

  if (failed) {
    return (
      <section className="mt-4 rounded-2xl border border-border bg-card p-4">
        <h2 className="text-body font-semibold text-text-primary">Sign-up funnel</h2>
        <p className="mt-1 text-body-sm text-text-secondary">Couldn’t load the funnel. Refresh to try again.</p>
      </section>
    );
  }
  if (!f) return null;

  const top = f.steps[0]?.count || 0;
  const o = f.outcomes;
  const attention = o.paidWithoutEntry > 0;

  return (
    <section className="mt-4 rounded-2xl border border-border bg-card p-4">
      <h2 className="text-body font-semibold text-text-primary">Sign-up funnel</h2>
      <p className="mt-0.5 text-caption text-text-secondary">{f.note}</p>

      {attention && (
        <p role="alert" className="mt-3 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-body-sm font-medium text-red-300">
          {o.paidWithoutEntry} payment{o.paidWithoutEntry === 1 ? '' : 's'} paid but no team or player was made. Check the payment in Razorpay and refund or fix it.
        </p>
      )}

      <ol className="mt-3 space-y-2">
        {f.steps.map((s) => (
          <li key={s.key}>
            <div className="flex items-baseline justify-between gap-3 text-body-sm">
              <span className="text-text-primary">
                {s.label}
                <span className="ml-2 rounded-full border border-border px-1.5 py-0.5 text-[11px] text-text-secondary">
                  {s.source === 'browser' ? 'taps' : 'real'}
                </span>
              </span>
              <span className="tabular-nums text-text-primary">
                <b>{s.count}</b>
                {s.ofPrevious !== null && <span className="ml-2 text-text-secondary">{pct(s.ofPrevious)} of last step</span>}
              </span>
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-border" aria-hidden>
              <div
                className={`h-full rounded-full ${s.source === 'browser' ? 'bg-text-secondary' : 'bg-primary'}`}
                style={{ width: `${top ? Math.min(100, Math.round((100 * s.count) / top)) : 0}%` }}
              />
            </div>
          </li>
        ))}
      </ol>

      <dl className="mt-4 grid grid-cols-2 gap-2 text-body-sm sm:grid-cols-3">
        <Fact label="Visitors who came back another day" value={f.visitors.returnedAnotherDay} />
        <Fact label="Tapped Sign up: team / solo" value={`${f.signupByKind.team} / ${f.signupByKind.solo}`} hint={f.signupByKind.unspecified ? `${f.signupByKind.unspecified} did not pick` : undefined} />
        <Fact label="Finished details: team / solo" value={`${f.detailsByKind.team} / ${f.detailsByKind.solo}`} />
        <Fact label="Paid: team / solo" value={`${o.paidTeam} / ${o.paidSolo}`} />
        <Fact label="Registered teams / solo players" value={`${o.registeredTeams} / ${o.registeredSolos}`} />
        <Fact label="Refunded (money came back)" value={o.refunded} />
        <Fact label="Payment marked failed" value={o.failedRecorded} />
        <Fact label="Started, not paid" value={o.startedNotPaid} />
        <Fact label="Community clicks" value={f.engagement.communityClicks} hint="a click, not a confirmed join" />
        <Fact label="Share sheet opened" value={f.engagement.shareSheetOpened} hint="not a referral" />
        <Fact label="Share links made / opened by others" value={`${f.engagement.shareLinksCreated} / ${f.engagement.shareLinksOpenedByOthers}`} />
        <Fact label="Maps / KHEL-O link taps" value={`${f.engagement.mapClicks} / ${f.engagement.kheloLinkClicks}`} />
      </dl>

      <div className="mt-4 rounded-lg border border-border px-3 py-2 text-body-sm">
        <p className="font-medium text-text-primary">At the payment window (people, not payments)</p>
        <p className="mt-0.5 text-text-secondary">
          Failed {f.checkout.failedSessions} · Closed the window {f.checkout.dismissedSessions} · Could not confirm {f.checkout.couldNotConfirmSessions}
        </p>
        <p className="mt-0.5 text-caption text-text-secondary">{f.checkout.note}</p>
      </div>

      <p className={`mt-3 text-body-sm ${f.reconciliation.match ? 'text-text-secondary' : 'font-medium text-amber-300'}`}>
        Browsers reported {f.reconciliation.browserSaidPaid} paid, payment records show {f.reconciliation.databasePaid}
        {f.reconciliation.match ? ' (they agree).' : ' (they differ: trust the payment records).'}
      </p>

      <Table title="By link or source" rows={f.sources} />
      <Table title="By device" rows={f.devices} />
    </section>
  );
}

function Fact({ label, value, hint }: { label: string; value: number | string; hint?: string }) {
  return (
    <div className="rounded-lg border border-border px-3 py-2">
      <dt className="text-caption text-text-secondary">{label}</dt>
      <dd className="mt-0.5 text-body font-semibold tabular-nums text-text-primary">{value}</dd>
      {hint && <dd className="text-caption text-text-secondary">{hint}</dd>}
    </div>
  );
}

function Table({ title, rows }: { title: string; rows: FunnelRow[] }) {
  if (rows.length === 0) return null;
  return (
    <div className="mt-4 overflow-x-auto">
      <h3 className="text-body-sm font-semibold text-text-primary">{title}</h3>
      <table className="mt-1 w-full text-left text-body-sm">
        <thead className="text-caption text-text-secondary">
          <tr>
            <th className="py-1 pr-3 font-medium">{title.replace('By ', '')}</th>
            <th className="px-2 font-medium">Opened</th>
            <th className="px-2 font-medium">Tapped Sign up</th>
            <th className="px-2 font-medium">Opened payment</th>
            <th className="px-2 font-medium">Paid</th>
            <th className="px-2 font-medium">Opened → paid</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.name} className="border-t border-border">
              <td className="py-2 pr-3 font-medium text-text-primary">{r.name}</td>
              <td className="px-2 tabular-nums">{r.visitors}</td>
              <td className="px-2 tabular-nums">{r.signup}</td>
              <td className="px-2 tabular-nums">{r.payStarted}</td>
              <td className="px-2 tabular-nums">{r.paid}</td>
              <td className="px-2 tabular-nums">{r.visitors ? `${Math.round((100 * r.paid) / r.visitors)}%` : ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
