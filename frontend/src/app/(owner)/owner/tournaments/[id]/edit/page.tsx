'use client';

import { useParams } from 'next/navigation';
import { TournamentForm } from '@/components/tournaments/host/TournamentForm';

export default function Page() {
  const { id } = useParams<{ id: string }>();
  return <TournamentForm base="/owner/tournaments" id={id} />;
}
