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
  const user = useAuthStore((s) => s.user);
  const activeRole = useAuthStore((s) => s.activeRole);

  const [settings, setSettings] = useState<OwnerSettings | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isTogglingEmergency, setIsTogglingEmergency] = useState(false);
  const [isTogglingPause, setIsTogglingPause] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);

  // Staff role guard — Staff cannot access Café Settings
  useEffect(() => {
    if (user?.role === 'staff' || activeRole === 'staff') {
      router.push('/owner/dashboard');
    }
  }, [user, activeRole, router]);

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
  if (user?.role === 'staff' || activeRole === 'staff') {
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
    <div className="flex flex-col gap-6 sm:gap-8 pb-12 max-w-5xl mx-auto">
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
        <div className="flex items-center gap-2 border-b border-border pb-2.5">
          <SettingsIcon className="h-5 w-5 text-primary" />
          <h2 className="font-heading text-h2 text-text-primary">Operational Controls</h2>
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
        <div className="flex items-center gap-2 border-b border-border pb-2.5">
          <SettingsIcon className="h-5 w-5 text-primary" />
          <h2 className="font-heading text-h2 text-text-primary">Payouts</h2>
        </div>
        <PayoutSetupCard />
      </div>

      {/* Section 2: Café Information (Read only) */}
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between border-b border-border pb-2.5">
          <div className="flex items-center gap-2">
            <MapPin className="h-5 w-5 text-primary" />
            <h2 className="font-heading text-h2 text-text-primary">Café Information</h2>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 text-xs sm:text-caption"
            onClick={() => setIsEditModalOpen(true)}
          >
            Edit Profile
          </Button>
        </div>

        <Card elevation="resting" className="bg-surface border border-border">
          <CardContent className="p-4 sm:p-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
              <div className="flex flex-col gap-1">
                <span className="text-caption text-text-tertiary">Café Name</span>
                <span className="text-body font-semibold text-text-primary">{settings.cafeName}</span>
              </div>

              <div className="flex flex-col gap-1">
                <span className="text-caption text-text-tertiary">Phone Number</span>
                <div className="flex items-center gap-1.5">
                  <Phone className="h-4 w-4 text-text-secondary" />
                  <span className="text-body text-text-primary">{settings.phoneNumber}</span>
                </div>
              </div>

              <div className="flex flex-col gap-1">
                <span className="text-caption text-text-tertiary">Address</span>
                <span className="text-body text-text-primary">
                  {settings.addressLine1}, {settings.city}, {settings.state} - {settings.pincode}
                </span>
              </div>

              <div className="flex flex-col gap-1">
                <span className="text-caption text-text-tertiary">Operating Hours</span>
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
                <span className="text-caption text-text-tertiary">Map Location</span>
                <span className="text-body text-text-primary">
                  {settings.latitude != null && settings.longitude != null
                    ? `${settings.latitude.toFixed(4)}, ${settings.longitude.toFixed(4)}`
                    : 'Not set'}
                </span>
              </div>
            </div>

            {settings.amenities && settings.amenities.length > 0 && (
              <div className="flex flex-col gap-1.5 mt-4 pt-4 border-t border-border">
                <span className="text-caption text-text-tertiary">Amenities</span>
                <div className="flex flex-wrap gap-1.5">
                  {settings.amenities.map((a) => (
                    <span key={a} className="text-[11px] font-semibold px-2 py-1 rounded-md bg-primary/10 text-primary">
                      {a}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Section 3: Danger Zone */}
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-2 border-b border-rose-500/30 pb-2.5">
          <AlertCircle className="h-5 w-5 text-rose-500" />
          <h2 className="font-heading text-h2 text-text-primary">Danger Zone</h2>
        </div>

        <Card elevation="resting" className="bg-surface border border-rose-500/30">
          <CardContent className="p-4 sm:p-6">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="flex flex-col gap-1">
                <h3 className="font-heading text-body font-bold text-text-primary">
                  Request Café Deactivation
                </h3>
                <p className="text-caption text-text-secondary max-w-lg">
                  Permanently remove this café from the KHEL platform. This action requires admin approval
                  and cannot be undone.
                </p>
              </div>
              <Button variant="ghost" disabled className="w-full sm:w-auto text-rose-500 border border-rose-500/30 opacity-70">
                Coming Soon
              </Button>
            </div>
          </CardContent>
        </Card>
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
