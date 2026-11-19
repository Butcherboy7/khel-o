'use client';

import { useState } from 'react';
import { BottomSheet, Button } from '@/components/ui';
import { createGta6Request, type Gta6Request, type Gta6RequestBody } from '@/lib/api/gta6Requests';

interface Gta6RequestSheetProps {
  isOpen: boolean;
  onClose: () => void;
  /** "ask": checkout asks "Are you playing GTA 6?" first. "direct": the GTA 6 page, they already said yes. */
  mode?: 'ask' | 'direct';
  /** The request was saved. */
  onSent: (request: Gta6Request) => void;
  /** "AdamsDen · PS5 Pro · Fri 20 Nov, 11 PM · 2 hr": what is being asked for. */
  summary: string;
  body: Omit<Gta6RequestBody, 'phone' | 'game'>;
  /** The phone on the account, if any. */
  defaultPhone?: string | null;
}

/**
 * At checkout on a console that runs GTA 6, during the launch: "Are you playing GTA 6?".
 * Either answer is a request while the launch switch is on: due to high demand we confirm with the café first
 * (the founder is told). Yes books GTA 6 at the GTA 6 price; No books the console for another game at the normal
 * price. The player then pays in full once the café says yes.
 */
export function Gta6RequestSheet({ isOpen, onClose, mode = 'ask', onSent, summary, body, defaultPhone }: Gta6RequestSheetProps) {
  const direct = mode === 'direct';
  const [step, setStep] = useState<'ask' | 'yes'>(direct ? 'yes' : 'ask');
  const [game, setGame] = useState<'gta6' | 'other'>('gta6');
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const close = () => {
    setStep(direct ? 'yes' : 'ask');
    setError(null);
    onClose();
  };

  const send = async () => {
    setBusy(true);
    setError(null);
    try {
      const request = await createGta6Request({ ...body, game, phone: defaultPhone ? undefined : phone.trim() || undefined });
      setStep(direct ? 'yes' : 'ask');
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
          <Button
            fullWidth
            size="lg"
            onClick={() => {
              setGame('gta6');
              setStep('yes');
            }}
          >
            Yes, GTA 6
          </Button>
          <Button
            fullWidth
            size="lg"
            variant="secondary"
            onClick={() => {
              setGame('other');
              setStep('yes');
            }}
          >
            No, something else
          </Button>
        </div>
      ) : (
        <div className="mt-3 flex flex-col gap-3">
          <p className="text-body text-text-primary">
            {game === 'gta6'
              ? 'GTA 6 is in very high demand right now. We confirm with the café that this slot is really free, in 5 to 10 minutes.'
              : 'The PS5 may not be available right now because of GTA 6. We will confirm with the café whether it is free at your time. Add your number and send the request.'}{' '}
            When they say yes, you get a message and 15 minutes to pay the full amount. Then it is booked.
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
          {(defaultPhone || phone.replace(/\D/g, '').length >= 10) && (
            <p className="rounded-xl bg-success/10 px-3 py-2 text-caption font-semibold text-text-primary">
              After you send this, message us on WhatsApp so we can confirm the seat with the café. It is not instant.
            </p>
          )}
          {error && <p role="alert" className="rounded-xl bg-error/10 px-3 py-2 text-body text-error">{error}</p>}
          <Button fullWidth size="lg" onClick={send} disabled={busy || (!defaultPhone && phone.replace(/\D/g, '').length < 10)}>
            {busy ? 'Sending…' : 'Ask for this slot'}
          </Button>
          <button type="button" onClick={() => (direct ? close() : setStep('ask'))} className="min-h-[44px] text-body font-semibold text-text-secondary">
            {direct ? 'Not now' : 'Back'}
          </button>
        </div>
      )}
    </BottomSheet>
  );
}
