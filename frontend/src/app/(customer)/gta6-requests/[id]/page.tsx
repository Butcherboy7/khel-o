'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Check, Clock, MessageCircle, X } from 'lucide-react';
import { PageSpinner, ErrorState } from '@/components/ui';
import { founderWhatsAppUrl, getGta6Config, getGta6Request, type Gta6Request } from '@/lib/api/gta6Requests';

const left = (iso: string | null, now: number): string => {
  if (!iso) return '';
  const s = Math.max(0, Math.round((Date.parse(iso) - now) / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

const when = (r: Gta6Request) =>
  `${new Date(`${r.date}T12:00:00+05:30`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' })}, ${r.startTime} · ${r.hours} hr`;

/** Where a GTA 6 slot request stands: waiting for the café, approved (pay now), booked, or not available. */
export default function Gta6RequestPage() {
  const { id } = useParams<{ id: string }>();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const { data: r, isLoading, isError, refetch } = useQuery({
    queryKey: ['gta6-request', id],
    queryFn: () => getGta6Request(id),
    // Waiting or holding: keep checking, the founder may answer any minute.
    refetchInterval: (q) => (q.state.data?.status === 'requested' || q.state.data?.status === 'approved' ? 6000 : false),
  });
  const { data: cfg } = useQuery({ queryKey: ['gta6-config'], queryFn: getGta6Config, staleTime: 60_000, retry: false });

  if (isLoading) return <PageSpinner label="Loading your request" />;
  if (isError || !r) return <ErrorState title="Couldn't load this request" message="Check your connection and try again." onRetry={() => refetch()} />;

  const cafeHref = `/cafe/${r.cafe?.slug || r.cafe?.id || ''}`;
  const wa = cfg?.whatsapp ? founderWhatsAppUrl(cfg.whatsapp, r) : null;
  const card = 'rounded-2xl border border-border bg-card p-4 shadow-card';

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-4 px-4 py-6">
      <header>
        <p className="text-[11px] font-bold uppercase tracking-wider text-primary">GTA 6 · request {r.reference}</p>
        <h1 className="font-heading text-h2 font-bold text-text-primary">
          {r.status === 'requested' && 'Checking with the café'}
          {r.status === 'approved' && 'The café said yes'}
          {r.status === 'booked' && 'You are booked'}
          {(r.status === 'declined' || r.status === 'cancelled') && 'That slot is not available'}
          {r.status === 'expired' && 'This request ran out of time'}
        </h1>
        <p className="mt-1 text-body text-text-secondary">
          {r.cafe?.name} · {r.tier?.name} · {when(r)}
        </p>
      </header>

      {r.status === 'requested' && (
        <>
          <div className={card}>
            <p className="flex items-center gap-2 font-heading text-body-emphasis font-bold text-text-primary">
              <Clock className="h-4 w-4 text-primary" aria-hidden /> We are asking the café now
            </p>
            <p className="mt-1 text-body text-text-secondary">
              GTA 6 is in high demand, so we confirm the slot with the café before you pay. This usually takes about 10 minutes. We will notify you here, by
              notification and by email.
            </p>
          </div>
          {wa ? (
            <a
              href={wa}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-depth flex min-h-[52px] items-center justify-center gap-2 rounded-2xl bg-[#25D366] px-5 text-body-emphasis font-bold text-white"
            >
              <MessageCircle className="h-5 w-5" aria-hidden /> Message us on WhatsApp
            </a>
          ) : null}
          <p className="text-caption text-text-secondary">
            {wa ? 'Tap the button and send the message, so we can reply faster. ' : ''}
            If nobody answers within an hour, this request closes and you can try another time.
          </p>
        </>
      )}

      {r.status === 'approved' && (
        <div className={card}>
          <p className="flex items-center gap-2 font-heading text-body-emphasis font-bold text-text-primary">
            <Check className="h-4 w-4 text-success" aria-hidden /> Your seat is held
          </p>
          <p className="mt-1 text-body text-text-secondary">
            Pay within <span className="font-bold tabular-nums text-text-primary">{left(r.payBy, now)}</span> to lock it. After that the hold ends.
          </p>
          <Link
            href={`/bookings/${r.bookingId}`}
            className="btn-depth mt-3 flex min-h-[52px] items-center justify-center gap-2 rounded-2xl bg-primary px-5 text-body-emphasis font-bold text-white"
          >
            Pay now <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        </div>
      )}

      {r.status === 'booked' && (
        <Link
          href={`/bookings/${r.bookingId}`}
          className="btn-depth flex min-h-[52px] items-center justify-center gap-2 rounded-2xl bg-primary px-5 text-body-emphasis font-bold text-white"
        >
          Open my booking <ArrowRight className="h-4 w-4" aria-hidden />
        </Link>
      )}

      {(r.status === 'declined' || r.status === 'cancelled' || r.status === 'expired') && (
        <div className={card}>
          <p className="flex items-center gap-2 font-heading text-body-emphasis font-bold text-text-primary">
            <X className="h-4 w-4 text-error" aria-hidden /> {r.status === 'expired' ? 'No answer in time' : 'The café can’t do that time'}
          </p>
          {r.note && <p className="mt-1 text-body text-text-secondary">{r.note}</p>}
          {r.suggestion && (
            <p className="mt-2 rounded-xl bg-success/10 px-3 py-2 text-body font-semibold text-text-primary">Try this instead: {r.suggestion}</p>
          )}
          <div className="mt-3 flex flex-col gap-2">
            <Link href={cafeHref} className="btn-depth flex min-h-[48px] items-center justify-center rounded-xl bg-primary px-4 text-body font-bold text-white">
              Pick another time at {r.cafe?.name}
            </Link>
            <Link href="/drops?game=gta6" className="flex min-h-[48px] items-center justify-center rounded-xl border border-border px-4 text-body font-bold text-text-primary">
              See other GTA 6 cafés
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
