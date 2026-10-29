import { ComingClient } from './ComingClient';

export default function ComingPage({ params }: { params: { slug: string } }) {
  return <ComingClient slug={params.slug} />;
}
