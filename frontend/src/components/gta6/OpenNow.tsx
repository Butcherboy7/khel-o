'use client';

import { useEffect, useState } from 'react';

/** Minutes past midnight in India, where every café is. */
function istMinutes(): number {
  const parts = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'Asia/Kolkata' }).formatToParts(new Date());
  const h = Number(parts.find((p) => p.type === 'hour')?.value ?? 0);
  const m = Number(parts.find((p) => p.type === 'minute')?.value ?? 0);
  return h * 60 + m;
}

const toMin = (t: string) => {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + (m || 0);
};

/** "Open now" / "Opens 10 AM": worked out in the browser, so a cached page never shows a stale state.
 *  Before it knows, it shows the hours the server sent. */
export function OpenNow({ opens, closes, hours }: { opens: string | null; closes: string | null; hours: string | null }) {
  const [state, setState] = useState<'open' | 'closed' | null>(null);
  useEffect(() => {
    if (!opens || !closes) return;
    const tick = () => {
      const now = istMinutes();
      const o = toMin(opens);
      let c = toMin(closes);
      if (c === 0 || closes === '23:59') c = 24 * 60;
      const open = c > o ? now >= o && now < c : now >= o || now < c;
      setState(open ? 'open' : 'closed');
    };
    tick();
    const id = window.setInterval(tick, 60_000);
    return () => window.clearInterval(id);
  }, [opens, closes]);

  if (state === 'open') {
    return (
      <span className="inline-flex items-center gap-1.5 font-semibold text-success">
        <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-success" />
        {hours === 'Open 24 hours' ? 'Open 24 hours' : 'Open now'}
      </span>
    );
  }
  if (state === 'closed' && hours) return <span>Closed now · {hours}</span>;
  return hours ? <span>{hours}</span> : null;
}
