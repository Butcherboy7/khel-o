import type { Metadata } from 'next';
import { Gta6Client } from './Gta6Client';

export const metadata: Metadata = {
  title: 'GTA 6 launch list',
  description:
    'GTA 6 drops 19 Nov on PS5 and Xbox. No console at home? PS5 cafés on KHEL-O in Hyderabad have pre-ordered it. Join the launch list and hear first when launch-week slots open.',
  alternates: { canonical: '/gta6' },
  openGraph: {
    title: 'GTA 6 drops 19 Nov. No PS5? Play it at a café.',
    description: 'Hyderabad PS5 cafés have pre-ordered it. Join the KHEL-O launch list and get first dibs on launch week.',
    url: '/gta6',
  },
};

export default function Gta6Page() {
  return <Gta6Client />;
}
