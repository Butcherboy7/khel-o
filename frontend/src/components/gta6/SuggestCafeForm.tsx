'use client';

import { useState } from 'react';
import { Check, Loader2 } from 'lucide-react';
import { useBotGuard } from '@/components/auth/BotGuard';
import { suggestCafe } from '@/lib/api/cafeSuggestions';
import { trackAction } from '@/lib/api/analyticsEvents';
import { isApiError } from '@/lib/api/errors';
import { COMMUNITY_URL } from '@/lib/challenge';

const field =
  'h-12 w-full rounded-xl border border-border bg-card px-4 text-base text-text-primary outline-none transition-colors placeholder:text-text-secondary focus:border-text-primary focus-visible:ring-2 focus-visible:ring-primary/40';

function errorText(err: unknown): string {
  if (isApiError(err)) return err.fieldErrors[0]?.message || err.message;
  return 'Something went wrong. Please try again.';
}

function Field({ id, label, hint, children }: { id: string; label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-body font-semibold text-text-primary">
        {label}
        {hint && <span className="ml-1.5 text-caption font-normal text-text-secondary">{hint}</span>}
      </label>
      {children}
    </div>
  );
}

/** Public, no account. `place` is the city this page is about (prefilled, editable). */
export function SuggestCafeForm({ place, source, cafe }: { place?: string; source: string; cafe?: string }) {
  const { guardFields, trap } = useBotGuard();
  const [cafeName, setCafeName] = useState(cafe ?? '');
  const [city, setCity] = useState(place && place !== 'India' ? place : '');
  const [mapsUrl, setMapsUrl] = useState('');
  const [cafePhone, setCafePhone] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setError(null);
    if (!cafeName.trim()) return setError('Tell us the café’s name.');
    if (!city.trim()) return setError('Which city is it in?');
    if (!name.trim()) return setError('Tell us your name.');
    if (phone.replace(/\D/g, '').length < 10) return setError('Enter your 10-digit mobile number so we can tell you when it is listed.');
    if (cafePhone.trim() && cafePhone.replace(/\D/g, '').length < 10) return setError('The café’s number needs 10 digits, or leave it empty.');
    setBusy(true);
    try {
      await suggestCafe({
        cafeName: cafeName.trim(),
        city: city.trim(),
        mapsUrl: mapsUrl.trim() || undefined,
        cafePhone: cafePhone.trim() || undefined,
        suggesterName: name.trim(),
        suggesterPhone: phone,
        source,
        ...(await guardFields()),
      });
      trackAction('cafe_suggested', { city: city.trim(), source, hasMaps: Boolean(mapsUrl.trim()), hasPhone: Boolean(cafePhone.trim()) });
      setDone(true);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <div role="status" className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-5">
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/15 text-text-primary">
          <Check className="h-5 w-5" aria-hidden />
        </span>
        <h3 className="font-heading text-h3 font-bold">Got it, thank you.</h3>
        <p className="text-body text-text-secondary">
          We’ll reach out to {cafeName.trim() || 'the café'} and message you the moment it is on KHEL-O. While you wait, the community is where the GTA 6 plans happen.
        </p>
        <a
          href={COMMUNITY_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="btn-depth inline-flex h-12 items-center justify-center rounded-xl bg-primary px-5 font-semibold text-white"
        >
          Join the WhatsApp community
        </a>
      </div>
    );
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5">
      {trap}
      <div className="flex flex-col gap-1">
        <h3 className="font-heading text-h3 font-bold text-balance">Don’t see your café? Tell us.</h3>
        <p className="text-body text-text-secondary">
          Share the café’s name and Google Maps link. We’ll contact them, ask them to get GTA 6 ready, and message you when they’re listed.
        </p>
      </div>

      <Field id="sc-cafe" label="Café name">
        <input id="sc-cafe" value={cafeName} onChange={(e) => setCafeName(e.target.value)} maxLength={120} autoComplete="off" placeholder="e.g. Pixel Den Gaming Lounge" className={field} />
      </Field>
      <Field id="sc-city" label="City">
        <input id="sc-city" value={city} onChange={(e) => setCity(e.target.value)} maxLength={80} autoComplete="address-level2" placeholder="e.g. Jaipur" className={field} />
      </Field>
      <Field id="sc-maps" label="Google Maps link" hint="Maps, then Share, then Copy link">
        <input id="sc-maps" value={mapsUrl} onChange={(e) => setMapsUrl(e.target.value)} maxLength={500} inputMode="url" autoComplete="off" placeholder="https://maps.app.goo.gl/…" className={field} />
      </Field>
      <Field id="sc-cafe-phone" label="Café’s phone number" hint="if you have it">
        <input id="sc-cafe-phone" value={cafePhone} onChange={(e) => setCafePhone(e.target.value.replace(/[^\d\s+-]/g, ''))} maxLength={16} inputMode="tel" autoComplete="off" placeholder="10-digit number" className={field} />
      </Field>

      <div className="flex flex-col gap-4 border-t border-border pt-4">
        <Field id="sc-name" label="Your name">
          <input id="sc-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} autoComplete="given-name" className={field} />
        </Field>
        <Field id="sc-phone" label="Your mobile number" hint="we’ll message you here">
          <input id="sc-phone" value={phone} onChange={(e) => setPhone(e.target.value.replace(/[^\d\s+-]/g, ''))} maxLength={16} inputMode="tel" autoComplete="tel-national" placeholder="10-digit number" className={field} />
        </Field>
      </div>

      {error && (
        <p role="alert" className="text-body font-medium text-error">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={busy}
        className="btn-depth inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-primary px-5 font-semibold text-white disabled:opacity-60"
      >
        {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
        {busy ? 'Sending…' : 'Send the café to KHEL-O'}
      </button>
      <p className="text-caption text-text-secondary">We only use your number to tell you about this café.</p>
    </form>
  );
}
