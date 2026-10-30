'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Download, FileText } from 'lucide-react';
import { downloadStatement, getWeeklyStatements, type CafeStatement } from '@/lib/api/admin';
import { queryKeys } from '@/hooks/queries/keys';
import { Button, Card, CardContent, ErrorState, SkeletonCard } from '@/components/ui';

const rupees = (n: number) => `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const dash = (n: number) => (n ? rupees(n) : '–');

/** Monday of the last finished Monday–Sunday week, as YYYY-MM-DD (India time). */
function lastFullWeek(): string {
  const ist = new Date(Date.now() + 5.5 * 3600_000);
  const day = (ist.getUTCDay() + 6) % 7; // Monday = 0
  ist.setUTCDate(ist.getUTCDate() - day - 7);
  return ist.toISOString().slice(0, 10);
}

function shift(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const label = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' });

/** Read-only. What each live café earned in a Monday–Sunday week, bookings in a table, and the
 *  branded PDF statement for each (or all in one zip). Nothing here records or changes a payout. */
export function WeeklyStatementsSection() {
  const [week, setWeek] = useState(lastFullWeek);
  const [busy, setBusy] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const thisWeek = lastFullWeek();

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: [...queryKeys.admin.all, 'cafe-payouts', 'statements', week],
    queryFn: () => getWeeklyStatements(week),
    staleTime: 30_000,
  });

  const save = async (key: string, cafeId?: string) => {
    setBusy(key);
    setFailed(null);
    try {
      await downloadStatement(week, cafeId);
    } catch {
      setFailed('Could not download. Try again.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="flex flex-col gap-3" aria-labelledby="statements-title" data-weekly-statements>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            <h2 id="statements-title" className="font-heading text-h2 text-text-primary">Weekly café statements</h2>
          </div>
          <p className="mt-1 text-caption text-text-secondary">
            What every live café earned, Monday to Sunday, with each booking. Download the PDF to send. Read-only: nothing here records a payment.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-label="Previous week"
            onClick={() => setWeek(shift(week, -7))}
            className="flex h-10 w-10 items-center justify-center rounded-lg border border-border text-text-primary"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="min-w-[8.5rem] text-center text-caption font-semibold text-text-primary">
            {label(week)} – {label(shift(week, 6))}
          </span>
          <button
            type="button"
            aria-label="Next week"
            disabled={week >= thisWeek}
            onClick={() => setWeek(shift(week, 7))}
            className="flex h-10 w-10 items-center justify-center rounded-lg border border-border text-text-primary disabled:opacity-40"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      {isLoading && <SkeletonCard />}
      {isError && <ErrorState title="Couldn’t load the statements" message={(error as Error)?.message ?? 'Try again.'} onRetry={() => refetch()} />}

      {data && (
        <>
          <Card elevation="raised">
            <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div>
                <p className="text-caption text-text-secondary">Due to all cafés this week</p>
                <p className="font-data text-h2 font-bold text-text-primary" data-statements-total>{rupees(data.totalDue)}</p>
                <p className="text-caption text-text-secondary">{data.bookings} paid {data.bookings === 1 ? 'booking' : 'bookings'} · {data.cafes.length} live {data.cafes.length === 1 ? 'café' : 'cafés'}</p>
              </div>
              <Button variant="primary" size="sm" isLoading={busy === 'all'} onClick={() => save('all')}>
                <Download className="h-4 w-4" /> Download all PDFs (zip)
              </Button>
            </CardContent>
          </Card>
          {failed && <p className="text-caption text-error">{failed}</p>}

          {data.cafes.map((c) => (
            <CafeBlock key={c.cafeId} c={c} busy={busy === c.cafeId} onDownload={() => save(c.cafeId, c.cafeId)} />
          ))}
        </>
      )}
    </section>
  );
}

function CafeBlock({ c, busy, onDownload }: { c: CafeStatement; busy: boolean; onDownload: () => void }) {
  const t = c.totals;
  const showChallenge = t.challengeDiscounts > 0;
  return (
    <details className="rounded-2xl border border-border bg-surface" data-statement-cafe={c.cafe}>
      <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-3 px-5 py-3 text-caption font-semibold text-text-primary">
        <span>{c.cafe} <span className="font-normal text-text-secondary">· {t.bookings} {t.bookings === 1 ? 'booking' : 'bookings'}</span></span>
        <span className="font-data">{rupees(t.totalDue)}</span>
      </summary>
      <div className="flex flex-col gap-3 px-5 pb-4">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-caption">
            <thead className="text-text-secondary">
              <tr>
                <th className="py-1 pr-3 font-semibold">Date</th>
                <th className="py-1 pr-3 font-semibold">Booking</th>
                <th className="py-1 pr-3 font-semibold">Player</th>
                <th className="py-1 pr-3 text-right font-semibold">Value</th>
                <th className="py-1 pr-3 text-right font-semibold">Offers</th>
                {showChallenge && <th className="py-1 pr-3 text-right font-semibold">Challenge 20%</th>}
                <th className="py-1 pr-3 text-right font-semibold">Café earns</th>
                <th className="py-1 text-right font-semibold">KHEL-O adds back</th>
              </tr>
            </thead>
            <tbody className="text-text-primary">
              {c.lines.length === 0 && (
                <tr><td colSpan={showChallenge ? 8 : 7} className="py-2 text-text-secondary">No paid bookings this week.</td></tr>
              )}
              {c.lines.map((l) => (
                <tr key={l.reference} className="border-t border-border align-top">
                  <td className="whitespace-nowrap py-1.5 pr-3">{label(l.date)} · {l.time}</td>
                  <td className="py-1.5 pr-3 font-mono">{l.reference}</td>
                  <td className="py-1.5 pr-3">{l.player}</td>
                  <td className="py-1.5 pr-3 text-right font-data">{rupees(l.value)}</td>
                  <td className="py-1.5 pr-3 text-right font-data">{dash(l.offerDiscount)}</td>
                  {showChallenge && <td className="py-1.5 pr-3 text-right font-data">{dash(l.challengeDiscount)}</td>}
                  <td className="py-1.5 pr-3 text-right font-data font-semibold">{rupees(l.earnings)}</td>
                  <td className="py-1.5 text-right font-data">{dash(l.addedBack)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="text-text-primary">
              <tr className="border-t-2 border-border font-semibold">
                <td className="py-1.5 pr-3" colSpan={3}>Total</td>
                <td className="py-1.5 pr-3 text-right font-data">{rupees(t.value)}</td>
                <td className="py-1.5 pr-3 text-right font-data">{dash(t.offerDiscounts)}</td>
                {showChallenge && <td className="py-1.5 pr-3 text-right font-data">{dash(t.challengeDiscounts)}</td>}
                <td className="py-1.5 pr-3 text-right font-data">{rupees(t.earnings)}</td>
                <td className="py-1.5 text-right font-data">{dash(t.addedBack)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-caption text-text-secondary">Statement {c.number}</p>
          <Button variant="outline" size="sm" isLoading={busy} onClick={onDownload}>
            <Download className="h-4 w-4" /> Download PDF
          </Button>
        </div>
      </div>
    </details>
  );
}
