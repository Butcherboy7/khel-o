'use client';

import { useEffect, useState } from 'react';
import { BellRing, BellOff, Smartphone, AlertCircle } from 'lucide-react';
import { Card, Button } from '@/components/ui';
import {
  enablePush,
  disablePush,
  resolvePushState,
  resyncPushSubscription,
  type PushState,
} from '@/lib/alerts/subscribe';

export function EnableAlertsCard() {
  const [state, setState] = useState<PushState>('unsupported');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    resolvePushState().then((resolved) => {
      if (!cancelled) setState(resolved);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    // Heal the case where the browser subscription is alive but the server
    // row was pruned (e.g. after a 410). The endpoint is an idempotent
    // upsert, so re-posting on every mount with a confirmed live
    // subscription is harmless.
    if (state !== 'granted') return;
    resyncPushSubscription().catch(() => {
      // Best-effort; a real failure here surfaces the next time a push is
      // attempted and getPushState/resolvePushState re-checks.
    });
  }, [state]);

  const handleEnable = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await enablePush();
      if (result === 'granted') setState('granted');
      else if (result === 'denied') setState('denied');
      else if (result === 'unconfigured') {
        setError('Alerts are not switched on for this server yet. Contact KHEL-O support.');
      } else setError('This browser cannot receive alerts.');
    } catch {
      setError('Could not turn on alerts. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const handleDisable = async () => {
    setBusy(true);
    try {
      await disablePush();
      setState(await resolvePushState());
    } finally {
      setBusy(false);
    }
  };

  if (state === 'unsupported') return null;

  return (
    <Card elevation="raised" className="border border-border bg-card p-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3.5">
          <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            {state === 'granted' ? <BellRing className="h-6 w-6" /> : <BellOff className="h-6 w-6" />}
          </div>
          <div className="min-w-0">
            <h2 className="font-heading text-h3 text-text-primary">
              {state === 'granted' ? 'Booking alerts are on' : 'Get alerted the moment a booking lands'}
            </h2>
            <p className="mt-0.5 max-w-prose text-caption text-text-secondary">
              {state === 'granted' &&
                'This device will chime and show a notification for new bookings and cancellations.'}
              {state === 'default' &&
                'Your browser will ask for permission. Keep this tab open at the counter to hear the chime.'}
              {state === 'denied' &&
                'Notifications are blocked for KHEL-O in this browser. Turn them back on in your browser\'s site settings, then reload this page.'}
              {state === 'needs-install' &&
                'On iPhone, tap Share then "Add to Home Screen", open KHEL-O from that icon, and come back here to switch alerts on.'}
            </p>
            {error && (
              <p className="mt-2 flex items-center gap-1.5 text-caption text-error">
                <AlertCircle className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
                <span>{error}</span>
              </p>
            )}
          </div>
        </div>

        <div className="flex-shrink-0">
          {state === 'default' && (
            <Button variant="primary" size="md" onClick={handleEnable} disabled={busy} className="gap-2">
              <BellRing className="h-5 w-5" aria-hidden="true" />
              <span>{busy ? 'Turning on…' : 'Turn on alerts'}</span>
            </Button>
          )}
          {state === 'granted' && (
            <Button variant="secondary" size="md" onClick={handleDisable} disabled={busy}>
              {busy ? 'Turning off…' : 'Turn off'}
            </Button>
          )}
          {state === 'needs-install' && (
            <Smartphone className="h-6 w-6 text-text-secondary" aria-hidden="true" />
          )}
        </div>
      </div>
    </Card>
  );
}
