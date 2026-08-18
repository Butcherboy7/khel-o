'use client';

import { PauseCircle, PlayCircle, Info } from 'lucide-react';
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
            <div className="flex flex-col gap-1.5">
              <h3 className="font-heading text-body font-bold text-text-primary">
                {bookingsPaused ? 'Online Bookings Paused' : 'Online Bookings Active'}
              </h3>
              <p className="text-caption text-text-secondary max-w-md">
                Temporarily stop accepting new online bookings. Useful for private events,
                busy peak hours, or inventory maintenance.
              </p>
              {bookingsPaused ? (
                <div className="mt-2 p-2.5 sm:p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center gap-2">
                  <Info className="h-4 w-4 text-amber-500 shrink-0" />
                  <span className="text-caption text-amber-600 font-medium">
                    PAUSED — Customers cannot book online
                  </span>
                </div>
              ) : (
                <p className="text-caption text-emerald-600 font-medium mt-2 flex items-center gap-1.5">
                  <span>✅</span> Customers can book through KHEL app
                </p>
              )}
            </div>
          </div>

          <div className="w-full sm:w-auto flex items-center justify-end sm:justify-start pt-2 sm:pt-0 border-t sm:border-t-0 border-border">
            {bookingsPaused ? (
              <Button
                variant="primary"
                onClick={() => onToggle(false)}
                isLoading={isLoading}
                className="w-full sm:w-auto gap-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold"
              >
                <PlayCircle className="h-4 w-4" />
                Resume Bookings
              </Button>
            ) : (
              <Button
                variant="outline"
                onClick={() => onToggle(true)}
                isLoading={isLoading}
                className="w-full sm:w-auto gap-2 border-amber-500 text-amber-600 hover:bg-amber-500/10"
              >
                <PauseCircle className="h-4 w-4" />
                Pause Bookings
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
