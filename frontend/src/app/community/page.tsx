import type { Metadata } from 'next';
import { CommunityClient } from './CommunityClient';

export const metadata: Metadata = {
  title: 'KHEL-O Community on WhatsApp',
  description:
    'Hyderabad gamers on one WhatsApp Community: challenge news, café updates and people to play with. Free to join, leave any time.',
  alternates: { canonical: '/community' },
  openGraph: {
    title: 'You had to be there. Don’t miss #02.',
    description: 'A full house at Tekken #01. The next one drops in the KHEL-O WhatsApp group first. Free to join.',
    url: '/community',
    images: [{ url: '/community/og.jpg', width: 1200, height: 630, alt: 'The full house at KHELO Tekken Challenge #01' }],
  },
};

export default function CommunityPage() {
  return <CommunityClient />;
}
