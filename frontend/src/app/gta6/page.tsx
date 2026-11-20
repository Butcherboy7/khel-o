import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { listDrops } from '@/lib/api/drops';
import { dropDestination, gameKey } from '@/lib/drops';
import { Gta6Client } from './Gta6Client';
import { GTA6_PLACES, GTA6_TOP_CITY_SLUGS } from '@/constants/gta6';
import { Gta6SearchPage } from '@/components/gta6/Gta6SearchPage';
import { getGta6Cafes } from '@/lib/gta6Live';

export const metadata: Metadata = {
  title: { absolute: 'Pre-Book GTA 6 at a PS5 Café Near You | KHEL-O' },
  description:
    'GTA 6 is out on PS5 and Xbox. No console? Pre-book a PS5 gaming café slot: see live cafés, prices and hours, reserve in a minute on KHEL-O and walk in with a QR pass.',
  alternates: { canonical: '/gta6', languages: { 'en-IN': '/gta6' } },
  openGraph: {
    title: 'GTA 6 is out. No PS5? Play it at a café.',
    description: 'PS5 cafés with GTA 6, live on KHEL-O. Book in a minute, walk in with a QR pass.',
    url: '/gta6',
  },
};

// GTA 6 is out: while cafés take bookings, this page is the KHEL-O home screen
// with the GTA 6 cafés on top (Book goes straight to the café). Campaign tags
// stay in the address bar, so ad tracking still works. Before any café is
// live, the launch-list page below shows instead.
export const dynamic = 'force-dynamic';

export default async function Gta6Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const cafes = await getGta6Cafes();
  if (cafes.length > 0) {
    const min = Math.min(...cafes.map((c) => c.price));
    const cities = Array.from(new Set(cafes.map((c) => c.city)));
    return (
      <Gta6SearchPage
        path="/gta6"
        cafes={cafes}
        h1="GTA 6 is out. Play it at a café near you."
        line={`PS5 cafés from ₹${min}/hr. Book in a minute, walk in with a QR pass.`}
        crumb="GTA 6"
        answerTitle="Where to play GTA 6 without a console"
        answer={[
          `GTA 6 came out on 19 November 2026 on PS5 and Xbox, not PC. KHEL-O lists PS5 gaming cafés with GTA 6 in ${cities.join(', ')}: pick one, choose a time, pay online and show your QR pass at the desk.`,
          'Your city not on the list? Tap "Your city not listed?" and message us. We bring a café near you on KHEL-O.',
        ]}
        faq={[
          { question: 'Where can I play GTA 6 without a PS5?', answer: `At a PS5 gaming café. KHEL-O cafés with GTA 6 start from ₹${min} an hour.` },
          { question: 'When did GTA 6 come out?', answer: 'GTA 6 released on 19 November 2026 on PS5 and Xbox Series X|S.' },
          { question: 'Can I play GTA 6 free?', answer: 'You can earn free play time: join the KHEL-O WhatsApp community and play in our next tournament. Players who take part get free GTA 6 time.' },
        ]}
        source="gta6"
      />
    );
  }

  // No café live: the old behaviour (an open drop, else the launch list).
  let to: string | null = null;
  try {
    const live = (await listDrops()).filter((d) => /gta\s*6/i.test(d.game) && (d.state === 'open' || d.state === 'early'));
    to = live.length ? (live[0].casual ? `/drops?game=${gameKey(live[0].game)}` : dropDestination(live, live[0].game).href) : null;
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
        <Link href="/gta6/near-me" className="underline underline-offset-2">GTA 6 near me</Link>
        {GTA6_TOP_CITY_SLUGS.map((slug) => (
          <Link key={slug} href={`/gta6/${slug}`} className="underline underline-offset-2">GTA 6 in {GTA6_PLACES[slug].name}</Link>
        ))}
        <Link href="/gta6/cities" className="underline underline-offset-2">All cities</Link>
      </nav>
    </>
  );
}
