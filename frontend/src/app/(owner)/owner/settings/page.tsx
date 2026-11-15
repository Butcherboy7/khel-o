'use client';

import Link from 'next/link';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Clock, MapPin, AlertCircle, RefreshCw, Store, Sparkles, Gamepad2, ChevronRight, PauseCircle, Wallet, UserRound } from 'lucide-react';
import { SubTabs, SubTabPanel, useSubTab, type SubTab } from '@/components/ui/SubTabs';
import { Card, CardContent, Button, Skeleton } from '@/components/ui';
import { useAuthStore } from '@/store/authStore';
import { getOwnerSettings, toggleEmergencyMode, toggleBookingsPaused, type OwnerSettings } from '@/lib/api/settings';
import { OwnerPageHeader } from '@/components/owner/OwnerPageHeader';
import { InfoTip } from '@/components/shared/InfoTip';
import { INFO_TIPS } from '@/lib/ownerGuideCopy';
import { EmergencyModeCard } from '@/components/owner/EmergencyModeCard';
import { BookingsPauseCard } from '@/components/owner/BookingsPauseCard';
import { PayoutDetailsCard } from '@/components/owner/PayoutDetailsCard';
import { AccountCredentialsCard } from '@/components/shared/AccountCredentialsCard';
import { EditCafeModal, EDIT_CAFE_TABS, type EditCafeTab } from '@/components/owner/EditCafeModal';

type SettingsTab = 'cafe' | 'pause' | 'money' | 'account';
const SETTINGS_TABS: SubTab<SettingsTab>[] = [
  { key: 'cafe', label: 'Café', icon: Store },
  { key: 'pause', label: 'Pause', icon: PauseCircle },
  { key: 'money', label: 'Payouts', icon: Wallet },
  { key: 'account', label: 'Account', icon: UserRound },
];
// Quick Find (?qf=) and Tutorial targets → the tab that holds them.
const SETTINGS_REVEAL: Record<string, SettingsTab> = {
  'settings-stop': 'pause', pause: 'pause', emergency: 'pause', payout: 'money', login: 'account',
};

export default function OwnerSettingsPage() {
  const [tab, setTab] = useSubTab<SettingsTab>(['cafe', 'pause', 'money', 'account'], 'cafe', { reveal: SETTINGS_REVEAL });
  const router = useRouter();
  const activeRole = useAuthStore((s) => s.activeRole);

  const [settings, setSettings] = useState<OwnerSettings | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isTogglingEmergency, setIsTogglingEmergency] = useState(false);
  const [isTogglingPause, setIsTogglingPause] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editTab, setEditTab] = useState<EditCafeTab | undefined>(undefined);

  // Quick Find: ?edit=hours (or basic, location, amenities, games) opens the
  // editor on that tab once the settings have loaded.
  const searchParams = useSearchParams();
  const editParam = searchParams.get('edit');
  useEffect(() => {
    if (!settings || !editParam || !EDIT_CAFE_TABS.includes(editParam as EditCafeTab)) return;
    setEditTab(editParam as EditCafeTab);
    setIsEditModalOpen(true);
    const url = new URL(window.location.href);
    url.searchParams.delete('edit');
    window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}`);
  }, [settings, editParam]);

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
      const message = err instanceof Error ? err.message : 'Couldn’t load settings. Please try again.';
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
      const message = err instanceof Error ? err.message : 'Couldn’t change emergency mode. Please try again.';
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
      const message = err instanceof Error ? err.message : 'Couldn’t change that. Please try again.';
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
        <p className="text-body text-text-secondary">We couldn’t find a café on this account. Contact KHEL-O support.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Header with Live Status */}
      <OwnerPageHeader
        guide="settings"
        title="Café settings"
        description={
          settings.isEmergencyMode
            ? 'Closed: nobody can book right now.'
            : settings.bookingsPaused
            ? 'Online bookings are paused. Walk-ins still work.'
            : `${settings.cafeName} is open for bookings.`
        }
      />

      {error && (
        <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-600 text-caption flex items-center gap-2">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* One job per tab: as one page this was two phone screens of switches and forms. */}
      <SubTabs tabs={SETTINGS_TABS} value={tab} onChange={setTab} label="Settings sections" idPrefix="settings" />

      {tab === 'cafe' && (
      <SubTabPanel idPrefix="settings" tab="cafe">
      {/* Your café, as a list: each row says what's set now and opens straight to its edit tab. */}
      <section className="flex flex-col gap-2" aria-label="Your café">
        <Card elevation="resting">
          <CardContent className="p-0">
            <ul className="divide-y divide-border">
              {([
                ['basic', Store, 'Name and phone', `${settings.cafeName} · ${settings.phoneNumber || 'no phone'}`],
                ['location', MapPin, 'Address and map pin', `${settings.addressLine1}, ${settings.city}`],
                ['hours', Clock, 'Opening hours', settings.openingTime && settings.closingTime
                ? settings.openingTime.slice(0, 5) === settings.closingTime.slice(0, 5)
                  ? 'Open 24 hours'
                  : `${settings.openingTime.slice(0, 5)} – ${settings.closingTime.slice(0, 5)}`
                : 'Not set'],
                ['amenities', Sparkles, 'Amenities and photos', settings.amenities?.length ? settings.amenities.slice(0, 3).join(', ') + (settings.amenities.length > 3 ? ` +${settings.amenities.length - 3}` : '') : 'None added'],
                ['games', Gamepad2, 'Games you have', 'What players can play here'],
              ] as const).map(([tab, Icon, label, value]) => (
                <li key={tab}>
                  <button
                    type="button"
                    onClick={() => {
                      setEditTab(tab);
                      setIsEditModalOpen(true);
                    }}
                    className="flex min-h-[60px] w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
                  >
                    <span className="flex h-9 w-9 flex-none items-center justify-center rounded-xl bg-surface text-text-secondary">
                      <Icon className="h-[18px] w-[18px]" aria-hidden="true" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold text-text-primary">{label}</span>
                      <span className="block truncate text-caption text-text-secondary">{value}</span>
                    </span>
                    <ChevronRight className="h-4 w-4 flex-none text-text-secondary" aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </section>
      </SubTabPanel>
      )}

      {tab === 'pause' && (
      <SubTabPanel idPrefix="settings" tab="pause">
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1" data-tour="settings-stop">
          <h2 className="flex items-center gap-1 font-heading text-h3 font-bold text-text-primary">
            Stop taking bookings
            <InfoTip text={INFO_TIPS.settingsStopBookings} label="About pausing and emergency mode" />
          </h2>
        </div>

        <div data-qf="pause">
          <BookingsPauseCard
            bookingsPaused={settings.bookingsPaused}
            onToggle={handlePauseToggle}
            isLoading={isTogglingPause}
          />
          <div data-qf="emergency">
          <EmergencyModeCard
            isEmergencyMode={settings.isEmergencyMode}
            onToggle={handleEmergencyToggle}
            isLoading={isTogglingEmergency}
          />
        </div>

      </div>
      </div>
      </SubTabPanel>
      )}

      {tab === 'money' && (
      <SubTabPanel idPrefix="settings" tab="money">
      <div className="flex flex-col gap-2" data-qf="payout">
        {/* Sits below the pause/emergency controls now, so its own loading
            growth can only move the login card, never a bookings switch. */}
        <PayoutDetailsCard />
      </div>
      </SubTabPanel>
      )}

      {tab === 'account' && (
      <SubTabPanel idPrefix="settings" tab="account">
      {/* Section 1a: Login & Security */}
      <div className="flex flex-col gap-2" data-qf="login">
        <AccountCredentialsCard />
      </div>

      {/* "Danger Zone" framing plus a red-bordered card promised a control that
          does not exist yet — its only button was a disabled "Coming Soon". A
          first-time owner reads the alarm and finds nothing to act on. Stated as
          a plain closing note instead, with the actual next step: talk to us. */}
      <div className="flex flex-col gap-2 border-t border-border pt-6">
        <h2 className="font-heading text-body-emphasis font-bold text-text-primary">Leaving KHEL-O</h2>
        <p className="max-w-prose text-caption text-text-secondary">
          To take your café off KHEL-O for good, email{' '}
          <a
            href="mailto:support@khel-o.com"
            className="whitespace-nowrap font-semibold text-primary underline underline-offset-2"
          >
            support@khel-o.com
          </a>
          . Just need a break? Use the Pause tab instead.
        </p>
        <p className="max-w-prose text-caption text-text-secondary">
          To close your KHEL-O account as well, use{' '}
          <Link
            href="/delete-account"
            className="inline-block py-2 font-semibold text-primary underline underline-offset-2"
          >
            Delete account
          </Link>
          . We settle any payout you&apos;re owed first.
        </p>
      </div>
      </SubTabPanel>
      )}

      {settings && (
        <EditCafeModal
          isOpen={isEditModalOpen}
          onClose={() => setIsEditModalOpen(false)}
          initialTab={editTab}
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
