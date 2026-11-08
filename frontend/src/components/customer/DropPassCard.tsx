'use client';

import Link from 'next/link';
import { Ticket, QrCode } from 'lucide-react';
import type { MyDropPass } from '@/lib/api/drops';

const LABEL: Record<MyDropPass['status'], string> = {
  confirmed: 'Upcoming',
  checked_in: 'Checked in',
  refunded: 'Refunded',
  given_away: 'Seat given away',
};

function clock(hhmm: string | null): string {
  if (!hhmm) return '';
  const [h, m] = hhmm.split(':').map(Number);
  return `${h % 12 || 12}${m ? `:${String(m).padStart(2, '0')}` : ''} ${h >= 12 ? 'PM' : 'AM'}`;
}

/** A launch-drop reservation in My Bookings. Tapping opens the QR pass. */
export function DropPassCard({ pass }: { pass: MyDropPass }) {
  const day = pass.date
    ? new Date(`${pass.date}T12:00:00+05:30`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' })
    : '';
  const live = pass.status === 'confirmed' || pass.status === 'checked_in';
  return (
    <Link
      href={pass.passPath}
      className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4 transition-colors hover:border-primary/40"
    >
      <span className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
        <Ticket className="h-6 w-6" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-heading text-body-emphasis font-bold text-text-primary">{pass.dropTitle}</span>
        <span className="block truncate text-body text-text-secondary">
          {pass.cafeName} · {day}
          {pass.startTime && pass.endTime ? ` · ${clock(pass.startTime)} – ${clock(pass.endTime)}` : ''}
        </span>
        <span className="mt-0.5 block text-caption text-text-secondary">
          {pass.seats} {pass.seats === 1 ? 'seat' : 'seats'} · {pass.reference} ·{' '}
          <span className={live ? 'font-semibold text-success' : 'font-semibold'}>{LABEL[pass.status]}</span>
        </span>
      </span>
      {live && (
        <span className="flex flex-shrink-0 flex-col items-center gap-0.5 text-caption font-semibold text-primary">
          <QrCode className="h-6 w-6" aria-hidden /> Show QR
        </span>
      )}
    </Link>
  );
}
