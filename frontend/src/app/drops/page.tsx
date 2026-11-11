import type { Metadata } from 'next';
import { listDrops, type DropListItem } from '@/lib/api/drops';
import { DropsIndexClient } from './DropsIndexClient';

export const metadata: Metadata = {
  title: 'Launch drops: reserve a seat at a gaming café',
  description: 'Big game launches at gaming cafés near you. Pick a café, reserve your seat with a small booking fee and pay the rest when you play.',
  alternates: { canonical: '/drops' },
};

// Every café taking seats right now. With ?game=gta6 it becomes "pick your café" for that game.
export default async function DropsIndexPage({ searchParams }: { searchParams: Promise<{ game?: string }> }) {
  const { game } = await searchParams;
  let initial: DropListItem[] | null = null;
  try {
    initial = await listDrops();
  } catch {
    initial = null;
  }
  return <DropsIndexClient initial={initial} game={typeof game === 'string' ? game : null} />;
}
