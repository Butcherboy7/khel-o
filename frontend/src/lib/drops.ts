import type { DropBlock } from '@/lib/api/drops';

/** Display helpers for drops. Block dates and times are café time (IST). */

export function blockStart(b: Pick<DropBlock, 'date' | 'startTime'>): Date {
  return new Date(`${b.date}T${b.startTime}:00+05:30`);
}

export function blockEnd(b: Pick<DropBlock, 'date' | 'endTime'>): Date {
  return new Date(`${b.date}T${b.endTime}:00+05:30`);
}

export function dayLabel(date: string): string {
  return new Date(`${date}T12:00:00+05:30`).toLocaleDateString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'Asia/Kolkata',
  });
}

/** "18:00" → "6 PM", "18:30" → "6:30 PM". */
export function clock(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  const suffix = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return m ? `${h12}:${String(m).padStart(2, '0')} ${suffix}` : `${h12} ${suffix}`;
}

export function blockTimes(b: Pick<DropBlock, 'startTime' | 'endTime' | 'hours'>): string {
  const hrs = Number.isInteger(b.hours) ? b.hours : b.hours.toFixed(1);
  return `${clock(b.startTime)} to ${clock(b.endTime)} · ${hrs} ${b.hours === 1 ? 'hour' : 'hours'}`;
}

export function rupees(n: number): string {
  return `₹${Math.round(n).toLocaleString('en-IN')}`;
}

export function whenText(iso: string): string {
  return new Date(iso).toLocaleString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'Asia/Kolkata',
  });
}
