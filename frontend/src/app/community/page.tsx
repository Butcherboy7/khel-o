import type { Metadata } from 'next';
import { CommunityClient } from './CommunityClient';

export const metadata: Metadata = {
  title: 'KHEL-O Community on WhatsApp',
  description:
    'Hyderabad gamers on one WhatsApp Community: challenge news, café updates and people to play with. Free to join, leave any time.',
  alternates: { canonical: '/community' },
  openGraph: {
    title: 'Join the KHEL-O gamers community',
    description: 'Challenges, café news and people to play with in Hyderabad. Free, on WhatsApp.',
    url: '/community',
  },
};

export default function CommunityPage() {
  return <CommunityClient />;
}
