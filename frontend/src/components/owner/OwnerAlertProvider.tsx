'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Bell, X } from 'lucide-react';
import { Button } from '@/components/ui';
import { shouldAlert } from '@/lib/alerts/dedupe';

const CHIME_SRC = '/sounds/booking-chime.mp3';
const CHIME_REPEAT_MS = 4000;
/** An empty café should not be left ringing all night if nobody acknowledges. */
const MAX_CHIME_REPEATS = 10;

interface AlertPayload {
  title: string;
  body: string;
  url: string;
  dedupeKey: string;
  type?: string;
}

export function OwnerAlertProvider({ children }: { children: React.ReactNode }) {
  const [alert, setAlert] = useState<AlertPayload | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const repeatTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const repeatCount = useRef(0);
  const queryClient = useQueryClient();

  // Browsers refuse to play audio until the page has had a user gesture. One
  // click anywhere in the owner shell is enough to prime it; without this the
  // very first booking of a session would be silent.
  useEffect(() => {
    const unlock = () => {
      const el = new Audio(CHIME_SRC);
      el.volume = 0;
      el.play().then(
        () => {
          el.pause();
          audioRef.current = new Audio(CHIME_SRC);
        },
        () => {
          /* asset missing or still blocked — OS notification still fires */
        }
      );
      document.removeEventListener('click', unlock);
    };
    document.addEventListener('click', unlock, { once: true });
    return () => document.removeEventListener('click', unlock);
  }, []);

  const stopChime = useCallback(() => {
    if (repeatTimer.current) {
      clearInterval(repeatTimer.current);
      repeatTimer.current = null;
    }
    repeatCount.current = 0;
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
  }, []);

  const startChime = useCallback(() => {
    const play = () => {
      const el = audioRef.current ?? new Audio(CHIME_SRC);
      audioRef.current = el;
      el.currentTime = 0;
      el.play().catch(() => {
        /* autoplay still blocked; the takeover card is the visual fallback */
      });
    };

    play();
    repeatCount.current = 1;
    repeatTimer.current = setInterval(() => {
      if (repeatCount.current >= MAX_CHIME_REPEATS) {
        stopChime();
        return;
      }
      repeatCount.current += 1;
      play();
    }, CHIME_REPEAT_MS);
  }, [stopChime]);

  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;

    const onMessage = (event: MessageEvent) => {
      if (event.data?.type !== 'KHELO_BOOKING_ALERT') return;
      const payload = event.data.payload as AlertPayload;
      if (!shouldAlert(payload.dedupeKey)) return;

      setAlert(payload);
      startChime();

      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      queryClient.invalidateQueries({ queryKey: ['unread-count'] });
      // Task 8's dashboard listens for this to pull fresh bookings immediately
      // rather than waiting out the remainder of its 60s poll.
      window.dispatchEvent(new CustomEvent('khelo:booking-alert'));
    };

    navigator.serviceWorker.addEventListener('message', onMessage);
    return () => navigator.serviceWorker.removeEventListener('message', onMessage);
  }, [queryClient, startChime]);

  useEffect(() => stopChime, [stopChime]);

  const dismiss = () => {
    stopChime();
    setAlert(null);
  };

  return (
    <>
      {children}
      {alert && (
        <div
          role="alertdialog"
          aria-live="assertive"
          aria-label={alert.title}
          className="fixed inset-0 z-[100] flex items-center justify-center bg-secondary/80 p-4 backdrop-blur-sm"
        >
          <div className="w-full max-w-md rounded-3xl border border-border bg-card p-8 text-center shadow-2xl">
            <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Bell className="h-8 w-8" aria-hidden="true" />
            </div>
            <h2 className="font-heading text-h2 text-text-primary">{alert.title}</h2>
            <p className="mt-2 text-body text-text-secondary">{alert.body}</p>
            <div className="mt-7 flex flex-col gap-2">
              <Button variant="primary" size="lg" fullWidth onClick={dismiss}>
                Got it
              </Button>
              <Button
                variant="ghost"
                size="md"
                fullWidth
                onClick={() => {
                  dismiss();
                  window.location.href = alert.url;
                }}
                className="gap-1.5"
              >
                <X className="h-4 w-4" aria-hidden="true" />
                <span>View booking</span>
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
