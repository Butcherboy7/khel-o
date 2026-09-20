'use client';

import { XCircle, ArrowRight, MessageSquare } from 'lucide-react';
import { Card, CardContent, Badge, Button } from '@/components/ui';
import Link from 'next/link';

interface RejectedViewProps {
  cafeName?: string;
  note?: string | null;
  suspended?: boolean;
}

export function RejectedView({ cafeName = 'Your Café', note, suspended = false }: RejectedViewProps) {
  return (
    <div className="max-w-2xl mx-auto py-12 px-4 flex flex-col items-center text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-error/10 text-error mb-6 shadow-sm">
        <XCircle className="h-8 w-8" />
      </div>

      <Badge variant="error" size="md" className="mb-4">
        {suspended ? 'Listing Suspended' : 'Application Rejected'}
      </Badge>

      <h1 className="font-heading text-display text-text-primary mb-3">
        {suspended ? 'Your café listing has been suspended' : 'Your application was not approved'}
      </h1>

      <p className="text-body text-text-secondary leading-relaxed mb-4">
        The KHEL verification team reviewed <span className="font-semibold text-text-primary">{cafeName}</span>{' '}
        {suspended ? 'and suspended its listing.' : 'and could not approve it at this time.'}
      </p>

      {note && (
        <Card elevation="raised" className="w-full mb-8 text-left bg-surface border border-error/30">
          <CardContent className="p-5">
            <p className="text-overline text-error font-semibold mb-1">Admin note</p>
            <p className="text-body text-text-primary">{note}</p>
          </CardContent>
        </Card>
      )}

      <div className="flex items-center gap-3">
        {!suspended && (
          <Link href="/owner/onboarding">
            <Button variant="primary" className="gap-2">
              <span>Fix and Resubmit</span>
              <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
        )}
        <a href="https://wa.me/919876543210" target="_blank" rel="noreferrer">
          <Button variant="secondary" className="gap-2">
            <MessageSquare className="h-4 w-4" />
            <span>Contact Support</span>
          </Button>
        </a>
      </div>
    </div>
  );
}
