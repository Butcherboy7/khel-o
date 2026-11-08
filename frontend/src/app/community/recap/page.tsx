import type { Metadata } from 'next';
import { RecapClient } from './RecapClient';

export const metadata: Metadata = {
  title: 'Tekken #01 recap | KHEL-O Community',
  description: 'A full house at Tekken #01. The photos, the crown and what is next, first in the KHEL-O WhatsApp group.',
  alternates: { canonical: '/community/recap' },
  openGraph: {
    title: 'You had to be there. Don’t miss #02.',
    description: 'A full house at Tekken #01. The next one drops in the KHEL-O WhatsApp group first. Free to join.',
    url: '/community/recap',
    images: [{ url: '/community/og.jpg', width: 1200, height: 630, alt: 'The full house at KHELO Tekken Challenge #01' }],
  },
};

export default function Page() {
  return <RecapClient />;
}
