import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { GTA6_PLACES, GTA6_RELEASE } from '@/constants/gta6';
import { GTA6_INTENT_BY_SLUG, withPrice } from '@/constants/gta6Intents';
import { Gta6SearchPage } from '@/components/gta6/Gta6SearchPage';
import { getGta6Cafes, type Gta6Cafe } from '@/lib/gta6Live';
import { getPublicEnv } from '@/lib/runtimeEnv';

const SITE_URL = getPublicEnv('NEXT_PUBLIC_APP_URL', 'https://khel-o.online');

// Live cafés and prices on every request.
export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ slug: string }>;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const minPrice = (cafes: Gta6Cafe[]) => (cafes.length ? Math.min(...cafes.map((c) => c.price)) : null);

/** A city page: its own cafés when it has some, else the live ones elsewhere and a strong "bring one here". */
async function placeView(slug: string) {
  const place = GTA6_PLACES[slug];
  const all = await getGta6Cafes();
  const inPlace = slug === 'india' ? all : all.filter((c) => place.cities.some((n) => n.toLowerCase() === c.city.toLowerCase()));
  const where = slug === 'india' ? 'India' : place.name;
  const elsewhere = Array.from(new Set(all.map((c) => c.city)));
  return { place, all, inPlace, where, elsewhere, min: minPrice(inPlace.length ? inPlace : all) };
}

function placeFaq(where: string, inPlace: Gta6Cafe[], min: number | null, elsewhere: string[]) {
  const names = inPlace.slice(0, 6).map((c) => c.name).join(', ');
  return [
    {
      question: `Where can I play GTA 6 in ${where}?`,
      answer: inPlace.length
        ? `At a PS5 gaming café. KHEL-O has ${plural(inPlace.length, 'café', 'cafés')} with GTA 6 in ${where}: ${names}. Book a time on KHEL-O and show your QR pass at the desk.`
        : `KHEL-O has no GTA 6 café in ${where} yet. Tap "No GTA 6 café in ${where} yet?" and message us on WhatsApp: we find a café near you and bring it on.${elsewhere.length ? ` Cafés are live in ${elsewhere.join(', ')}.` : ''}`,
    },
    ...(min != null
      ? [{ question: `How much does it cost to play GTA 6 at a café${inPlace.length ? ` in ${where}` : ''}?`, answer: `PS5 cafés on KHEL-O charge from ₹${min} an hour for GTA 6. Each café shows its price before you pay.` }]
      : []),
    { question: 'Can I play GTA 6 on PC?', answer: `Not at launch. GTA 6 came out on ${GTA6_RELEASE.label} on PS5 and Xbox Series X|S only, so a PS5 café is the way to play without a console.` },
    {
      question: 'Can I play GTA 6 free?',
      answer: 'You can earn free play time: join the KHEL-O WhatsApp community and play in our next tournament. Players who take part get free GTA 6 time at a café.',
    },
  ];
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const intent = GTA6_INTENT_BY_SLUG[slug];
  let title: string;
  let description: string;
  if (intent) {
    const min = minPrice(await getGta6Cafes());
    title = withPrice(intent.title, min);
    description = withPrice(intent.description, min);
  } else if (GTA6_PLACES[slug]) {
    const { inPlace, where, min, elsewhere } = await placeView(slug);
    title = inPlace.length
      ? `Play GTA 6 in ${where}: ${plural(inPlace.length, 'PS5 Café', 'PS5 Cafés')}${min != null ? ` from ₹${min}/hr` : ''}`
      : `GTA 6 in ${where}: Find a PS5 Café or Ask Us to Bring One`;
    description = inPlace.length
      ? `GTA 6 is out. Play it at a PS5 gaming café in ${where}${min != null ? ` from ₹${min}/hr` : ''}. See hours and photos, book in a minute on KHEL-O, walk in with a QR pass.`
      : `GTA 6 is out on PS5 and Xbox. No KHEL-O café in ${where} yet: message us and we'll bring one near you.${elsewhere.length ? ` Live now in ${elsewhere.join(', ')}${min != null ? ` from ₹${min}/hr` : ''}.` : ''}`;
  } else {
    return { title: 'Not found' };
  }
  const url = `${SITE_URL}/gta6/${slug}`;
  return {
    title: { absolute: `${title} | KHEL-O` },
    description,
    alternates: { canonical: `/gta6/${slug}`, languages: { 'en-IN': url } },
    robots: { index: true, follow: true },
    openGraph: { title, description, url, type: 'website', locale: 'en_IN', images: [{ url: '/og/khelo-share.png', width: 1200, height: 630, alt: 'Play GTA 6 at a KHEL-O PS5 café' }] },
    twitter: { card: 'summary_large_image', title, description, images: ['/og/khelo-share.png'] },
  };
}

export default async function Gta6SlugPage({ params }: PageProps) {
  const { slug } = await params;

  const intent = GTA6_INTENT_BY_SLUG[slug];
  if (intent) {
    const cafes = await getGta6Cafes();
    const min = minPrice(cafes);
    return (
      <Gta6SearchPage
        path={`/gta6/${slug}`}
        cafes={cafes}
        h1={intent.h1}
        line={withPrice(intent.line, min)}
        sort={intent.sort}
        crumb={intent.h1}
        answerTitle={intent.h1}
        answer={intent.body.map((t) => withPrice(t, min))}
        faq={intent.faq.map((q) => ({ question: q.question, answer: withPrice(q.answer, min) }))}
        source={`gta6-${slug}`}
        freePlay={slug === 'free'}
      />
    );
  }

  if (!GTA6_PLACES[slug]) notFound();
  const { place, all, inPlace, where, min, elsewhere } = await placeView(slug);
  const has = inPlace.length > 0;
  return (
    <Gta6SearchPage
      path={`/gta6/${slug}`}
      cafes={has ? inPlace : all}
      h1={has ? `Play GTA 6 in ${where}` : `GTA 6 in ${where}`}
      line={
        has
          ? `${plural(inPlace.length, 'PS5 café', 'PS5 cafés')}${min != null ? ` from ₹${min}/hr` : ''}. Book in a minute, walk in with a QR pass.`
          : `No café in ${where} yet. ${elsewhere.length ? `${elsewhere.join(', ')} ${elsewhere.length === 1 ? 'is' : 'are'} live below. ` : ''}Tap below and we'll bring one to you.`
      }
      place={where}
      placeCities={slug === 'india' ? all.map((c) => c.city) : place.cities}
      crumb={where}
      answerTitle={has ? `How to play GTA 6 in ${where}` : `Bring GTA 6 to ${where}`}
      answer={
        has
          ? [
              `GTA 6 is out on PS5 and Xbox, not PC. If you don't own a console, play it at a PS5 gaming café in ${where}: pick a café above, choose a time and pay online.`,
              'Show your QR pass at the desk and play. Your first KHEL-O booking has no booking fee.',
            ]
          : [
              `KHEL-O doesn't have a GTA 6 café in ${where} yet. Message us on WhatsApp with your area: we find a PS5 café near you, get it on KHEL-O, and tell you when you can book.`,
              'Meanwhile, join the KHEL-O gamer community to find people to play with. We play Valorant, GTA 6 and more.',
            ]
      }
      faq={placeFaq(where, inPlace, min, elsewhere)}
      source={`gta6-${slug}`}
    />
  );
}
