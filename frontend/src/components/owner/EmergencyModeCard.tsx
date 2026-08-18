'use client';

import { useState } from 'react';
import { AlertTriangle, ShieldAlert } from 'lucide-react';
import { Button, Card, CardContent } from '@/components/ui';

interface EmergencyModeCardProps {
  isEmergencyMode: boolean;
  onToggle: (value: boolean) => Promise<void>;
  isLoading: boolean;
}

export function EmergencyModeCard({ isEmergencyMode, onToggle, isLoading }: EmergencyModeCardProps) {
  const [showConfirm, setShowConfirm] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  const handleToggle = async () => {
    if (!isEmergencyMode && !showConfirm) {
      // Enabling: show confirmation dialog first
      setShowConfirm(true);
      return;
    }

    setIsProcessing(true);
    try {
      await onToggle(!isEmergencyMode);
      setShowConfirm(false);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCancel = () => {
    setShowConfirm(false);
  };

  return (
    <Card
      elevation="resting"
      className={`bg-surface border transition-all ${
        isEmergencyMode
          ? 'border-red-500/50 ring-2 ring-red-500/20'
          : 'border-border'
      }`}
    >
      <CardContent className="p-4 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div
              className={`h-11 w-11 sm:h-12 sm:w-12 rounded-2xl flex items-center justify-center shrink-0 ${
                isEmergencyMode
                  ? 'bg-red-500/20 text-red-500'
                  : 'bg-surface-hover text-text-secondary border border-border'
              }`}
            >
              <ShieldAlert className="h-6 w-6" />
            </div>
            <div className="flex flex-col gap-1.5">
              <h3 className="font-heading text-body font-bold text-text-primary">
                Emergency Mode
              </h3>
              <p className="text-caption text-text-secondary max-w-md">
                Immediately stop ALL new bookings across all channels. Use only for genuine emergencies
                (power outage, safety issue, critical hardware failure).
              </p>
              {isEmergencyMode && (
                <div className="mt-2 p-2.5 sm:p-3 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-red-500 shrink-0" />
                  <span className="text-caption text-red-600 font-medium">
                    ACTIVE — No new bookings accepted
                  </span>
                </div>
              )}
            </div>
          </div>

          <div className="w-full sm:w-auto flex items-center justify-end sm:justify-start pt-2 sm:pt-0 border-t sm:border-t-0 border-border">
            {isEmergencyMode ? (
              <Button
                variant="outline"
                onClick={handleToggle}
                isLoading={isProcessing || isLoading}
                disabled={isLoading}
                className="w-full sm:w-auto border-emerald-500 text-emerald-600 hover:bg-emerald-500/10"
              >
                Disable Emergency Mode
              </Button>
            ) : (
              <Button
                variant="destructive"
                onClick={handleToggle}
                isLoading={isProcessing || isLoading}
                disabled={isLoading}
                className="w-full sm:w-auto gap-2"
              >
                <AlertTriangle className="h-4 w-4" />
                Enable Emergency Mode
              </Button>
            )}
          </div>
        </div>

        {/* Confirmation Dialog Modal */}
        {showConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-xs">
            <Card elevation="raised" className="max-w-lg w-full bg-surface border border-red-500/40 shadow-2xl">
              <CardContent className="p-5 sm:p-6 flex flex-col gap-4">
                <div className="flex items-center justify-center pt-2">
                  <div className="h-16 w-16 rounded-full bg-red-500/20 flex items-center justify-center animate-pulse">
                    <AlertTriangle className="h-8 w-8 text-red-500" />
                  </div>
                </div>

                <div className="text-center">
                  <h3 className="font-heading text-h2 text-text-primary">Enable Emergency Mode?</h3>
                  <p className="text-body text-text-secondary mt-1">
                    This will IMMEDIATELY stop all new online bookings.
                  </p>
                </div>

                <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-caption text-text-secondary">
                  <ul className="flex flex-col gap-2">
                    <li className="flex items-center gap-2">
                      <span className="text-red-500 font-bold">•</span>
                      <span>Customers will see venue as &quot;temporarily unavailable&quot;</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <span className="text-red-500 font-bold">•</span>
                      <span>Existing booked sessions remain active</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <span className="text-red-500 font-bold">•</span>
                      <span>Walk-ins may still be processed manually at desk</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <span className="text-red-500 font-bold">•</span>
                      <span>You can disable Emergency Mode at any time</span>
                    </li>
                  </ul>
                </div>

                <div className="flex flex-col-reverse sm:flex-row items-center justify-end gap-3 pt-2">
                  <Button variant="ghost" onClick={handleCancel} className="w-full sm:w-auto">
                    Cancel
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={handleToggle}
                    isLoading={isProcessing}
                    className="w-full sm:w-auto gap-2"
                  >
                    <AlertTriangle className="h-4 w-4" />
                    Yes, Enable Emergency Mode
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
