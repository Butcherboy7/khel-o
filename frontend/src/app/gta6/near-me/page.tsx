import type { Metadata } from 'next';
import { Gta6SearchPage } from '@/components/gta6/Gta6SearchPage';
import { getGta6Cafes } from '@/lib/gta6Live';
import { getPublicEnv } from '@/lib/runtimeEnv';

const SITE_URL = getPublicEnv('NEXT_PUBLIC_APP_URL', 'https://khel-o.online');
const URL_ = `${SITE_URL}/gta6/near-me`;

// Live cafés and prices on every request.
export const dynamic = 'force-dynamic';

async function copy() {
  const cafes = await getGta6Cafes();
  const min = cafes.length ? Math.min(...cafes.map((c) => c.price)) : null;
  const cities = Array.from(new Set(cafes.map((c) => c.city)));
  const title = min != null ? `GTA 6 Near Me: Play at a PS5 Café from ₹${min}/hr` : 'GTA 6 Near Me: Play at a PS5 Café';
  const description = `GTA 6 is out. Play it at a PS5 gaming café near you${min != null ? ` from ₹${min}/hr` : ''}.${
    cities.length ? ` ${cafes.length} ${cafes.length === 1 ? 'café' : 'cafés'} live in ${cities.join(', ')}.` : ''
  } Book in a minute, walk in with a QR pass. City not listed? We'll bring one.`;
  return { cafes, min, cities, title, description };
}

export async function generateMetadata(): Promise<Metadata> {
  const { title, description } = await copy();
  return {
    title: { absolute: `${title} | KHEL-O` },
    description,
    alternates: { canonical: '/gta6/near-me', languages: { 'en-IN': URL_ } },
    openGraph: { title, description, url: URL_, type: 'website', locale: 'en_IN', images: [{ url: '/og/khelo-share.png', width: 1200, height: 630 }] },
    twitter: { card: 'summary_large_image', title, description, images: ['/og/khelo-share.png'] },
  };
}

export default async function Gta6NearMePage() {
  const { cafes, min, cities } = await copy();
  return (
    <Gta6SearchPage
      path="/gta6/near-me"
      cafes={cafes}
      h1="Play GTA 6 near you"
      line={min != null ? `PS5 cafés from ₹${min}/hr. Book in a minute, walk in with a QR pass.` : undefined}
      crumb="Near me"
      answerTitle="How to find a GTA 6 café near you"
      answer={[
        `GTA 6 is out on PS5 and Xbox, not PC. Without a console, the way to play is a PS5 gaming café. The cafés above take GTA 6 bookings on KHEL-O${cities.length ? `, in ${cities.join(', ')}` : ''}: pick one, choose a time, pay online and show your QR pass at the desk.`,
        'Not near any of them? Tap "Your city not listed?" and message us on WhatsApp. We find a PS5 café in your area and bring it on KHEL-O.',
      ]}
      faq={[
        {
          question: 'How do I find a café to play GTA 6 near me?',
          answer: 'The cafés at the top of this page have GTA 6 on PS5 and take bookings on KHEL-O. Pick one, choose a time, and pay online. You show a QR pass at the desk.',
        },
        {
          question: 'My city has no GTA 6 café. What can I do?',
          answer: 'Tap "Your city not listed?" and message us on WhatsApp with your area. We find a PS5 café near you and bring it on KHEL-O.',
        },
        ...(min != null
          ? [{ question: 'How much does it cost to play GTA 6 at a café?', answer: `PS5 cafés on KHEL-O charge from ₹${min} an hour. Each café shows its price before you pay.` }]
          : []),
        {
          question: 'Can I play GTA 6 for free at a café?',
          answer: 'You can earn free play time: join the KHEL-O WhatsApp community and play in our next tournament. Players who take part get free GTA 6 time as a reward.',
        },
      ]}
      source="gta6-near-me"
    />
  );
}
