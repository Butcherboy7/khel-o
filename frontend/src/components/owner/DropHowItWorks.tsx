'use client';

import { useEffect, useState } from 'react';
import { ChevronDown } from 'lucide-react';

const KEY = 'khelo_drop_howto_open_v1';

const STEPS: { title: string; body: string }[] = [
  { title: '1. Make the drop', body: 'Pick the game, your price an hour, and the days and hours you will run it. Set how many seats you can play at once.' },
  { title: '2. Set the fees', body: 'Up to 3 hours the customer pays the small fee (₹100). For 4 or 5 hours they pay the bigger fee (₹200). It comes off their bill. They never get it back, unless you cancel.' },
  { title: '3. Share the link', body: 'Send the drop link to your community and Instagram. People pick how long they want to play and what time to start.' },
  { title: '4. They arrive', body: 'Each person has a QR pass. They can come from 15 minutes before to 15 minutes after their start time. Scan it to check them in and collect the rest of the bill.' },
  { title: '5. If they are late', body: 'More than 15 minutes after the start, tap "Give seat away". The seat opens for someone waiting. The customer does not get their fee back.' },
  { title: '6. If you must cancel', body: 'Cancel the drop and every person is refunded in full, automatically.' },
];

/** The six steps for running a drop, collapsed once the owner has read it. */
export function DropHowItWorks() {
  const [open, setOpen] = useState(true);
  useEffect(() => {
    try {
      if (localStorage.getItem(KEY) === '0') setOpen(false);
    } catch {
      /* ignore */
    }
  }, []);
  const toggle = () => {
    setOpen((o) => {
      try {
        localStorage.setItem(KEY, o ? '0' : '1');
      } catch {
        /* ignore */
      }
      return !o;
    });
  };
  return (
    <section className="rounded-2xl border border-border bg-card p-4 shadow-card">
      <button type="button" onClick={toggle} aria-expanded={open} className="flex w-full min-h-[44px] items-center justify-between gap-2 text-left">
        <span className="font-heading text-body-emphasis font-bold text-text-primary">How a drop works, in 6 steps</span>
        <ChevronDown className={`h-5 w-5 text-text-secondary transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden />
      </button>
      {open && (
        <ol className="mt-2 flex flex-col gap-3">
          {STEPS.map((s) => (
            <li key={s.title}>
              <p className="text-body font-semibold text-text-primary">{s.title}</p>
              <p className="text-caption text-text-secondary">{s.body}</p>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
