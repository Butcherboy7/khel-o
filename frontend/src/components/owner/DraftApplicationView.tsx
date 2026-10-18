'use client';

import { ArrowRight, CheckCircle2, Circle, LifeBuoy, PenLine } from 'lucide-react';
import Link from 'next/link';
import { Badge, Button, Card, CardContent } from '@/components/ui';
import { ONBOARDING_STEP_TITLES } from '@/lib/onboardingSteps';

interface DraftApplicationViewProps {
  cafeName?: string;
  /** The wizard step the owner will land on (1-based), from draftData.step. */
  step?: number;
}

/** Owner started the application but never pressed Submit. Nothing has reached
 *  the KHEL-O team yet, so this must not read like "we're reviewing it". */
export function DraftApplicationView({ cafeName = 'Your café', step }: DraftApplicationViewProps) {
  const total = ONBOARDING_STEP_TITLES.length;
  const current = Math.min(Math.max(Math.round(step || 1), 1), total);

  return (
    <div className="max-w-2xl mx-auto py-12 px-4 flex flex-col items-center text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-primary/10 text-primary mb-6 shadow-sm">
        <PenLine className="h-8 w-8" aria-hidden />
      </div>

      <Badge variant="warning" size="md" className="mb-4">
        Not submitted yet
      </Badge>

      <h1 className="font-heading text-display text-text-primary mb-3">
        Finish your application
      </h1>

      <p className="text-body text-text-secondary leading-relaxed mb-8">
        <span className="font-semibold text-text-primary">{cafeName}</span> is saved at step {current} of {total}.
        We can only review it after you press <span className="font-semibold text-text-primary">Submit</span> on the last step.
      </p>

      <Card elevation="raised" className="w-full mb-8 text-left bg-surface border border-border/80">
        <CardContent className="p-6">
          <ol className="flex flex-col gap-3">
            {ONBOARDING_STEP_TITLES.map((title, i) => {
              const n = i + 1;
              const done = n < current;
              const here = n === current;
              return (
                <li key={title} className="flex items-center gap-3 text-caption">
                  {done ? (
                    <CheckCircle2 className="h-4 w-4 flex-shrink-0 text-emerald-500" aria-hidden />
                  ) : (
                    <Circle className={`h-4 w-4 flex-shrink-0 ${here ? 'text-primary' : 'text-text-tertiary'}`} aria-hidden />
                  )}
                  <span className={here ? 'font-semibold text-text-primary' : done ? 'text-text-secondary' : 'text-text-tertiary'}>
                    {n}. {title}
                    {here && <span className="ml-2 text-primary">You&apos;re here</span>}
                  </span>
                </li>
              );
            })}
          </ol>
        </CardContent>
      </Card>

      <div className="flex flex-col sm:flex-row items-center gap-3">
        <Link href="/owner/onboarding">
          <Button variant="primary" className="gap-2">
            <span>Continue application</span>
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Button>
        </Link>
        <Link href="/owner/support">
          <Button variant="secondary" className="gap-2">
            <LifeBuoy className="h-4 w-4" aria-hidden />
            <span>Get help</span>
          </Button>
        </Link>
      </div>
    </div>
  );
}
