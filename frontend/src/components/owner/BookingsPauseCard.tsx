'use client';

import { PauseCircle, PlayCircle, Info, CheckCircle2 } from 'lucide-react';
import { Button, Card, CardContent } from '@/components/ui';

interface BookingsPauseCardProps {
  bookingsPaused: boolean;
  onToggle: (value: boolean) => Promise<void>;
  isLoading: boolean;
}

export function BookingsPauseCard({ bookingsPaused, onToggle, isLoading }: BookingsPauseCardProps) {
  return (
    <Card
      elevation="resting"
      className={`bg-surface border transition-all ${
        bookingsPaused
          ? 'border-amber-500/50 ring-2 ring-amber-500/10'
          : 'border-border'
      }`}
    >
      <CardContent className="p-4 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div
              className={`h-11 w-11 sm:h-12 sm:w-12 rounded-2xl flex items-center justify-center shrink-0 ${
                bookingsPaused
                  ? 'bg-amber-500/20 text-amber-500'
                  : 'bg-surface-hover text-text-secondary border border-border'
              }`}
            >
              {bookingsPaused ? (
                <PauseCircle className="h-6 w-6" />
              ) : (
                <PlayCircle className="h-6 w-6" />
              )}
            </div>
            <div className="flex min-w-0 flex-col gap-1.5">
              <h3 className="font-heading text-body font-bold text-text-primary">
                Online booking
              </h3>
              <p className="max-w-prose text-caption text-text-secondary">
                Turn this off for a private event or a night you&apos;re already full. Walk-ins are
                not affected, and you can turn it back on any time.
              </p>
              {bookingsPaused ? (
                <div className="mt-2 flex items-center gap-2 rounded-xl border border-amber-500/20 bg-amber-500/10 p-2.5 sm:p-3">
                  <Info className="h-4 w-4 shrink-0 text-amber-600" aria-hidden="true" />
                  <span className="text-caption font-medium text-amber-700">
                    Off right now — customers can&apos;t book in the app.
                  </span>
                </div>
              ) : (
                <p className="mt-2 flex items-center gap-1.5 text-caption font-medium text-emerald-700">
                  <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
                  On right now — customers can book in the app.
                </p>
              )}
            </div>
          </div>

          <div className="flex w-full items-center justify-end border-t border-border pt-2 sm:w-auto sm:justify-start sm:border-t-0 sm:pt-0">
            {bookingsPaused ? (
              <Button
                variant="primary"
                onClick={() => onToggle(false)}
                isLoading={isLoading}
                className="w-full gap-2 sm:w-auto"
              >
                <PlayCircle className="h-4 w-4" aria-hidden="true" />
                Turn back on
              </Button>
            ) : (
              <Button
                variant="secondary"
                onClick={() => onToggle(true)}
                isLoading={isLoading}
                className="w-full gap-2 sm:w-auto"
              >
                <PauseCircle className="h-4 w-4" aria-hidden="true" />
                Turn off
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
