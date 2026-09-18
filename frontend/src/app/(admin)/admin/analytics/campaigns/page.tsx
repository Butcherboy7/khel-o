'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { QrCode, ArrowRight } from 'lucide-react';
import { getCampaigns } from '@/lib/api/adminAnalytics';
import { SkeletonCard, EmptyState } from '@/components/ui';

export default function CampaignsPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'analytics', 'campaigns'],
    queryFn: getCampaigns,
    staleTime: 60_000,
  });

  return (
    <div className="flex flex-col gap-6 pb-12">
      <div className="flex items-center gap-2">
        <QrCode className="h-6 w-6 text-primary" />
        <h1 className="font-heading text-h1 text-text-primary">Campaigns</h1>
      </div>

      {isLoading && <SkeletonCard />}

      {data && data.length === 0 && (
        <EmptyState title="No campaigns yet" description="Offline/QR drops set up in the backend will appear here." />
      )}

      {data && data.length > 0 && (
        <div className="flex flex-col gap-3">
          {data.map((c) => (
            <Link
              key={c.id}
              href={`/admin/analytics/campaigns/${c.id}`}
              className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-surface p-4 hover:border-primary transition-colors"
            >
              <div className="flex flex-col gap-0.5">
                <span className="font-semibold text-body text-text-primary">{c.name}</span>
                <span className="text-caption text-text-secondary">
                  {c.source} · {c.medium} · {c.landingPage}
                </span>
              </div>
              <ArrowRight className="h-5 w-5 text-text-secondary shrink-0" />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
