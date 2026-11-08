import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { listDrops } from '@/lib/api/drops';
import { Gta6Client } from './Gta6Client';

export const metadata: Metadata = {
  title: 'GTA 6 launch list',
  description:
    'GTA 6 drops 19 Nov on PS5 and Xbox. No console at home? PS5 cafés on KHEL-O in Hyderabad have pre-ordered it. Reserve a launch-week seat now.',
  alternates: { canonical: '/gta6' },
  openGraph: {
    title: 'GTA 6 drops 19 Nov. No PS5? Play it at a café.',
    description: 'Hyderabad PS5 cafés have pre-ordered it. Reserve your KHEL-O launch-week seat.',
    url: '/gta6',
  },
};

// Once a GTA drop is taking seats, this link is the booking page: no waitlist step in between.
// Campaign tags on the link are kept so ad tracking still works.
export default async function Gta6Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  let slug: string | null = null;
  try {
    const live = (await listDrops()).find((d) => /gta/i.test(d.game) && (d.state === 'open' || d.state === 'early'));
    slug = live?.slug ?? null;
  } catch {
    slug = null;
  }
  if (slug) {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(await searchParams)) {
      if (typeof v === 'string') qs.set(k, v);
    }
    redirect(`/drops/${slug}${qs.size ? `?${qs.toString()}` : ''}`);
  }
  return <Gta6Client />;
}
