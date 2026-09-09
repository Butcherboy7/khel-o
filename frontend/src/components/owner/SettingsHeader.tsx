'use client';

import { Badge } from '@/components/ui/Badge';
import { AlertTriangle, PauseCircle, CheckCircle2 } from 'lucide-react';

interface SettingsHeaderProps {
  isEmergencyMode: boolean;
  bookingsPaused: boolean;
  cafeName: string;
}

export function SettingsHeader({ isEmergencyMode, bookingsPaused, cafeName }: SettingsHeaderProps) {
  // The badge already carries a colour and a drawn icon; the emoji that used to
  // prefix each label was a third copy of the same signal, in a glyph set that
  // renders differently on every device.
  const getStatus = () => {
    if (isEmergencyMode) {
      return {
        label: 'Emergency mode',
        description: 'Nobody can book. Bookings already made are still valid.',
        variant: 'error' as const,
        icon: AlertTriangle,
      };
    }
    if (bookingsPaused) {
      return {
        label: 'Online booking paused',
        description: "Customers can't book in the app. You can still take walk-ins at the desk.",
        variant: 'warning' as const,
        icon: PauseCircle,
      };
    }
    return {
      label: 'Open',
      description: 'Your café is accepting bookings as normal.',
      variant: 'success' as const,
      icon: CheckCircle2,
    };
  };

  const status = getStatus();

  return (
    <div className="rounded-2xl bg-surface border border-border overflow-hidden shadow-sm">
      <div
        className={`p-4 sm:p-6 flex flex-col gap-3 transition-colors ${
          isEmergencyMode
            // No `animate-pulse` here: the whole panel throbbing behind its own
            // text made the copy harder to read the longer emergency mode stayed
            // on, and ignored prefers-reduced-motion. Colour, icon and label
            // already say it.
            ? 'bg-red-500/10 border-b border-red-500/20'
            : bookingsPaused
            ? 'bg-amber-500/10 border-b border-amber-500/20'
            : 'bg-emerald-500/5 border-b border-emerald-500/10'
        }`}
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className={`p-2.5 rounded-xl flex items-center justify-center shrink-0 ${
              isEmergencyMode
                ? 'bg-red-500/20 text-red-500'
                : bookingsPaused
                ? 'bg-amber-500/20 text-amber-500'
                : 'bg-emerald-500/20 text-emerald-500'
            }`}>
              <status.icon className="h-6 w-6" />
            </div>
            <div className="flex min-w-0 flex-col">
              <span className="font-heading text-h2 leading-tight text-text-primary">{cafeName}</span>
              <span className="text-caption text-text-secondary">Settings</span>
            </div>
          </div>

          <div className="self-start sm:self-auto">
            <Badge variant={status.variant} size="md" className="whitespace-nowrap">
              {status.label}
            </Badge>
          </div>
        </div>

        <p className="text-caption text-text-secondary pt-1 border-t border-border/40">
          {status.description}
        </p>
      </div>
    </div>
  );
}
