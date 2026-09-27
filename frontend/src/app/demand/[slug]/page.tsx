import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getCafeDemand } from '@/lib/api/demand';

// The link outreach sends a café owner: how many players asked KHEL-O to
// list their café, how fast, and when they'd play. Counts only — no names
// or contacts — and kept out of search results.
export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ slug: string }>;
}

async function load(slug: string) {
  try {
    return await getCafeDemand(slug);
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const demand = await load(slug);
  return {
    title: demand ? `Players asking for ${demand.cafeName}` : 'Café demand',
    robots: { index: false, follow: false },
  };
}

const WEEK_LABELS = (n: number) =>
  Array.from({ length: n }, (_, i) => (i === n - 1 ? 'This week' : i === n - 2 ? 'Last week' : `${n - 1 - i}w ago`));

export default async function CafeDemandPage({ params }: PageProps) {
  const { slug } = await params;
  const demand = await load(slug);
  if (!demand) notFound();

  const { cafeName, city, count, goal, last7Days, firstRequestedAt, weekly, playTimes, isLive } = demand;
  const people = count === 1 ? 'player has' : 'players have';
  const percent = Math.min(100, Math.round((count / Math.max(1, goal)) * 100));
  const weekMax = Math.max(1, ...weekly);
  const labels = WEEK_LABELS(weekly.length);
  const answered = playTimes.reduce((sum, p) => sum + p.count, 0);
  const since = firstRequestedAt
    ? new Date(firstRequestedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
    : null;

  return (
    <div className="min-h-screen bg-surface">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex h-14 max-w-content items-center px-4">
          <Link href="/" className="font-heading text-h3 font-bold lowercase tracking-tight text-text-primary">
            khel-o
          </Link>
        </div>
      </header>

      <main className="mx-auto flex max-w-content flex-col gap-6 px-4 py-8">
        <section className="flex flex-col gap-2">
          <span className="text-overline text-text-secondary">Player demand · {city}</span>
          <h1 className="font-heading text-h1 text-text-primary text-balance">
            <span className="text-primary tabular-nums">{count}</span> {people} asked to book {cafeName} on KHEL-O
          </h1>
          <p className="text-body text-text-secondary">
            Each one tapped &ldquo;Notify me&rdquo; on {cafeName}&apos;s KHEL-O page, asking to be told the day they can
            book a station online.
          </p>
        </section>

        <section className="grid grid-cols-2 gap-3">
          <div className="rounded-2xl border border-border bg-card p-4">
            <div className="font-heading text-h2 font-bold tabular-nums text-text-primary">{last7Days}</div>
            <div className="text-caption text-text-secondary">joined in the last 7 days</div>
          </div>
          <div className="rounded-2xl border border-border bg-card p-4">
            <div className="font-heading text-h2 font-bold tabular-nums text-text-primary">{since ?? '—'}</div>
            <div className="text-caption text-text-secondary">first request</div>
          </div>
          {!isLive && (
            <div className="col-span-2 flex flex-col gap-2 rounded-2xl border border-border bg-card p-4">
              <div className="flex items-baseline justify-between text-caption">
                <span className="font-semibold text-text-primary">
                  {count} of {goal} requests to open bookings
                </span>
                <span className="text-text-secondary tabular-nums">{percent}%</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-surface">
                <div className="h-full rounded-full bg-primary" style={{ width: `${percent}%` }} />
              </div>
            </div>
          )}
        </section>

        <section className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4">
          <h2 className="font-heading text-h3 text-text-primary">Requests by week</h2>
          <div className="flex h-32 items-end gap-2" role="img" aria-label={`Requests per week: ${weekly.join(', ')}`}>
            {weekly.map((n, i) => (
              <div key={labels[i]} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
                <span className="text-[11px] font-semibold tabular-nums text-text-primary">{n}</span>
                <div
                  className={`w-full rounded-t-md ${i === weekly.length - 1 ? 'bg-primary' : 'bg-primary/35'}`}
                  style={{ height: `${Math.max(4, (n / weekMax) * 100)}%` }}
                />
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            {labels.map((l) => (
              <span key={l} className="flex-1 text-center text-[10px] text-text-secondary">
                {l}
              </span>
            ))}
          </div>
        </section>

        {answered > 0 && (
          <section className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4">
            <div>
              <h2 className="font-heading text-h3 text-text-primary">When they&apos;d play</h2>
              <p className="text-caption text-text-secondary">
                {answered} of {count} answered
              </p>
            </div>
            <ul className="flex flex-col gap-2.5">
              {playTimes.map((p) => (
                <li key={p.key} className="flex flex-col gap-1">
                  <div className="flex justify-between text-caption">
                    <span className="text-text-primary">{p.label}</span>
                    <span className="font-semibold tabular-nums text-text-primary">{p.count}</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-surface">
                    <div className="h-full rounded-full bg-secondary" style={{ width: `${(p.count / answered) * 100}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="flex flex-col gap-3 rounded-2xl bg-secondary p-5 text-white">
          {isLive ? (
            <p className="font-heading text-body-emphasis">{cafeName} is live on KHEL-O and taking bookings.</p>
          ) : (
            <>
              <p className="font-heading text-h3">These players are waiting for {cafeName}.</p>
              <p className="text-caption text-white/80">
                Listing is free. The moment you open bookings, every one of them gets an email saying they can book.
              </p>
              <Link
                href="/partner"
                className="inline-flex min-h-btn items-center justify-center rounded-2xl bg-primary px-5 font-heading text-btn font-semibold text-white hover:bg-primary-dark"
              >
                List {cafeName} on KHEL-O
              </Link>
            </>
          )}
        </section>

        <p className="text-center text-caption text-text-secondary">
          Live numbers from KHEL-O. No names or contact details are shared on this page.
        </p>
      </main>
    </div>
  );
}
