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
            <div className="flex min-w-0 flex-col gap-1.5">
              <h3 className="font-heading text-body font-bold text-text-primary">
                Emergency: shut everything down
              </h3>
              <p className="max-w-prose text-caption text-text-secondary">
                Stops every new booking at once — app and desk. For a power cut, a safety problem, or
                broken hardware. For an ordinary busy night, turn off online booking below instead.
              </p>
              {isEmergencyMode && (
                <div className="mt-2 flex items-center gap-2 rounded-xl border border-red-500/20 bg-red-500/10 p-2.5 sm:p-3">
                  <AlertTriangle className="h-4 w-4 shrink-0 text-red-600" aria-hidden="true" />
                  <span className="text-caption font-medium text-red-700">
                    On right now — nobody can book.
                  </span>
                </div>
              )}
            </div>
          </div>

          <div className="flex w-full items-center justify-end border-t border-border pt-2 sm:w-auto sm:justify-start sm:border-t-0 sm:pt-0">
            {isEmergencyMode ? (
              // Turning it back off is the recovery path, so this one IS the
              // filled button — it's what the owner is looking for.
              <Button
                variant="primary"
                onClick={handleToggle}
                isLoading={isProcessing || isLoading}
                disabled={isLoading}
                className="w-full sm:w-auto"
              >
                Reopen the café
              </Button>
            ) : (
              // Outline, not a filled red slab. This is the rarest and most
              // destructive control in the portal; making it the loudest thing
              // on the settings screen invited a first-time owner to press it.
              <Button
                variant="destructive-outline"
                onClick={handleToggle}
                isLoading={isProcessing || isLoading}
                disabled={isLoading}
                className="w-full gap-2 sm:w-auto"
              >
                <AlertTriangle className="h-4 w-4" aria-hidden="true" />
                Shut down bookings
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
                  {/* No `animate-pulse`: a throbbing icon adds urgency to a
                      decision that needs the opposite — a moment to read. */}
                  <div className="flex h-16 w-16 items-center justify-center rounded-full bg-red-500/15">
                    <AlertTriangle className="h-8 w-8 text-red-600" aria-hidden="true" />
                  </div>
                </div>

                <div className="text-center">
                  <h3 className="font-heading text-h2 text-text-primary">Shut down bookings?</h3>
                  <p className="mt-1 text-body text-text-secondary">
                    Nobody will be able to book from the moment you confirm.
                  </p>
                </div>

                <div className="rounded-xl border border-border bg-surface p-4 text-caption text-text-secondary">
                  <ul className="flex flex-col gap-2">
                    <li className="flex gap-2">
                      <span className="font-bold text-red-600" aria-hidden="true">•</span>
                      <span>Your café shows as temporarily closed in the app.</span>
                    </li>
                    <li className="flex gap-2">
                      <span className="font-bold text-red-600" aria-hidden="true">•</span>
                      <span>People who already booked keep their session.</span>
                    </li>
                    <li className="flex gap-2">
                      <span className="font-bold text-red-600" aria-hidden="true">•</span>
                      <span>You can still take walk-ins at the desk.</span>
                    </li>
                    <li className="flex gap-2">
                      <span className="font-bold text-red-600" aria-hidden="true">•</span>
                      <span>You can undo this whenever you like.</span>
                    </li>
                  </ul>
                </div>

                <div className="flex flex-col-reverse items-center justify-end gap-3 pt-2 sm:flex-row">
                  <Button variant="ghost" onClick={handleCancel} className="w-full sm:w-auto">
                    Cancel
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={handleToggle}
                    isLoading={isProcessing}
                    loadingText="Shutting down"
                    className="w-full gap-2 sm:w-auto"
                  >
                    <AlertTriangle className="h-4 w-4" aria-hidden="true" />
                    Yes, shut down
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
