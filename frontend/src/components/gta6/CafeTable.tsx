import Link from 'next/link';
import type { Gta6Cafe } from '@/lib/gta6Live';

const hours = (c: Gta6Cafe) => (c.opens && c.closes ? (c.opens === c.closes ? 'Open 24 hours' : `${c.opens} to ${c.closes}`) : 'Ask the café');

/**
 * The same cafés as the cards above, as a plain HTML table: area, console, price, hours and
 * booking status in text, so search engines and AI answers can read the facts without
 * running any script. Rows are the live GTA 6 listings, never typed in by hand.
 */
export function CafeTable({ cafes, where, checkedOn }: { cafes: Gta6Cafe[]; where: string; checkedOn: string }) {
  if (cafes.length === 0) return null;
  return (
    <section aria-labelledby="gta6-table-h" className="flex flex-col gap-2">
      <h2 id="gta6-table-h" className="font-heading text-h2 text-text-primary text-balance">
        {where ? `Cafés where you can play GTA 6 in ${where}` : 'Cafés where you can play GTA 6'}
      </h2>
      <div className="overflow-x-auto rounded-2xl border border-border bg-card" tabIndex={0} role="region" aria-labelledby="gta6-table-h">
        <table className="w-full min-w-[34rem] border-collapse text-left text-body">
          <caption className="sr-only">GTA 6 cafés on KHEL-O: area, console, price per hour, hours and booking status</caption>
          <thead>
            <tr className="border-b border-border text-caption text-text-secondary">
              <th scope="col" className="px-4 py-2.5 font-semibold">Café</th>
              <th scope="col" className="px-4 py-2.5 font-semibold">Area</th>
              <th scope="col" className="px-4 py-2.5 font-semibold">Console</th>
              <th scope="col" className="px-4 py-2.5 font-semibold">From</th>
              <th scope="col" className="px-4 py-2.5 font-semibold">Hours</th>
              <th scope="col" className="px-4 py-2.5 font-semibold">Booking</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {cafes.map((c) => (
              <tr key={c.id}>
                <th scope="row" className="px-4 py-3 font-semibold text-text-primary">
                  <Link href={c.cafeHref} className="underline-offset-2 hover:text-primary hover:underline">{c.name}</Link>
                </th>
                <td className="px-4 py-3 text-text-secondary">{c.area ? `${c.area}, ${c.city}` : c.city}</td>
                <td className="px-4 py-3 text-text-secondary">PS5</td>
                <td className="px-4 py-3 tabular-nums text-text-primary">₹{c.price}/hr</td>
                <td className="px-4 py-3 tabular-nums text-text-secondary">{hours(c)}</td>
                <td className="px-4 py-3 text-text-secondary">
                  <Link href={c.href} className="font-semibold text-primary underline-offset-2 hover:underline">Book online</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-caption text-text-secondary">
        Partner cafés, not KHEL-O branches. These are the cafés taking GTA 6 bookings on KHEL-O as of {checkedOn}; slots are
        confirmed when you book. Prices are per hour for one PS5.
      </p>
    </section>
  );
}
