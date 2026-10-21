'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { adminGetChallenge, adminUpdateChallenge } from '@/lib/api/challenges';
import { ChallengeForm } from '@/components/challenge/admin/ChallengeForm';
import { ErrorState, PageSpinner } from '@/components/ui';

export default function EditChallengePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['admin', 'challenge', id],
    queryFn: () => adminGetChallenge(id),
  });
  if (isLoading) return <PageSpinner label="Loading the challenge" />;
  if (isError || !data) return <ErrorState message={(error as Error)?.message} onRetry={() => refetch()} />;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4 pb-12">
      <Link href={`/admin/challenges/${id}`} className="text-caption font-semibold text-text-secondary hover:text-text-primary">
        ← {data.challenge.title}
      </Link>
      <h1 className="font-heading text-h1 text-text-primary">Edit challenge</h1>
      <ChallengeForm
        initial={data.challenge}
        submitLabel="Save changes"
        onSubmit={async (body) => {
          await adminUpdateChallenge(id, body);
          await qc.invalidateQueries({ queryKey: ['admin', 'challenge', id] });
          await qc.invalidateQueries({ queryKey: ['admin', 'challenges'] });
          router.push(`/admin/challenges/${id}`);
        }}
      />
    </div>
  );
}
