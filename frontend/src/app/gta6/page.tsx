import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { listDrops } from '@/lib/api/drops';
import { dropDestination } from '@/lib/drops';
import { Gta6Client } from './Gta6Client';

export const metadata: Metadata = {
  title: 'Play GTA 6 in Hyderabad, Bengaluru & India: PS5 Cafés',
  description:
    'GTA 6 releases 19 Nov 2026 on PS5 and Xbox. No console at home? Play it at a PS5 gaming café: compare cafés and prices in Hyderabad, Bengaluru and across India, and book on KHEL-O.',
  alternates: { canonical: '/gta6', languages: { 'en-IN': '/gta6' } },
  openGraph: {
    title: 'GTA 6 drops 19 Nov. No PS5? Play it at a café.',
    description: 'Hyderabad PS5 cafés have pre-ordered it. Reserve your KHEL-O launch-week seat.',
    url: '/gta6',
  },
};

// Once a GTA drop is taking seats, this link is the booking page: no waitlist step in between.
// Campaign tags on the link are kept so ad tracking still works.
export default async function Gta6Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  let to: string | null = null;
  try {
    const live = (await listDrops()).filter((d) => /gta\s*6/i.test(d.game) && (d.state === 'open' || d.state === 'early'));
    // One café: straight to its drop. Several: the pick-your-café screen, nearest first.
    to = live.length ? dropDestination(live, live[0].game).href : null;
  } catch {
    to = null;
  }
  if (to) {
    const [path, own] = to.split('?');
    const qs = new URLSearchParams(own ?? '');
    for (const [k, v] of Object.entries(await searchParams)) {
      if (typeof v === 'string' && !qs.has(k)) qs.set(k, v);
    }
    redirect(`${path}${qs.size ? `?${qs.toString()}` : ''}`);
  }
  return (
    <>
      <Gta6Client />
      <nav aria-label="GTA 6 by city" className="mx-auto flex max-w-3xl flex-wrap justify-center gap-x-5 gap-y-2 px-4 py-6 text-body">
        <Link href="/gta6/hyderabad" className="underline underline-offset-2">Where to play GTA 6 in Hyderabad</Link>
        <Link href="/gta6/bengaluru" className="underline underline-offset-2">GTA 6 in Bengaluru</Link>
        <Link href="/gta6/india" className="underline underline-offset-2">GTA 6 in India</Link>
      </nav>
    </>
  );
}
