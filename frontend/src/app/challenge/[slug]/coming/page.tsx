import { ComingClient } from './ComingClient';

export default async function ComingPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <ComingClient slug={slug} />;
}
