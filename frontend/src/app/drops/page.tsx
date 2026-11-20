import type { Metadata } from 'next';
import { listDrops, type DropListItem } from '@/lib/api/drops';
import { DropsIndexClient } from './DropsIndexClient';

export async function generateMetadata({ searchParams }: { searchParams: Promise<{ game?: string }> }): Promise<Metadata> {
  const { game } = await searchParams;
  if (typeof game === 'string' && /gta/i.test(game)) {
    return {
      title: 'Play GTA 6 at a gaming café near you',
      description: 'GTA 6 is out. Pick a gaming café that has it, choose a time and book. Late-night launch sessions can be reserved with a small fee.',
      alternates: { canonical: '/drops?game=gta6' },
    };
  }
  return {
    title: 'Launch drops: reserve a seat at a gaming café',
    description: 'Big game launches at gaming cafés near you. Pick a café, reserve your seat with 50% in advance and pay the rest when you play.',
    alternates: { canonical: '/drops' },
  };
}

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
