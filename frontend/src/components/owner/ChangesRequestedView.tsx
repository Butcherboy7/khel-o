'use client';

import { AlertTriangle, ArrowRight, RefreshCw } from 'lucide-react';
import { Card, CardContent, Badge, Button } from '@/components/ui';
import Link from 'next/link';

interface ChangesRequestedViewProps {
  cafeName?: string;
  note?: string | null;
  onRefreshStatus?: () => void;
}

export function ChangesRequestedView({ cafeName = 'Your Café', note, onRefreshStatus }: ChangesRequestedViewProps) {
  return (
    <div className="max-w-2xl mx-auto py-12 px-4 flex flex-col items-center text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-amber-500/10 text-amber-500 mb-6 shadow-sm">
        <AlertTriangle className="h-8 w-8" />
      </div>

      <Badge variant="warning" size="md" className="mb-4">
        Changes Requested
      </Badge>

      <h1 className="font-heading text-display text-text-primary mb-3">
        Almost there — one thing to fix
      </h1>

      <p className="text-body text-text-secondary leading-relaxed mb-4">
        The KHEL verification team reviewed <span className="font-semibold text-text-primary">{cafeName}</span> and
        needs a small change before approving it.
      </p>

      {note && (
        <Card elevation="raised" className="w-full mb-8 text-left bg-surface border border-amber-500/30">
          <CardContent className="p-5">
            <p className="text-overline text-amber-600 font-semibold mb-1">Admin note</p>
            <p className="text-body text-text-primary">{note}</p>
          </CardContent>
        </Card>
      )}

      <div className="flex items-center gap-3">
        <Link href="/owner/onboarding">
          <Button variant="primary" className="gap-2">
            <span>Fix and Resubmit</span>
            <ArrowRight className="h-4 w-4" />
          </Button>
        </Link>
        {onRefreshStatus && (
          <Button variant="secondary" onClick={onRefreshStatus} className="gap-2">
            <RefreshCw className="h-4 w-4" />
            <span>Refresh Status</span>
          </Button>
        )}
      </div>
    </div>
  );
}
