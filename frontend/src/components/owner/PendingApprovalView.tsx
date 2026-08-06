'use client';

import { Clock, ShieldCheck, CheckCircle2, MessageSquare, Phone, ArrowLeft } from 'lucide-react';
import { Card, CardContent, Badge, Button } from '@/components/ui';
import Link from 'next/link';

interface PendingApprovalViewProps {
  cafeName?: string;
  rejectionReason?: string;
  onRefreshStatus?: () => void;
}

export function PendingApprovalView({ cafeName = 'Your Café', onRefreshStatus }: PendingApprovalViewProps) {
  return (
    <div className="max-w-2xl mx-auto py-12 px-4 flex flex-col items-center text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-amber-500/10 text-amber-500 mb-6 shadow-sm">
        <Clock className="h-8 w-8 animate-pulse" />
      </div>

      <Badge variant="warning" size="md" className="mb-4">
        Application Under Review
      </Badge>

      <h1 className="font-heading text-display text-text-primary mb-3">
        Verification in Progress
      </h1>

      <p className="text-body text-text-secondary leading-relaxed mb-8">
        Your application for <span className="font-semibold text-text-primary">{cafeName}</span> has been received and is currently being inspected by the KHEL verification team.
      </p>

      <Card elevation="raised" className="w-full mb-8 text-left bg-surface border border-border/80">
        <CardContent className="p-6 flex flex-col gap-4">
          <h3 className="font-heading text-h3 text-text-primary flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" />
            <span>Verification Checklist</span>
          </h3>
          
          <div className="flex flex-col gap-3">
            <div className="flex items-start gap-3 text-caption text-text-secondary">
              <CheckCircle2 className="h-4 w-4 text-emerald-500 flex-shrink-0 mt-0.5" />
              <span>Basic business information & contact details submitted</span>
            </div>
            <div className="flex items-start gap-3 text-caption text-text-secondary">
              <CheckCircle2 className="h-4 w-4 text-emerald-500 flex-shrink-0 mt-0.5" />
              <span>Interactive Google Maps location coordinates logged</span>
            </div>
            <div className="flex items-start gap-3 text-caption text-text-secondary">
              <Clock className="h-4 w-4 text-amber-500 flex-shrink-0 mt-0.5" />
              <span>Verification of business documents & Razorpay Route payout setup (in progress)</span>
            </div>
            <div className="flex items-start gap-3 text-caption text-text-secondary">
              <Clock className="h-4 w-4 text-amber-500 flex-shrink-0 mt-0.5" />
              <span>Final admin approval & catalog listing</span>
            </div>
          </div>

          <div className="border-t border-border pt-4 mt-2 flex flex-col sm:flex-row items-center justify-between gap-3 bg-surface-hover p-4 rounded-xl">
            <span className="text-caption text-text-secondary">Need urgent assistance or doc updates?</span>
            <div className="flex items-center gap-2">
              <a
                href="https://wa.me/919876543210"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-600 text-caption font-semibold hover:bg-emerald-500/20 transition-all"
              >
                <MessageSquare className="h-4 w-4" />
                <span>WhatsApp Support</span>
              </a>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center gap-3">
        {onRefreshStatus && (
          <Button variant="secondary" onClick={onRefreshStatus}>
            Check Application Status
          </Button>
        )}
        <Link href="/">
          <Button variant="outline" className="gap-2">
            <ArrowLeft className="h-4 w-4" />
            <span>Return to Marketplace</span>
          </Button>
        </Link>
      </div>
    </div>
  );
}
