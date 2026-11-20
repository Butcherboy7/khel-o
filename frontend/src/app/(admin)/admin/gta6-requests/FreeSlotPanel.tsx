'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Copy, MessageCircle } from 'lucide-react';
import { listCafes, getCafe } from '@/lib/api/cafes';
import {
  cancelGta6Offer,
  createGta6Offer,
  listGta6Offers,
  offerMessage,
  offerWhatsAppUrl,
  offerWhen,
  type Gta6Offer,
} from '@/lib/api/gta6Offers';

const field = 'min-h-[44px] w-full rounded-xl border border-border bg-card px-3 text-body';
const label = 'flex flex-col gap-1 text-caption font-semibold text-text-secondary';

const tomorrow = () => {
  const d = new Date(Date.now() + 86_400_000);
  return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
};

function linkFor(o: Gta6Offer) {
  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://khel-o.com';
  // Opens the normal checkout with the confirmed slot already chosen, so it is the page players already know.
  const q = new URLSearchParams({
    cafeId: o.cafe?.id ?? '', tierId: o.tier?.id ?? '', date: o.date, time: o.startTime, dayOffset: '0',
    duration: String(o.hours), seats: String(o.seats), offer: o.token,
  });
  return `${origin}/bookings/new?${q.toString()}`;
}

function ShareBox({ offer, phone }: { offer: Gta6Offer; phone: string }) {
  const [copied, setCopied] = useState(false);
  const text = offerMessage(offer, linkFor(offer));
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-success/40 bg-success/10 p-4">
      <p className="text-body-emphasis font-bold text-text-primary">Link ready. Send it on WhatsApp</p>
      <pre className="whitespace-pre-wrap break-words rounded-xl bg-card p-3 font-body text-body text-text-primary">{text}</pre>
      <div className="flex flex-wrap gap-2">
        <a
          href={offerWhatsAppUrl(phone, text)}
          target="_blank"
          rel="noopener noreferrer"
          className="btn-depth inline-flex min-h-[48px] items-center gap-2 rounded-xl bg-[#25D366] px-5 text-body font-bold text-black"
        >
          <MessageCircle className="h-4 w-4" aria-hidden /> Share on WhatsApp
        </a>
        <button
          type="button"
          onClick={() => {
            navigator.clipboard?.writeText(text).then(() => setCopied(true), () => undefined);
          }}
          className="inline-flex min-h-[48px] items-center gap-2 rounded-xl border border-border px-4 text-body font-bold text-text-primary"
        >
          <Copy className="h-4 w-4" aria-hidden /> {copied ? 'Copied' : 'Copy message'}
        </button>
      </div>
    </div>
  );
}

export default function FreeSlotPanel() {
  const qc = useQueryClient();
  const [cafeId, setCafeId] = useState('');
  const [tierId, setTierId] = useState('');
  const [date, setDate] = useState(tomorrow());
  const [start, setStart] = useState('14:00');
  const [hours, setHours] = useState(3);
  const [game, setGame] = useState<'gta6' | 'other'>('gta6');
  const [mins, setMins] = useState(30);
  const [phone, setPhone] = useState('');
  const [made, setMade] = useState<Gta6Offer | null>(null);

  const cafes = useQuery({ queryKey: ['admin', 'offer-cafes'], queryFn: () => listCafes({ limit: 50 }) });
  const detail = useQuery({ queryKey: ['admin', 'offer-cafe', cafeId], queryFn: () => getCafe(cafeId), enabled: !!cafeId });
  const tiers = (detail.data?.cafe.tiers ?? []).filter((t) => t.isActive !== false);
  const offers = useQuery({ queryKey: ['admin', 'gta6-offers'], queryFn: listGta6Offers, refetchInterval: 20_000 });

  const create = useMutation({
    mutationFn: () => createGta6Offer({ cafeId, hardwareTierId: tierId, sessionDate: date, startTime: start, durationHours: hours, game, minutesOpen: mins }),
    onSuccess: (r) => {
      setMade(r.offer);
      qc.invalidateQueries({ queryKey: ['admin', 'gta6-offers'] });
    },
  });
  const cancel = useMutation({
    mutationFn: cancelGta6Offer,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'gta6-offers'] }),
  });
  const err = (create.error as { message?: string } | null)?.message;

  return (
    <section className="flex flex-col gap-4 rounded-2xl bg-card p-4 shadow-sm ring-1 ring-border" aria-labelledby="free-slot-h">
      <div>
        <h2 id="free-slot-h" className="font-heading text-h3 font-bold text-text-primary">
          Confirmed a slot on WhatsApp? Share it
        </h2>
        <p className="text-body text-text-secondary">
          The café said yes. Make a link and send it. Whoever opens it and pays first gets the slot. Nothing is held until someone takes it.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className={label}>
          Café
          <select
            className={field}
            value={cafeId}
            onChange={(e) => {
              setCafeId(e.target.value);
              setTierId('');
              setMade(null);
            }}
          >
            <option value="">Pick a café</option>
            {(cafes.data?.items ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className={label}>
          Console
          <select
            className={field}
            value={tierId}
            onChange={(e) => {
              setTierId(e.target.value);
              setMade(null);
              const t = tiers.find((x) => x.id === e.target.value);
              setGame(t?.runsGta6 ? 'gta6' : 'other');
            }}
            disabled={!cafeId}
          >
            <option value="">{cafeId ? 'Pick a console' : 'Pick a café first'}</option>
            {tiers.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
        <label className={label}>
          Day
          <input type="date" className={field} value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label className={label}>
          Starts at
          <input type="time" className={field} value={start} onChange={(e) => setStart(e.target.value)} />
        </label>
        <label className={label}>
          Hours
          <select className={field} value={hours} onChange={(e) => setHours(Number(e.target.value))}>
            {[1, 1.5, 2, 3, 4, 5, 6].map((h) => (
              <option key={h} value={h}>
                {h} {h === 1 ? 'hour' : 'hours'}
              </option>
            ))}
          </select>
        </label>
        <label className={label}>
          Price
          <select className={field} value={game} onChange={(e) => setGame(e.target.value as 'gta6' | 'other')}>
            <option value="gta6">GTA 6 price</option>
            <option value="other">Normal price (other game)</option>
          </select>
        </label>
        <label className={label}>
          Link stays open for
          <select className={field} value={mins} onChange={(e) => setMins(Number(e.target.value))}>
            {[30, 60, 120, 360, 1440].map((m) => (
              <option key={m} value={m}>
                {m < 60 ? `${m} minutes` : m === 60 ? '1 hour' : m < 1440 ? `${m / 60} hours` : '1 day'}
              </option>
            ))}
          </select>
        </label>
        <label className={label}>
          Player&apos;s number (optional, opens their chat)
          <input className={field} inputMode="tel" placeholder="98765 43210" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </label>
      </div>
      {err && (
        <p role="alert" className="text-body text-error">
          {err}
        </p>
      )}
      <button
        type="button"
        disabled={!cafeId || !tierId || !date || !start || create.isPending}
        onClick={() => create.mutate()}
        className="btn-depth min-h-[48px] self-start rounded-xl bg-primary px-6 text-body font-bold text-white disabled:opacity-50"
      >
        {create.isPending ? 'Making the link…' : 'Make the link'}
      </button>

      {made && <ShareBox offer={made} phone={phone} />}

      {(offers.data?.offers ?? []).length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-caption font-bold uppercase tracking-wide text-text-secondary">Recent links</p>
          {offers.data!.offers.slice(0, 8).map((o) => (
            <div key={o.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border px-3 py-2">
              <div className="min-w-0">
                <p className="truncate text-body font-semibold text-text-primary">
                  {o.cafe?.name} · {o.tier?.name}
                </p>
                <p className="text-caption text-text-secondary">{offerWhen(o)}</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-surface px-2.5 py-1 text-caption font-bold text-text-primary">
                  {o.status === 'claimed' ? 'Paid' : o.status === 'held' ? 'Held, awaiting payment' : o.status === 'lapsed' ? 'Not paid, back to normal' : o.status === 'open' ? 'Open' : o.status === 'cancelled' ? 'Cancelled' : 'Ran out'}
                </span>
                {o.status === 'open' && (
                  <>
                    <a
                      href={offerWhatsAppUrl('', offerMessage(o, linkFor(o)))}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex min-h-[44px] items-center px-2 text-caption font-bold text-primary"
                    >
                      Share again
                    </a>
                    <button type="button" onClick={() => cancel.mutate(o.id)} className="min-h-[44px] px-2 text-caption font-bold text-error">
                      Cancel
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
