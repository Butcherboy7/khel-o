import type { Metadata } from 'next';
import { Gta6Client } from './Gta6Client';

export const metadata: Metadata = {
  title: 'GTA 6 launch list · KHEL-O',
  description:
    'GTA 6 drops 19 Nov on PS5 and Xbox. No console at home? Join the KHEL-O launch list for first dibs on launch-week PS5 slots at gaming cafés in Hyderabad.',
  alternates: { canonical: '/gta6' },
  openGraph: {
    title: 'GTA 6 drops 19 Nov. No PS5? Play it at a café.',
    description: 'Join the KHEL-O launch list for first dibs on launch-week PS5 slots.',
    url: '/gta6',
  },
};

export default function Gta6Page() {
  return <Gta6Client />;
}
