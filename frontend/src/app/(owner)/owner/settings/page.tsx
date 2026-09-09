'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Settings as SettingsIcon, Clock, MapPin, Phone, AlertCircle, RefreshCw } from 'lucide-react';
import { Card, CardContent, Button, Skeleton } from '@/components/ui';
import { useAuthStore } from '@/store/authStore';
import { getOwnerSettings, toggleEmergencyMode, toggleBookingsPaused, type OwnerSettings } from '@/lib/api/settings';
import { SettingsHeader } from '@/components/owner/SettingsHeader';
import { EmergencyModeCard } from '@/components/owner/EmergencyModeCard';
import { BookingsPauseCard } from '@/components/owner/BookingsPauseCard';
import { PayoutSetupCard } from '@/components/owner/PayoutSetupCard';
import { EditCafeModal } from '@/components/owner/EditCafeModal';

export default function OwnerSettingsPage() {
  const router = useRouter();
  const activeRole = useAuthStore((s) => s.activeRole);

  const [settings, setSettings] = useState<OwnerSettings | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isTogglingEmergency, setIsTogglingEmergency] = useState(false);
  const [isTogglingPause, setIsTogglingPause] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);

  // Staff role guard — Staff cannot access Café Settings. Gated on activeRole
  // alone: the legacy user.role single-value column can be stale (e.g. an
  // account originally invited as staff and later granted ownership) and was
  // wrongly bouncing a real owner out of their own settings page.
  useEffect(() => {
    if (activeRole === 'staff') {
      router.push('/owner/dashboard');
    }
  }, [activeRole, router]);

  const loadSettings = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await getOwnerSettings();
      if (res.cafe) {
        setSettings(res.cafe);
      } else {
        setError('Café settings data unavailable.');
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to load settings';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadSettings();
  }, []);

  const handleEmergencyToggle = async (value: boolean) => {
    setIsTogglingEmergency(true);
    setError(null);
    try {
      await toggleEmergencyMode(value);
      setSettings((prev) => (prev ? { ...prev, isEmergencyMode: value } : prev));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to toggle emergency mode';
      setError(message);
    } finally {
      setIsTogglingEmergency(false);
    }
  };

  const handlePauseToggle = async (value: boolean) => {
    setIsTogglingPause(true);
    setError(null);
    try {
      await toggleBookingsPaused(value);
      setSettings((prev) => (prev ? { ...prev, bookingsPaused: value } : prev));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to toggle bookings pause';
      setError(message);
    } finally {
      setIsTogglingPause(false);
    }
  };

  // If staff user, do not render page
  if (activeRole === 'staff') {
    return null;
  }

  if (isLoading) {
    return (
      <div className="flex flex-col gap-6 pb-12">
        <Skeleton className="h-28 w-full rounded-2xl" />
        <Skeleton className="h-40 w-full rounded-2xl" />
        <Skeleton className="h-40 w-full rounded-2xl" />
        <Skeleton className="h-48 w-full rounded-2xl" />
      </div>
    );
  }

  if (error && !settings) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-4 text-center px-4">
        <div className="h-14 w-14 rounded-full bg-rose-500/10 text-rose-500 flex items-center justify-center">
          <AlertCircle className="h-8 w-8" />
        </div>
        <p className="text-body text-text-secondary max-w-md">{error}</p>
        <Button variant="outline" onClick={loadSettings} className="gap-2">
          <RefreshCw className="h-4 w-4" />
          Retry
        </Button>
      </div>
    );
  }

  if (!settings) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px]">
        <p className="text-body text-text-secondary">No café configuration found for this account.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 sm:gap-8">
      {/* Header with Live Status */}
      <SettingsHeader
        isEmergencyMode={settings.isEmergencyMode}
        bookingsPaused={settings.bookingsPaused}
        cafeName={settings.cafeName}
      />

      {error && (
        <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-600 text-caption flex items-center gap-2">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Section 1: Operational Controls */}
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1 border-b border-border pb-2.5">
          <h2 className="font-heading text-h2 text-text-primary">Stop taking bookings</h2>
          <p className="text-caption text-text-secondary">
            Two ways to close the doors: pause online bookings for a busy evening, or shut everything
            down in a real emergency.
          </p>
        </div>

        <EmergencyModeCard
          isEmergencyMode={settings.isEmergencyMode}
          onToggle={handleEmergencyToggle}
          isLoading={isTogglingEmergency}
        />

        <BookingsPauseCard
          bookingsPaused={settings.bookingsPaused}
          onToggle={handlePauseToggle}
          isLoading={isTogglingPause}
        />
      </div>

      {/* Section 1b: Payouts */}
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1 border-b border-border pb-2.5">
          <h2 className="font-heading text-h2 text-text-primary">Where your money goes</h2>
          <p className="text-caption text-text-secondary">
            The bank account KHEL-O sends your earnings to.
          </p>
        </div>
        {/* min-h reserves roughly the "account already set up" card's real
            height so PayoutSetupCard's own internal data fetch (which starts
            from a much shorter h-16 skeleton) doesn't grow the page under the
            controls below once it resolves — that growth previously shifted
            "Edit Profile" down far enough that a fast click landed on
            "Resume Bookings" instead, silently un-pausing live bookings. */}
        <div className="min-h-[300px] sm:min-h-[240px]">
          <PayoutSetupCard />
        </div>
      </div>

      {/* Section 2: Café Information (Read only) */}
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-border pb-2.5">
          <div className="flex flex-col gap-1">
            <h2 className="font-heading text-h2 text-text-primary">Your café details</h2>
            <p className="text-caption text-text-secondary">What customers see on your listing.</p>
          </div>
          <Button variant="secondary" size="sm" onClick={() => setIsEditModalOpen(true)}>
            Edit
          </Button>
        </div>

        <Card elevation="resting" className="bg-surface border border-border">
          <CardContent className="p-4 sm:p-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
              <div className="flex flex-col gap-1">
                <span className="text-caption text-text-secondary">What customers see it called</span>
                <span className="text-body font-semibold text-text-primary">{settings.cafeName}</span>
              </div>

              <div className="flex flex-col gap-1">
                <span className="text-caption text-text-secondary">Phone number</span>
                <div className="flex items-center gap-1.5">
                  <Phone className="h-4 w-4 text-text-secondary" />
                  <span className="text-body text-text-primary">{settings.phoneNumber}</span>
                </div>
              </div>

              <div className="flex flex-col gap-1">
                <span className="text-caption text-text-secondary">Address</span>
                <span className="text-body text-text-primary">
                  {settings.addressLine1}, {settings.city}, {settings.state} - {settings.pincode}
                </span>
              </div>

              <div className="flex flex-col gap-1">
                <span className="text-caption text-text-secondary">Open between</span>
                <div className="flex items-center gap-1.5">
                  <Clock className="h-4 w-4 text-text-secondary" />
                  <span className="text-body text-text-primary">
                    {settings.openingTime && settings.closingTime
                      ? `${settings.openingTime.slice(0, 5)} - ${settings.closingTime.slice(0, 5)}`
                      : 'Not set'}
                  </span>
                </div>
              </div>

              <div className="flex flex-col gap-1">
                <span className="text-caption text-text-secondary">Pin on the map</span>
                <span className="text-body text-text-primary">
                  {settings.latitude != null && settings.longitude != null
                    ? `${settings.latitude.toFixed(4)}, ${settings.longitude.toFixed(4)}`
                    : 'Not set'}
                </span>
              </div>
            </div>

            {settings.amenities && settings.amenities.length > 0 && (
              <div className="flex flex-col gap-1.5 mt-4 pt-4 border-t border-border">
                <span className="text-caption text-text-secondary">What you offer</span>
                <div className="flex flex-wrap gap-1.5">
                  {settings.amenities.map((a) => (
                    <span key={a} className="rounded-md bg-primary/10 px-2 py-1 text-caption font-semibold text-primary">
                      {a}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* "Danger Zone" framing plus a red-bordered card promised a control that
          does not exist yet — its only button was a disabled "Coming Soon". A
          first-time owner reads the alarm and finds nothing to act on. Stated as
          a plain closing note instead, with the actual next step: talk to us. */}
      <div className="flex flex-col gap-2 border-t border-border pt-6">
        <h2 className="font-heading text-h3 text-text-primary">Closing your café</h2>
        <p className="max-w-prose text-caption text-text-secondary">
          To take your café off KHEL-O for good, email{' '}
          <a
            href="mailto:support@khel-o.com"
            className="font-semibold text-primary underline underline-offset-2"
          >
            support@khel-o.com
          </a>
          . We&apos;ll confirm with you before anything is removed. If you just need a break, pause
          bookings above instead — that&apos;s reversible.
        </p>
      </div>

      {settings && (
        <EditCafeModal
          isOpen={isEditModalOpen}
          onClose={() => setIsEditModalOpen(false)}
          cafeId={settings.cafeId}
          settings={settings}
          onSaved={(updated) =>
            setSettings((prev) => (prev ? { ...prev, ...updated } : prev))
          }
        />
      )}
    </div>
  );
}
