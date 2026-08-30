'use client';

import { useRouter } from 'next/navigation';
import { Store, CheckCircle2, Clock, ShieldCheck, CreditCard, Users, TrendingUp, ChevronRight } from 'lucide-react';
import { CustomerShell } from '@/components/layout/CustomerShell';
import { Button, Card, CardContent, Badge } from '@/components/ui';

const PARTNER_BENEFITS = [
  {
    icon: TrendingUp,
    title: 'Zero Upfront Cost',
    description: 'List your venue for free. Pay only 3-5% convenience fee on successful bookings.',
  },
  {
    icon: Users,
    title: 'Get Discovered by Nearby Gamers',
    description: 'Show up in search when gamers near your city look for a café with your hardware and pricing.',
  },
  {
    icon: Clock,
    title: 'Automated Booking System',
    description: '24/7 online booking, QR check-ins, real-time availability, and automated reminders.',
  },
  {
    icon: ShieldCheck,
    title: 'Secure Payments',
    description: 'Instant Razorpay Route settlements directly to your bank account within T+2 days.',
  },
];

const REQUIREMENTS = [
  'Valid business registration (Trade License/Shop & Establishment)',
  'Minimum 5 gaming PCs or console stations',
  'Functional hardware meeting minimum specs (GTX 1660 or above)',
  'Active bank account for payouts',
  'GST registration (optional but recommended for tax benefits)',
  'High-speed internet connection (minimum 50 Mbps)',
];

const PROCESS_STEPS = [
  { step: 1, title: 'Venue Details', description: 'Café name, address, location, contact info' },
  { step: 2, title: 'Business Verification', description: 'PAN, GSTIN, trade license document' },
  { step: 3, title: 'Bank Account', description: 'Account number, IFSC for settlement payouts' },
  { step: 4, title: 'Hours & Hardware', description: 'Operating hours, GPU tiers, pricing' },
  { step: 5, title: 'Amenities & Games', description: 'Facilities, supported games list' },
  { step: 6, title: 'Review & Submit', description: 'Final review before submission' },
];

export default function PartnerIntroPage() {
  const router = useRouter();

  return (
    <div className="max-w-5xl mx-auto pb-24">
      {/* Hero Section */}
      <div className="text-center mb-12">
        <Badge variant="primary" size="md" className="mb-4">
          Partner with KHEL-O
        </Badge>
        
        <h1 className="font-heading text-display text-text-primary mb-4">
          List Your Gaming Café
        </h1>
        
        <p className="text-body-lg text-text-secondary max-w-2xl mx-auto">
          Transform your gaming café into a fully automated booking destination —
          free to list, with online payments and QR check-in built in.
        </p>
      </div>

      {/* Benefits Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-12">
        {PARTNER_BENEFITS.map((benefit, idx) => (
          <Card key={idx} elevation="resting" className="border border-border/60">
            <CardContent className="p-5">
              <div className="flex items-start gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary flex-shrink-0">
                  <benefit.icon className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="font-heading text-body font-bold text-text-primary mb-1">
                    {benefit.title}
                  </h3>
                  <p className="text-caption text-text-secondary">
                    {benefit.description}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Requirements Section */}
      <Card elevation="raised" className="mb-12 border border-accent/20">
        <CardContent className="p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/10 text-accent">
              <CheckCircle2 className="h-5 w-5" />
            </div>
            <div>
              <h2 className="font-heading text-h3 font-bold text-text-primary">
                What You&apos;ll Need
              </h2>
              <p className="text-caption text-text-secondary">
                Documents and requirements for verification
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {REQUIREMENTS.map((req, idx) => (
              <div key={idx} className="flex items-start gap-2">
                <div className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="text-caption font-bold">{idx + 1}</span>
                </div>
                <span className="text-body text-text-primary">{req}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Process Overview */}
      <div className="mb-12">
        <h2 className="font-heading text-h2 text-text-primary mb-6 text-center">
          6-Step Onboarding Process
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
          {PROCESS_STEPS.map((process) => (
            <Card key={process.step} elevation="resting" className="border border-border/40">
              <CardContent className="p-4">
                <div className="flex items-center gap-3 mb-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-secondary text-white font-bold font-heading">
                    {process.step}
                  </div>
                  <h3 className="font-heading text-body font-bold text-text-primary">
                    {process.title}
                  </h3>
                </div>
                <p className="text-caption text-text-secondary ml-11">
                  {process.description}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* CTA Button */}
      <div className="flex flex-col items-center gap-4">
        <Button
          variant="primary"
          size="lg"
          onClick={() => router.push('/owner/onboarding')}
          className="gap-2 min-w-[280px]"
        >
          <Store className="h-5 w-5" />
          <span>Get Listed on KHEL-O</span>
          <ChevronRight className="h-5 w-5" />
        </Button>
        
        <p className="text-caption text-text-secondary">
          Takes ~15 minutes • Free to list
        </p>
      </div>
    </div>
  );
}
