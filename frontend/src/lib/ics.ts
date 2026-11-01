/** A one-event calendar file (.ics) that phones open in their calendar app. */
export interface CalendarEvent {
  title: string;
  start: Date;
  end: Date;
  location?: string;
  details?: string;
  url?: string;
}

function stamp(d: Date): string {
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

function esc(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/([,;])/g, '\\$1');
}

export function icsText(e: CalendarEvent): string {
  const uid = `${stamp(e.start)}-${Math.random().toString(36).slice(2, 10)}@khel-o.com`;
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//KHELO//Drops//EN',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${stamp(new Date())}`,
    `DTSTART:${stamp(e.start)}`,
    `DTEND:${stamp(e.end)}`,
    `SUMMARY:${esc(e.title)}`,
    e.location ? `LOCATION:${esc(e.location)}` : '',
    e.details || e.url ? `DESCRIPTION:${esc([e.details, e.url].filter(Boolean).join('\n'))}` : '',
    e.url ? `URL:${e.url}` : '',
    'END:VEVENT',
    'END:VCALENDAR',
  ]
    .filter(Boolean)
    .join('\r\n');
}

export function downloadIcs(e: CalendarEvent, fileName = 'khelo-event.ics'): void {
  const blob = new Blob([icsText(e)], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
