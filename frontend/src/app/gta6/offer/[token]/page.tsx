import type { Metadata } from 'next';
import OfferClient from './OfferClient';

export const metadata: Metadata = { title: 'Your confirmed slot | KHEL-O', robots: { index: false, follow: false } };

export default async function OfferPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <OfferClient token={token} />;
}
