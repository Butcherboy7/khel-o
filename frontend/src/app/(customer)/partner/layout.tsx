import type { Metadata } from 'next';

// The page itself is a client component, so its search title lives here.
// Without this /partner had the site-wide default title and inherited the
// homepage canonical, so Google treated the café-owner pitch as a duplicate.
export const metadata: Metadata = {
  title: 'List Your Gaming Café, Snooker or Bowling Venue on KHEL-O',
  description:
    'Get online bookings for your gaming café, snooker hub or bowling alley in Hyderabad. Players see live availability and pay upfront, so fewer no-shows and no phone calls. Free to join.',
  alternates: { canonical: '/partner' },
};

export default function PartnerLayout({ children }: { children: React.ReactNode }) {
  return children;
}
