'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { adminCreateChallenge } from '@/lib/api/challenges';
import { ChallengeForm } from '@/components/challenge/admin/ChallengeForm';

export default function NewChallengePage() {
  const router = useRouter();
  const qc = useQueryClient();
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4 pb-12">
      <Link href="/admin/challenges" className="text-caption font-semibold text-text-secondary hover:text-text-primary">← Challenges</Link>
      <h1 className="font-heading text-h1 text-text-primary">New challenge</h1>
      <ChallengeForm
        submitLabel="Create challenge"
        onSubmit={async (body) => {
          const c = await adminCreateChallenge(body);
          await qc.invalidateQueries({ queryKey: ['admin', 'challenges'] });
          router.push(`/admin/challenges/${c.id}`);
        }}
      />
    </div>
  );
}
