'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery } from '@tanstack/react-query';
import { claimGta6Offer, getGta6Offer, offerWhen } from '@/lib/api/gta6Offers';
import { useAuthStore } from '@/store/authStore';
import { PageSpinner } from '@/components/ui';

const left = (iso: string, now: number) => Math.max(0, Math.floor((Date.parse(iso) - now) / 1000));
const clockText = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

export default function OfferClient({ token }: { token: string }) {
  const router = useRouter();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const { data, isLoading, isError } = useQuery({ queryKey: ['gta6-offer', token], queryFn: () => getGta6Offer(token), refetchInterval: 20_000 });
  const claim = useMutation({ mutationFn: () => claimGta6Offer(token), onSuccess: (r) => router.push(`/bookings/${r.bookingId}`) });

  if (isLoading) return <PageSpinner label="Loading your slot" />;
  const o = data?.offer;
  if (isError || !o) return <Shell title="This link isn't valid" body="Ask us on WhatsApp and we will check the slot for you." />;

  const secs = left(o.expiresAt, now);
  if (o.status !== 'open' || secs <= 0) {
    return (
      <Shell
        title={o.status === 'claimed' ? 'This slot was just taken' : 'This link has run out'}
        body="It was first come, first served. Message us on WhatsApp and we will find you another time."
      />
    );
  }
  const err = (claim.error as { message?: string } | null)?.message;
  return (
    <main className="mx-auto flex min-h-[70vh] max-w-md flex-col justify-center gap-4 px-4 py-10">
      <p className="text-caption font-semibold text-text-secondary">{`${o.cafe?.name ?? ''}${o.cafe?.area ? `, ${o.cafe.area}` : ''}`}</p>
      <div role="dialog" aria-modal="false" aria-labelledby="offer-h" className="flex flex-col gap-4 rounded-3xl bg-card p-5 shadow-lg ring-1 ring-border">
        <div>
          <h1 id="offer-h" className="font-heading text-h3 font-bold text-text-primary">
            This is the only slot available
          </h1>
          <p className="mt-1 text-body text-text-secondary">
            It is confirmed free with the café. Book it right now, or it might be taken by someone else.
          </p>
        </div>
        <dl className="flex flex-col divide-y divide-border rounded-2xl border border-border text-body">
          <Row k="Console" v={o.tier?.name ?? ''} />
          <Row k="When" v={offerWhen(o)} />
          {o.price != null && <Row k="Total" v={`₹${Math.round(o.price)}`} />}
          <Row k="Pay now" v={o.price != null ? `₹${Math.ceil(o.price / 2)} (50% in advance)` : '50% in advance'} />
        </dl>
        <p className="text-caption text-text-secondary">
          Link open for <b className="text-text-primary">{clockText(secs)}</b>. After you tap below you have 15 minutes to pay. Be there 10 to 15 minutes before your start or the café can give your seat away.
        </p>
        {err && (
          <p role="alert" className="text-body text-error">
            {err}
          </p>
        )}
        <button
          type="button"
          disabled={claim.isPending}
          onClick={() => (isAuthenticated ? claim.mutate() : router.push(`/login?redirect=${encodeURIComponent(`/gta6/offer/${token}`)}`))}
          className="btn-depth min-h-[52px] rounded-xl bg-primary px-6 text-body font-bold text-white disabled:opacity-60"
        >
          {claim.isPending ? 'Holding your slot…' : isAuthenticated ? 'Book this slot now' : 'Sign in to book this slot'}
        </button>
      </div>
    </main>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3">
      <dt className="text-text-secondary">{k}</dt>
      <dd className="text-right font-semibold text-text-primary">{v}</dd>
    </div>
  );
}

function Shell({ title, body, children }: { title: string; body: string; children?: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-[70vh] max-w-md flex-col justify-center gap-4 px-4 py-10">
      <h1 className="font-heading text-h2 font-bold text-text-primary">{title}</h1>
      <p className="text-body text-text-secondary">{body}</p>
      {children}
    </main>
  );
}
