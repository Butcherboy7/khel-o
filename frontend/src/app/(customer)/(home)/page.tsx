import type { Metadata } from 'next';
import { HomeScreen } from '@/components/customer/HomeScreen';
import { Gta6Block } from '@/components/gta6/Gta6Block';
import { getGta6Cafes } from '@/lib/gta6Live';

// Rendered per request. Prerendered at build time, the page had no café data
// (the builder can't reach the backend) and ExploreClient's useSearchParams
// bailed out to client rendering, so crawlers got a skeleton with no heading.
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: { absolute: 'KHEL-O: Play GTA 6 & Book Gaming Cafés in Hyderabad' },
  description:
    'Play GTA 6 at a PS5 gaming café, or book gaming cafés, snooker clubs and bowling alleys in Hyderabad. Compare prices and timings, see live availability and book online on KHEL-O.',
  alternates: {
    canonical: '/',
  },
};

export default async function ExplorePage() {
  // While GTA 6 cafés are live, the home screen opens with them.
  const gta6 = await getGta6Cafes();
  return (
    <HomeScreen
      top={gta6.length > 0 ? <Gta6Block cafes={gta6} heading="GTA 6 is out. Play it at a café near you." source="home" /> : undefined}
    />
  );
}
