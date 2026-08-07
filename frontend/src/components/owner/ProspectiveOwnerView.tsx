'use client';

import Link from 'next/link';
import { Store, ShieldCheck, Zap, TrendingUp, ChevronRight, Check } from 'lucide-react';
import { Button, Card, CardContent } from '@/components/ui';

export function ProspectiveOwnerView() {
  return (
    <div className="max-w-4xl mx-auto py-8 px-4 flex flex-col gap-10">
      {/* Hero Banner */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-900 via-emerald-950 to-slate-900 text-white p-8 md:p-12 shadow-2xl border border-emerald-500/20">
        <div className="relative z-10 max-w-2xl flex flex-col gap-4">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-emerald-500/20 text-emerald-400 text-caption font-semibold border border-emerald-500/30">
            <Zap className="h-4 w-4" />
            <span>KHEL Café Marketplace</span>
          </div>
          <h1 className="font-heading text-display md:text-[2.75rem] font-bold leading-tight">
            Grow Your Gaming Café Revenue with KHELO
          </h1>
          <p className="text-body text-slate-300 leading-relaxed">
            Fill idle PC stations, automate hourly bookings, and receive direct Razorpay Route payouts. Join over 30+ top gaming lounges across India.
          </p>
          <div className="pt-4 flex flex-wrap items-center gap-4">
            <Link href="/owner/onboarding">
              <Button variant="primary" size="lg" className="gap-2 text-base px-8 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold shadow-emerald-500/20">
                <span>Start Café Onboarding</span>
                <ChevronRight className="h-5 w-5" />
              </Button>
            </Link>
          </div>
        </div>
      </div>

      {/* Feature Value Props */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card elevation="resting" className="bg-surface border border-border/80">
          <CardContent className="p-6 flex flex-col gap-3">
            <div className="h-12 w-12 rounded-2xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center font-bold">
              <TrendingUp className="h-6 w-6" />
            </div>
            <h3 className="font-heading text-h3 text-text-primary">Direct Payouts</h3>
            <p className="text-caption text-text-secondary">
              Seamless Razorpay Route automated settlements straight into your bank account with complete fee transparency.
            </p>
          </CardContent>
        </Card>

        <Card elevation="resting" className="bg-surface border border-border/80">
          <CardContent className="p-6 flex flex-col gap-3">
            <div className="h-12 w-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center font-bold">
              <Store className="h-6 w-6" />
            </div>
            <h3 className="font-heading text-h3 text-text-primary">Preset Hardware Tiers</h3>
            <p className="text-caption text-text-secondary">
              No need to configure individual PCs. Define hardware tiers like RTX 4090, RTX 3060, or PS5 Lounge and set hourly rates.
            </p>
          </CardContent>
        </Card>

        <Card elevation="resting" className="bg-surface border border-border/80">
          <CardContent className="p-6 flex flex-col gap-3">
            <div className="h-12 w-12 rounded-2xl bg-indigo-500/10 text-indigo-600 flex items-center justify-center font-bold">
              <ShieldCheck className="h-6 w-6" />
            </div>
            <h3 className="font-heading text-h3 text-text-primary">1-Tap Verification</h3>
            <p className="text-caption text-text-secondary">
              Scan customer QR codes or verify OTP at check-in. Staff can operate the portal effortlessly without accessing financials.
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Onboarding Checklist Preview */}
      <Card elevation="raised" className="bg-surface border border-border">
        <CardContent className="p-6 md:p-8 flex flex-col gap-6">
          <div className="flex flex-col gap-1">
            <h2 className="font-heading text-h2 text-text-primary">Simple 6-Step Onboarding</h2>
            <p className="text-caption text-text-secondary">Takes less than 5 minutes to submit your venue for listing.</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {[
              'Basic Café Info & Location',
              'Business Verification (GSTIN/PAN)',
              'Bank Payout Account (Razorpay)',
              'Operating Hours & Hardware Tiers',
              'Games Supported & Photos',
              'House Rules & Review Submission'
            ].map((step, idx) => (
              <div key={idx} className="flex items-center gap-3 p-3 rounded-xl bg-surface-hover border border-border/60">
                <div className="h-6 w-6 rounded-full bg-emerald-500/20 text-emerald-600 flex items-center justify-center text-xs font-bold">
                  {idx + 1}
                </div>
                <span className="text-body font-medium text-text-primary">{step}</span>
              </div>
            ))}
          </div>

          <div className="pt-2 flex justify-end">
            <Link href="/owner/onboarding">
              <Button variant="primary" className="gap-2 px-6">
                <span>Begin Partner Setup</span>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
