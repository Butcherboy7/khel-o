import type { TournamentCard, TournamentPhase } from '@/lib/api/tournaments';

const IST = 'Asia/Kolkata';

export function fmtDay(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', timeZone: IST });
}

export function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: IST }).toUpperCase();
}

export function fmtWhen(iso: string): string {
  return `${fmtDay(iso)}, ${fmtTime(iso)}`;
}

/** Day of month and short month, for the date block on a card. */
export function dateBlock(iso: string): { day: string; month: string; weekday: string } {
  const d = new Date(iso);
  return {
    day: d.toLocaleDateString('en-IN', { day: 'numeric', timeZone: IST }),
    month: d.toLocaleDateString('en-IN', { month: 'short', timeZone: IST }).toUpperCase(),
    weekday: d.toLocaleDateString('en-IN', { weekday: 'short', timeZone: IST }).toUpperCase(),
  };
}

export function rupees(n: number): string {
  return `₹${Math.round(n).toLocaleString('en-IN')}`;
}

export function feeLabel(t: Pick<TournamentCard, 'entryFee' | 'teamSize'>): string {
  if (!t.entryFee) return 'Free entry';
  return `${rupees(t.entryFee)} ${t.teamSize > 1 ? 'per team' : 'entry'}`;
}

export function formatLabel(t: Pick<TournamentCard, 'teamSize'>): string {
  return t.teamSize === 1 ? '1v1' : `${t.teamSize}v${t.teamSize}`;
}

export const PHASE: Record<TournamentPhase, { label: string; tone: string }> = {
  open: { label: 'Registration open', tone: 'bg-success/10 text-success' },
  filling: { label: 'Filling fast', tone: 'bg-warning/15 text-warning' },
  full: { label: 'Full · join waitlist', tone: 'bg-error/10 text-error' },
  closed: { label: 'Registration closed', tone: 'bg-surface text-text-secondary' },
  published: { label: 'Registration open', tone: 'bg-success/10 text-success' },
  live: { label: 'Live now', tone: 'bg-error text-white' },
  completed: { label: 'Results in', tone: 'bg-surface text-text-secondary' },
  cancelled: { label: 'Cancelled', tone: 'bg-surface text-text-secondary' },
  draft: { label: 'Draft', tone: 'bg-surface text-text-secondary' },
};

export function placeLabel(place: number | null | undefined): string {
  if (!place) return '';
  if (place === 1) return 'Champion';
  if (place === 2) return 'Runner-up';
  if (place === 3) return '3rd place';
  if (place === 4) return '4th place';
  return `Top ${(place - 1) * 2}`;
}

export function untilLabel(iso: string, now = Date.now()): string {
  const ms = new Date(iso).getTime() - now;
  if (ms <= 0) return 'now';
  const mins = Math.round(ms / 60000);
  if (mins < 60) return `in ${mins} min`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `in ${hours} h`;
  const days = Math.round(hours / 24);
  return days === 1 ? 'tomorrow' : `in ${days} days`;
}

export function minutesLabel(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (!h) return `${m} min`;
  return m ? `${h} h ${m} min` : `${h} h`;
}

/** Add-to-calendar file for the event (Google/Apple/Outlook all read .ics). */
export function icsFor(t: TournamentCard, code?: string | null): string {
  const stamp = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const esc = (s: string) => s.replace(/[\\;,]/g, (c) => `\\${c}`).replace(/\n/g, '\\n');
  const where = t.cafe ? `${t.cafe.name}, ${t.cafe.address}` : '';
  const desc = [
    `${t.game.name} · ${formatLabel(t)}`,
    `Check-in opens ${fmtTime(t.checkInOpensAt)}.`,
    code ? `Your check-in code: ${code}` : '',
    `https://khel-o.com/tournaments/${t.slug}`,
  ].filter(Boolean).join('\n');
  return [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//KHEL-O//Tournaments//EN', 'BEGIN:VEVENT',
    `UID:${t.id}@khel-o.com`, `DTSTAMP:${stamp(new Date().toISOString())}`,
    `DTSTART:${stamp(t.checkInOpensAt)}`, `DTEND:${stamp(t.endsAt)}`,
    `SUMMARY:${esc(t.title)}`, `LOCATION:${esc(where)}`, `DESCRIPTION:${esc(desc)}`,
    'END:VEVENT', 'END:VCALENDAR',
  ].join('\r\n');
}

export function downloadIcs(t: TournamentCard, code?: string | null) {
  const blob = new Blob([icsFor(t, code)], { type: 'text/calendar' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${t.slug}.ics`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Datetime-local input value (IST wall time) from an ISO string, and back. */
export function toLocalInput(iso: string): string {
  const d = new Date(new Date(iso).getTime() + 330 * 60000);
  return d.toISOString().slice(0, 16);
}

export function fromLocalInput(v: string): string {
  return `${v}:00+05:30`;
}
