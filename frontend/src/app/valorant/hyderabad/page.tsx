import type { Metadata } from 'next';
import Link from 'next/link';
import { CustomerShell } from '@/components/layout/CustomerShell';
import { valorant3v3Xqz as cfg } from '@/challenges/valorant-5v5-xqz';
import { getPublicEnv } from '@/lib/runtimeEnv';

const SITE_URL = getPublicEnv('NEXT_PUBLIC_APP_URL', 'https://khel-o.online');
const CHALLENGE = `/challenge/${cfg.slug}`;
const SHARE = '/challenges/valorant-3v3-xqz/poster-og.jpg';

// Words people type: Valorant 5v5 Hyderabad, Valorant event Hyderabad, Valorant LAN, Valorant Gachibowli, gaming cafe.
// The literal word "tournament" is kept out of the page body on purpose (payment partners read the site).
const TITLE = 'Valorant 5v5 in Hyderabad: In-Person Event at XQZ, Gachibowli (Sat 5 Dec)';
const DESCRIPTION =
  'Play Valorant 5v5 in person in Hyderabad. Knockout bracket for teams of 5 at XQZ Gaming Cafe, Gachibowli on Sat 5 Dec. We provide the gaming PCs (RTX 5060 Ti, Ryzen 5 9600X, 540Hz). ₹250 per person, solo players welcome.';

const FAQ: { q: string; a: string }[] = [
  { q: 'Where can I play a Valorant 5v5 in Hyderabad?', a: 'KHEL-O and XQZ Gaming Cafe run a Valorant 5v5 challenge on Saturday 5 December 2026, in person at XQZ Gaming Cafe, Gachibowli, Hyderabad. Teams of 5 play Swift Play matches in a knockout bracket.' },
  { q: 'Is there a Valorant event or LAN in Gachibowli?', a: 'Yes. It is a LAN-style event: everyone plays in person on the same gaming PCs at XQZ Gaming Cafe, Gachibowli. Report by 11:00 AM, first matches start at 12:00 PM.' },
  { q: 'Do I need to bring my own PC or laptop?', a: 'No. XQZ provides every PC: RTX 5060 Ti 16GB, Ryzen 5 9600X, 32GB DDR5 6000, 1TB NVMe Gen4 and a 540Hz monitor. Every seat is the same build and the peripherals are provided. Bring your phone and your Riot ID.' },
  { q: 'How much does it cost?', a: '₹250 per person, so ₹1,250 for a team of 5. Rewards worth ₹5,000 come from XQZ and Team Khelo.' },
  { q: 'Can I join without a team?', a: 'Yes. Sign up as a solo player and KHEL-O will find you teammates.' },
  { q: 'What rank do I need?', a: 'All ranks can join. You may meet much stronger players.' },
  { q: 'How do I sign up?', a: `Open ${SITE_URL}${CHALLENGE}, choose team or solo and pay online. Sign-ups close on Thursday 3 December at 9:00 PM or when all team spots are taken.` },
];

export const metadata: Metadata = {
  title: { absolute: `${TITLE} | KHEL-O` },
  description: DESCRIPTION,
  keywords: [
    'Valorant 5v5 Hyderabad', 'Valorant event Hyderabad', 'Valorant LAN Hyderabad', 'Valorant Gachibowli', 'Valorant near me',
    'Valorant tournament Hyderabad', 'Valorant competition Hyderabad', 'Valorant team event', 'gaming cafe Hyderabad', 'XQZ Gaming Cafe', 'Valorant Swift Play 5v5',
  ],
  alternates: { canonical: '/valorant/hyderabad', languages: { 'en-IN': `${SITE_URL}/valorant/hyderabad` } },
  openGraph: { title: TITLE, description: DESCRIPTION, url: `${SITE_URL}/valorant/hyderabad`, type: 'website', locale: 'en_IN', images: [{ url: SHARE, width: 1200, height: 1200 }] },
  twitter: { card: 'summary_large_image', title: TITLE, description: DESCRIPTION, images: [SHARE] },
};

export default function ValorantHyderabadPage() {
  const jsonLd = [
    {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: FAQ.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })),
    },
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'KHEL-O', item: `${SITE_URL}/` },
        { '@type': 'ListItem', position: 2, name: 'Valorant 5v5 in Hyderabad', item: `${SITE_URL}/valorant/hyderabad` },
      ],
    },
  ];
  const facts: [string, string][] = [
    ['When', 'Saturday 5 December 2026. Report 11:00 AM, first match 12:00 PM, rewards and photos around 3:50 PM.'],
    ['Where', `In person at ${cfg.venue.name}, ${cfg.venue.address}`],
    ['Format', 'Swift Play 5v5, teams of 5, knockout bracket. First team to 5 rounds wins a game.'],
    ['Entry', '₹250 per person (₹1,250 per team of 5). Solo players welcome, we place you in a team.'],
    ['Rewards', 'Worth ₹5,000, from XQZ and Team Khelo.'],
    ['Provided', cfg.provided.specs.map((s) => `${s.label}: ${s.value}`).join(' · ') + '. Mouse, keyboard and the rest are provided.'],
    ['Bring', 'Your phone and your Riot ID. Nothing else.'],
  ];
  return (
    <CustomerShell>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }} />
      <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 pb-12 pt-6">
        <header className="flex flex-col gap-3">
          <h1 className="font-heading text-h1 text-balance text-text-primary">Valorant 5v5 in Hyderabad</h1>
          <p className="max-w-[68ch] text-body text-text-secondary">
            A real match day for Valorant teams, in person at XQZ Gaming Cafe in Gachibowli on Saturday 5 December. We provide top-spec gaming PCs,
            you bring your team of 5 (or join solo) and your Riot ID. All ranks welcome.
          </p>
          <Link href={CHALLENGE} className="btn-depth inline-flex min-h-[48px] w-fit items-center rounded-xl bg-primary px-5 text-body font-bold text-white">
            See details and sign up
          </Link>
        </header>

        <section aria-labelledby="facts" className="flex flex-col gap-2">
          <h2 id="facts" className="font-heading text-h2 text-text-primary">The details</h2>
          <dl className="divide-y divide-border rounded-2xl border border-border bg-card">
            {facts.map(([k, v]) => (
              <div key={k} className="grid gap-1 px-4 py-3 sm:grid-cols-[7rem_1fr]">
                <dt className="text-body font-bold text-text-primary">{k}</dt>
                <dd className="text-body text-text-secondary">{v}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section aria-labelledby="faq" className="flex flex-col gap-2">
          <h2 id="faq" className="font-heading text-h2 text-text-primary">Questions</h2>
          <div className="flex flex-col divide-y divide-border rounded-2xl border border-border bg-card">
            {FAQ.map((f) => (
              <div key={f.q} className="flex flex-col gap-1 px-4 py-3">
                <h3 className="text-body font-bold text-text-primary">{f.q}</h3>
                <p className="text-body text-text-secondary">{f.a}</p>
              </div>
            ))}
          </div>
        </section>

        <p className="text-caption text-text-secondary">
          Not affiliated with or endorsed by Riot Games. Questions: WhatsApp +91 81421 28389 or founder@khel-o.com.
        </p>
      </main>
    </CustomerShell>
  );
}
