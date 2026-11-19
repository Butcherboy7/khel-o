'use client';

import { useState } from 'react';
import { BottomSheet, Button } from '@/components/ui';
import { createGta6Request, type Gta6Request, type Gta6RequestBody } from '@/lib/api/gta6Requests';

interface Gta6RequestSheetProps {
  isOpen: boolean;
  onClose: () => void;
  /** "No, something else": carry on to the normal booking. */
  onNotPlaying: () => void;
  /** The request was saved. */
  onSent: (request: Gta6Request) => void;
  /** "AdamsDen · PS5 Pro · Fri 20 Nov, 11 PM · 2 hr": what is being asked for. */
  summary: string;
  body: Omit<Gta6RequestBody, 'phone'>;
  /** The phone on the account, if any. */
  defaultPhone?: string | null;
}

/**
 * At checkout on a console that runs GTA 6, during the launch: "Are you playing GTA 6?".
 * Yes: due to high demand we confirm with the café first, so we save a request (the founder is told) and
 * the player then messages us on WhatsApp. No: back to the normal booking.
 */
export function Gta6RequestSheet({ isOpen, onClose, onNotPlaying, onSent, summary, body, defaultPhone }: Gta6RequestSheetProps) {
  const [step, setStep] = useState<'ask' | 'yes'>('ask');
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const close = () => {
    setStep('ask');
    setError(null);
    onClose();
  };

  const send = async () => {
    setBusy(true);
    setError(null);
    try {
      const request = await createGta6Request({ ...body, phone: defaultPhone ? undefined : phone.trim() || undefined });
      setStep('ask');
      onSent(request);
    } catch (e) {
      setError((e as Error)?.message || 'We could not send that. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <BottomSheet isOpen={isOpen} onClose={close} ariaLabel="Are you playing GTA 6?" title={step === 'ask' ? 'Are you playing GTA 6?' : 'High demand for GTA 6'}>
      <p className="text-caption text-text-secondary">{summary}</p>
      {step === 'ask' ? (
        <div className="mt-4 flex flex-col gap-2.5">
          <Button fullWidth size="lg" onClick={() => setStep('yes')}>
            Yes, GTA 6
          </Button>
          <Button fullWidth size="lg" variant="secondary" onClick={onNotPlaying}>
            No, something else
          </Button>
        </div>
      ) : (
        <div className="mt-3 flex flex-col gap-3">
          <p className="text-body text-text-primary">
            GTA 6 is in very high demand, so we check with the café that this slot is really free before you pay. Send us the request and
            message us on WhatsApp. When the café says yes, you get a notification and 15 minutes to pay.
          </p>
          {!defaultPhone && (
            <label className="block">
              <span className="text-caption font-semibold text-text-primary">Your mobile number</span>
              <input
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="98765 43210"
                className="mt-1 min-h-[48px] w-full rounded-xl border border-border bg-card px-3 text-body text-text-primary"
              />
            </label>
          )}
          {error && <p role="alert" className="rounded-xl bg-error/10 px-3 py-2 text-body text-error">{error}</p>}
          <Button fullWidth size="lg" onClick={send} disabled={busy || (!defaultPhone && phone.replace(/\D/g, '').length < 10)}>
            {busy ? 'Sending…' : 'Request this slot'}
          </Button>
          <button type="button" onClick={() => setStep('ask')} className="min-h-[44px] text-body font-semibold text-text-secondary">
            Back
          </button>
        </div>
      )}
    </BottomSheet>
  );
}
