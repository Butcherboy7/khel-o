'use client';

import { useParams } from 'next/navigation';
import { ManageTournament } from '@/components/tournaments/host/ManageTournament';

export default function Page() {
  const { id } = useParams<{ id: string }>();
  return <ManageTournament id={id} base="/admin/tournaments" />;
}
