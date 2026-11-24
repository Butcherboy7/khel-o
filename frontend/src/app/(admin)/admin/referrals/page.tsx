'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Copy } from 'lucide-react';
import { getAdminReferrals, saveReferralSettings, voidReferral, type AdminReferrals } from '@/lib/api/referrals';
import { Card, CardContent, ErrorState, PageSpinner } from '@/components/ui';
import { cn } from '@/lib/cn';

const STATUS_LABEL: Record<AdminReferrals['recent'][number]['status'], string> = {
  joined: 'Joined',
  rewarded: 'Played · rewarded',
  capped: 'Played · cap reached',
  void: 'Void',
};

const when = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });

export default function AdminReferralsPage() {
  const qc = useQueryClient();
  const { data, isLoading, isError, error, refetch } = useQuery({ queryKey: ['admin', 'referrals'], queryFn: getAdminReferrals, staleTime: 30_000 });

  if (isLoading) return <PageSpinner label="Loading referrals" />;
  if (isError || !data) {
    return <ErrorState title="Couldn't load referrals" message={(error as Error)?.message || 'Failed to fetch.'} onRetry={() => refetch()} />;
  }
  const r = data.referrals;
  const used = data.credits.used ?? { count: 0, amount: 0 };
  const waiting = data.credits.available ?? { count: 0, amount: 0 };

  return (
    <div className="flex flex-col gap-6 pb-12">
      <div>
        <h1 className="font-heading text-h2 text-text-primary lg:text-h1">Referrals</h1>
        <p className="mt-0.5 max-w-[70ch] text-body text-text-secondary">
          ₹ off first bookings and for friends who bring friends. KHEL-O pays every rupee; cafés are paid their full price.
          Rewards are discounts on bookings only, never cash.
        </p>
      </div>

      <SettingsCard data={data} onSaved={() => qc.invalidateQueries({ queryKey: ['admin', 'referrals'] })} />

      <section aria-label="Numbers" className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Friends joined from a link" value={r.joined + r.rewarded + r.capped} />
        <Stat label="Of them played" value={r.rewarded + r.capped} />
        <Stat label="KHEL-O credit on paid bookings" value={`₹${Math.round(data.spent.amount)}`} sub={`${data.spent.bookings} bookings`} />
        <Stat label="Friend rewards" value={`${used.count} used`} sub={`${waiting.count} waiting · ₹${Math.round(waiting.amount)}`} />
      </section>
      <p className="-mt-3 text-caption text-text-secondary">
        <span className="tabular-nums">{data.spent.withCommunityCode}</span> paid bookings used the community code,{' '}
        <span className="tabular-nums">{data.spent.withFriendReward}</span> used a friend reward.
      </p>

      {data.top.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="font-heading text-h3 text-text-primary">Who brings the most friends</h2>
          <div className="overflow-x-auto rounded-xl border border-border bg-card">
            <table className="w-full min-w-[360px] text-left text-caption">
              <tbody className="tabular-nums">
                {data.top.map((t) => (
                  <tr key={t.email} className="border-b border-border/60 last:border-0">
                    <td className="px-3 py-2 font-semibold text-text-primary">{t.name}</td>
                    <td className="px-3 py-2 text-text-secondary">{t.email}</td>
                    <td className="px-3 py-2 text-right">{t.friends}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <RecentReferrals data={data} onChanged={() => qc.invalidateQueries({ queryKey: ['admin', 'referrals'] })} />
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: number | string; sub?: string }) {
  return (
    <Card elevation="resting">
      <CardContent className="flex flex-col gap-0.5 p-4">
        <span className="text-caption text-text-secondary">{label}</span>
        <span className="font-heading text-h2 font-bold tabular-nums text-text-primary">{value}</span>
        {sub && <span className="text-caption tabular-nums text-text-secondary">{sub}</span>}
      </CardContent>
    </Card>
  );
}

function SettingsCard({ data, onSaved }: { data: AdminReferrals; onSaved: () => void }) {
  const s = data.settings;
  const [on, setOn] = useState(s.referralsOn);
  const [welcome, setWelcome] = useState(String(s.welcomeCredit));
  const [community, setCommunity] = useState(String(s.communityCredit));
  const [reward, setReward] = useState(String(s.referralReward));
  const [code, setCode] = useState(s.communityCode ?? '');
  const [copied, setCopied] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setOn(s.referralsOn);
    setWelcome(String(s.welcomeCredit));
    setCommunity(String(s.communityCredit));
    setReward(String(s.referralReward));
    setCode(s.communityCode ?? '');
  }, [s.referralsOn, s.welcomeCredit, s.communityCredit, s.referralReward, s.communityCode]);

  const save = useMutation({
    mutationFn: () =>
      saveReferralSettings({
        referralsOn: on,
        welcomeCredit: Number(welcome) || 0,
        communityCredit: Number(community) || 0,
        referralReward: Number(reward) || 0,
        communityCode: code.trim(),
      }),
    onSuccess: () => {
      setErr(null);
      onSaved();
    },
    onError: (e: Error) => setErr(e.message || 'Could not save.'),
  });

  const firstMax = (Number(welcome) || 0) + (code.trim() ? Number(community) || 0 : 0);
  const announcement = `🎮 New on KHEL-O: ₹${Number(community) || 0} off your first booking with code ${code.trim().toUpperCase() || 'CODE'}. Type it in "Have a code?" at checkout. Members only, don't share it outside the group.`;
  const dirty =
    on !== s.referralsOn ||
    welcome !== String(s.welcomeCredit) ||
    community !== String(s.communityCredit) ||
    reward !== String(s.referralReward) ||
    code.trim().toUpperCase() !== (s.communityCode ?? '');

  return (
    <Card elevation="resting">
      <CardContent className="flex flex-col gap-4 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-heading text-h3 text-text-primary">Programme</h2>
            <p className="text-caption text-text-secondary">
              {on
                ? `On. A first booking can be up to ₹${Math.min(firstMax, s.maxPerBooking)} off; at most ₹${s.maxPerBooking} of credit per booking, sessions of ₹${s.minSession}+.`
                : 'Off. Nobody gets credits and invite cards don’t mention them.'}
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={on}
            onClick={() => setOn((v) => !v)}
            className={cn(
              'relative h-7 w-12 flex-shrink-0 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
              on ? 'bg-success' : 'bg-border',
            )}
          >
            <span className="sr-only">Referrals on</span>
            <span className={cn('absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-transform', on ? 'translate-x-6' : 'translate-x-1')} />
          </button>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Money label="Welcome, every first booking" value={welcome} onChange={setWelcome} />
          <Money label="Community code, first booking" value={community} onChange={setCommunity} />
          <Money label="Friend reward, per friend who plays" value={reward} onChange={setReward} />
        </div>

        <label className="flex flex-col gap-1">
          <span className="text-caption font-semibold text-text-primary">Community code</span>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="e.g. SQUAD-NOV"
            maxLength={20}
            className="min-h-[44px] w-full max-w-xs rounded-xl border border-border bg-card px-3 font-data text-body uppercase tracking-wide text-text-primary focus:border-primary focus:outline-none"
          />
          <span className="text-caption text-text-secondary">
            Post it only in WhatsApp community announcements. Change it any time; the old one stops working. Empty = no community credit.
          </span>
        </label>

        {code.trim() && (
          <div className="flex flex-col gap-2 rounded-xl bg-surface p-3">
            <span className="text-caption font-semibold text-text-primary">Announcement to post</span>
            <p className="text-caption text-text-secondary">{announcement}</p>
            <button
              type="button"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(announcement);
                  setCopied(true);
                  window.setTimeout(() => setCopied(false), 1500);
                } catch {
                  /* clipboard blocked: the text is on screen to copy by hand */
                }
              }}
              className="inline-flex min-h-[40px] items-center gap-1.5 self-start rounded-lg border border-border px-3 text-caption font-semibold text-text-primary hover:border-text-secondary"
            >
              {copied ? <Check className="h-4 w-4 text-success" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />}
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
        )}

        {err && <p className="text-caption font-semibold text-error">{err}</p>}
        <div className="flex items-center gap-3">
          <button
            type="button"
            disabled={!dirty || save.isPending}
            onClick={() => save.mutate()}
            className="btn-depth inline-flex min-h-[44px] items-center rounded-xl bg-primary px-5 font-bold text-white disabled:opacity-50"
          >
            {save.isPending ? 'Saving…' : 'Save'}
          </button>
          {!dirty && !save.isPending && save.isSuccess && <span className="text-caption text-success">Saved</span>}
        </div>
      </CardContent>
    </Card>
  );
}

function Money({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-caption font-semibold text-text-primary">{label}</span>
      <span className="flex min-h-[44px] items-center rounded-xl border border-border bg-card px-3 focus-within:border-primary">
        <span className="text-text-secondary">₹</span>
        <input
          inputMode="numeric"
          value={value}
          onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, 3))}
          className="w-full bg-transparent px-1 font-data text-body tabular-nums text-text-primary focus:outline-none"
        />
      </span>
    </label>
  );
}

function RecentReferrals({ data, onChanged }: { data: AdminReferrals; onChanged: () => void }) {
  const [voiding, setVoiding] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const doVoid = useMutation({
    mutationFn: ({ id, why }: { id: string; why: string }) => voidReferral(id, why),
    onSuccess: () => {
      setVoiding(null);
      setReason('');
      onChanged();
    },
  });

  return (
    <section className="flex flex-col gap-2">
      <h2 className="font-heading text-h3 text-text-primary">Latest referrals</h2>
      {data.recent.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border p-4 text-body text-text-secondary">
          No referrals yet. They appear when someone signs in after opening a friend’s invite link.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full min-w-[640px] text-left text-caption">
            <thead className="border-b border-border text-text-secondary">
              <tr>
                <th className="px-3 py-2 font-semibold">When</th>
                <th className="px-3 py-2 font-semibold">Invited by</th>
                <th className="px-3 py-2 font-semibold">Friend</th>
                <th className="px-3 py-2 font-semibold">Status</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {data.recent.map((r) => (
                <tr key={r.id} className="border-b border-border/60 align-top last:border-0">
                  <td className="whitespace-nowrap px-3 py-2 tabular-nums text-text-secondary">{when(r.createdAt)}</td>
                  <td className="px-3 py-2">
                    <span className="block font-semibold text-text-primary">{r.referrer}</span>
                    <span className="text-text-secondary">{r.referrerEmail}</span>
                  </td>
                  <td className="px-3 py-2">
                    <span className="block font-semibold text-text-primary">{r.friend}</span>
                    <span className="text-text-secondary">{r.friendEmail}</span>
                  </td>
                  <td className="px-3 py-2">
                    <span className={cn('font-semibold', r.status === 'void' ? 'text-error' : r.status === 'joined' ? 'text-text-secondary' : 'text-success')}>
                      {STATUS_LABEL[r.status]}
                    </span>
                    {r.voidReason && <span className="block text-text-secondary">{r.voidReason}</span>}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {r.status !== 'void' &&
                      (voiding === r.id ? (
                        <span className="flex items-center justify-end gap-2">
                          <input
                            autoFocus
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                            placeholder="Why (e.g. same person)"
                            className="min-h-[36px] w-44 rounded-lg border border-border px-2"
                          />
                          <button
                            type="button"
                            disabled={reason.trim().length < 2 || doVoid.isPending}
                            onClick={() => doVoid.mutate({ id: r.id, why: reason.trim() })}
                            className="min-h-[36px] rounded-lg bg-error px-3 font-semibold text-white disabled:opacity-50"
                          >
                            Void
                          </button>
                          <button type="button" onClick={() => setVoiding(null)} className="min-h-[36px] px-1 text-text-secondary hover:underline">
                            Cancel
                          </button>
                        </span>
                      ) : (
                        <button type="button" onClick={() => setVoiding(r.id)} className="min-h-[36px] font-semibold text-text-secondary hover:text-error">
                          Void
                        </button>
                      ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
