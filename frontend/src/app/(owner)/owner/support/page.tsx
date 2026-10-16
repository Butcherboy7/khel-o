'use client';

import { Compass } from 'lucide-react';
import { SupportView } from '@/components/support/SupportView';
import { Button } from '@/components/ui';
import { useAuthStore } from '@/store/authStore';
import { useOwnerTourStore } from '@/store/ownerTourStore';

export default function OwnerSupportPage() {
  const isStaff = useAuthStore((s) => s.activeRole) === 'staff';
  const startTour = useOwnerTourStore((s) => s.start);

  return (
    <div className="flex flex-col gap-2">
      {!isStaff && (
        <div className="mx-auto mt-6 flex w-full max-w-2xl items-center justify-between gap-3 rounded-2xl border border-primary/25 bg-primary/5 p-4">
          <div className="flex min-w-0 items-start gap-3">
            <Compass className="mt-0.5 h-5 w-5 flex-shrink-0 text-primary" aria-hidden />
            <div className="min-w-0">
              <p className="text-body-emphasis text-text-primary">App tour</p>
              <p className="text-caption text-text-secondary">What each part of the app does, and how you get paid. About 2 minutes.</p>
            </div>
          </div>
          <Button variant="primary" size="sm" onClick={startTour} className="flex-shrink-0">
            Show me
          </Button>
        </div>
      )}
      <SupportView />
    </div>
  );
}
