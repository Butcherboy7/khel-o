'use client';

import { Badge } from '@/components/ui/Badge';
import { AlertTriangle, PauseCircle, CheckCircle2 } from 'lucide-react';

interface SettingsHeaderProps {
  isEmergencyMode: boolean;
  bookingsPaused: boolean;
  cafeName: string;
}

export function SettingsHeader({ isEmergencyMode, bookingsPaused, cafeName }: SettingsHeaderProps) {
  const getStatus = () => {
    if (isEmergencyMode) {
      return {
        label: '⚠️ EMERGENCY MODE ACTIVE',
        description: 'No new bookings accepted. Existing bookings remain valid.',
        variant: 'error' as const,
        icon: AlertTriangle,
      };
    }
    if (bookingsPaused) {
      return {
        label: '⏸️ ONLINE BOOKINGS PAUSED',
        description: 'Customers cannot book online. Walk-ins accepted at desk.',
        variant: 'warning' as const,
        icon: PauseCircle,
      };
    }
    return {
      label: '🟢 ACCEPTING BOOKINGS',
      description: 'Café is operating normally and accepting new bookings.',
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
            ? 'bg-red-500/10 border-b border-red-500/20 animate-pulse'
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
            <div className="flex flex-col">
              <span className="font-heading text-h2 text-text-primary leading-tight">{cafeName}</span>
              <span className="text-caption text-text-secondary">Operational Control & Venue Settings</span>
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
