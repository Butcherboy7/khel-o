'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRight, Instagram } from 'lucide-react';
import { Button } from '@/components/ui';
import { useAnalyticsStore } from '@/store/analyticsStore';
import { fireAnalyticsEvent } from '@/lib/api/analyticsEvents';

const CAMPAIGN_ID = 'rs100-drop';

export default function Rs100DropPage() {
  const router = useRouter();
  const captureAttribution = useAnalyticsStore((s) => s.captureAttribution);

  useEffect(() => {
    captureAttribution('offline', 'qr', CAMPAIGN_ID);
    fireAnalyticsEvent('campaign_landing_view', { metadata: { campaignId: CAMPAIGN_ID } });
    // Fire once per mount — a refresh is a new visit, intentionally.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleFindSession = () => {
    fireAnalyticsEvent('campaign_cta_click', { metadata: { campaignId: CAMPAIGN_ID, target: 'khelo' } });
    router.push('/');
  };

  return (
    <main className="min-h-[100dvh] flex flex-col items-center justify-center px-6 py-12 bg-background text-center gap-8">
      <div className="flex flex-col items-center gap-4 max-w-sm">
        <span className="text-6xl" aria-hidden>💸</span>
        <h1 className="font-heading text-h1 text-text-primary leading-tight">
          You found a fake ₹100.
        </h1>
        <p className="text-body-lg text-text-secondary">
          But ₹100 can get you a gaming session on <span className="font-semibold text-primary">KHELO</span>.
        </p>
      </div>

      <div className="flex flex-col gap-3 w-full max-w-xs">
        <Button variant="primary" size="lg" onClick={handleFindSession} className="gap-2 w-full">
          Find a Gaming Session
          <ArrowRight className="h-5 w-5" />
        </Button>

        <Link href="/100/instagram" className="w-full">
          <Button variant="ghost" size="lg" className="gap-2 w-full">
            <Instagram className="h-4 w-4" />
            Follow KHELO on Instagram
          </Button>
        </Link>
      </div>
    </main>
  );
}
