'use client';

import { useRouter } from 'next/navigation';
import { Store, CheckCircle2, Clock, ShieldCheck, CreditCard, Users, TrendingUp, ChevronRight } from 'lucide-react';
import { CustomerShell } from '@/components/layout/CustomerShell';
import { Button, Card, CardContent, Badge } from '@/components/ui';

const PARTNER_BENEFITS = [
  {
    icon: TrendingUp,
    title: 'Free to list',
    // Deliberately quotes no percentage. The old copy promised owners a "3-5%
    // convenience fee" on their side, which the code does not do — the fee is
    // added on top of the customer's total and the café is settled the full
    // subtotal (see PlatformFee.owner_settlement_amount). Owners who priced to
    // absorb that phantom fee were making KHELO look ~8% dearer than their own
    // walk-in rate. Setup/monthly costs are the claims that stay true whatever
    // the commission model does later.
    description: 'List your venue for free. No setup fees and no monthly charges.',
  },
  {
    icon: Users,
    title: 'Get found by players near you',
    description: 'People in your city searching for a PS5, a snooker table or a bowling lane see your place, your prices and your free slots.',
  },
  {
    icon: Clock,
    title: 'Bookings that run themselves',
    description: 'Customers book and pay online any time. They show a QR pass at your desk, and you see every booking on your phone.',
  },
  {
    icon: ShieldCheck,
    title: 'Money straight to your UPI',
    description: 'Once a customer’s payment clears (2–3 working days), KHEL-O sends your share to your UPI ID or bank. Every transfer is listed with its receipt number.',
  },
];

const REQUIREMENTS = [
  'A UPI ID, so we can send you your money',
  'At least one thing customers can book, with a price per hour: a PC, a console, a snooker or pool table, a bowling lane, a VR or racing setup',
  'Business PAN, GSTIN and trade licence are optional, but they get you approved faster',
  'Good photos of your place. Listings with clear photos get far more bookings',
];

const PROCESS_STEPS = [
  { step: 1, title: 'Your venue', description: 'Name, address, map pin and phone number' },
  { step: 2, title: 'Business papers', description: 'PAN, GSTIN, trade licence. All optional' },
  { step: 3, title: 'Where to send money', description: 'Your UPI ID (required)' },
  { step: 4, title: 'Hours & setups', description: 'Opening hours, what customers can book, price per hour' },
  { step: 5, title: 'Photos & games', description: 'Photos of your place and menu; games list if you have consoles or PCs' },
  { step: 6, title: 'Check & submit', description: 'Look it over and send it. We review it and get you live' },
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
          List your venue on KHEL-O
        </h1>
        
        <p className="text-body-lg text-text-secondary max-w-2xl mx-auto">
          Gaming café, snooker or pool club, bowling alley, VR or game zone: let people find you,
          book a slot and pay online. Free to list, with QR check-in built in.
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
                What&apos;s required to submit, plus what we recommend
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
          Get listed in 6 steps
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
          <span>List my venue</span>
          <ChevronRight className="h-5 w-5" />
        </Button>
        
        <p className="text-caption text-text-secondary">
          Takes about 15 minutes · Free to list
        </p>
      </div>
    </div>
  );
}
