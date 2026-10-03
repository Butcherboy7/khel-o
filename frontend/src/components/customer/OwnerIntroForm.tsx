'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Button } from '@/components/ui';
import { GoogleSignInButton } from '@/components/auth/GoogleSignInButton';
import { useAuthStore } from '@/store/authStore';
import { getPublicEnv } from '@/lib/runtimeEnv';
import { isApiError } from '@/lib/api/errors';
import { createOwnerIntro, type OwnerRelation } from '@/lib/api/ownerIntros';
import { HelperEmblem } from '@/components/customer/HelperEmblem';

const RELATIONS: { key: OwnerRelation; label: string }[] = [
  { key: 'regular', label: 'I play there a lot 🎮' },
  { key: 'friend_family', label: 'Friend / family 🫂' },
  { key: 'work_there', label: 'I work there 💼' },
  { key: 'other', label: 'Other' },
];

const inputClass =
  'min-h-input w-full rounded-xl border border-border bg-card px-3 text-body text-text-primary placeholder:text-text-secondary/70 focus:border-primary focus:outline-none';

/** 10-digit Indian mobile (with or without +91), or any +country number. */
export function looksLikePhone(raw: string): boolean {
  const v = raw.trim();
  const digits = v.replace(/\D/g, '');
  if (digits.length === 10) return /^[6-9]/.test(digits);
  if (digits.length === 12 && digits.startsWith('91')) return /^91[6-9]/.test(digits);
  return v.startsWith('+') && digits.length >= 10 && digits.length <= 15;
}

interface OwnerIntroFormProps {
  /** From a lead café's page: the café is known, so only the owner is asked. */
  cafeId?: string;
  cafeName?: string;
  onDone?: () => void;
}

/**
 * "Know the owner? Introduce us 👀" — a player drops the owner's name and
 * number; it lands on the admin Leads page. Sign-in comes first so the
 * outreach team knows who to thank (and who to ask if the number is wrong).
 */
export function OwnerIntroForm({ cafeId, cafeName, onDone }: OwnerIntroFormProps) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const pathname = usePathname();
  const googleEnabled = Boolean(getPublicEnv('NEXT_PUBLIC_GOOGLE_CLIENT_ID'));

  const [cafe, setCafe] = useState('');
  const [area, setArea] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [ownerPhone, setOwnerPhone] = useState('');
  const [relation, setRelation] = useState<OwnerRelation | null>(null);
  const [note, setNote] = useState('');
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);

  const knownCafe = Boolean(cafeId);
  const phoneOk = looksLikePhone(ownerPhone);
  const ready =
    (knownCafe || cafe.trim().length >= 2) && ownerName.trim().length >= 2 && phoneOk && relation !== null && consent;

  if (sentTo) {
    return (
      <div className="flex flex-col items-center gap-3 py-4 text-center">
        <span className="text-[44px] leading-none" aria-hidden>🏆</span>
        <h2 className="font-heading text-h2 text-text-primary">You&apos;re the real MVP</h2>
        <p className="max-w-sm text-body text-text-secondary">
          We&apos;ll give {sentTo} a friendly call and keep it chill, no spam. If {cafeName ?? 'the café'} comes on board,
          that&apos;s on you. Thank you, fr 🫶
        </p>
        {onDone && (
          <Button variant="primary" size="lg" fullWidth onClick={onDone} className="mt-2">
            Done
          </Button>
        )}
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="flex flex-col gap-4 pb-2">
        <div className="flex flex-col gap-1">
          <h2 className="font-heading text-h2 text-text-primary">Know the owner? Introduce us 👀</h2>
          <p className="text-body text-text-secondary">
            Quick sign-in first, so we know who to thank (and who to ask if the number&apos;s off).
          </p>
        </div>
        {googleEnabled && <GoogleSignInButton onSuccess={() => setError(null)} onError={setError} />}
        {error && <p className="text-center text-caption text-error">{error}</p>}
        <Link
          href={`/login?redirect=${encodeURIComponent(pathname || '/')}`}
          className="mx-auto flex min-h-[44px] items-center text-caption font-semibold text-text-secondary hover:underline"
        >
          Sign in with email instead
        </Link>
      </div>
    );
  }

  const submit = async () => {
    if (!ready || sending || !relation) return;
    setSending(true);
    setError(null);
    try {
      await createOwnerIntro({
        cafeId,
        cafeName: knownCafe ? undefined : cafe.trim(),
        area: knownCafe ? undefined : area.trim() || undefined,
        ownerName: ownerName.trim(),
        ownerPhone: ownerPhone.trim(),
        relation,
        note: note.trim() || undefined,
        ownerConsent: consent,
      });
      setSentTo(ownerName.trim().split(/\s+/)[0]);
    } catch (e) {
      setError(isApiError(e) && e.status !== 0 && e.status < 500 ? e.message : "Couldn't send that just now. Try again?");
    } finally {
      setSending(false);
    }
  };

  return (
    <form
      className="flex flex-col gap-3 pb-2"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <div className="flex flex-col gap-1">
        <h2 className="font-heading text-h2 text-text-primary">
          {knownCafe ? `Know the owner of ${cafeName}? 👀` : 'Know a gaming café owner? 👀'}
        </h2>
        <p className="text-body text-text-secondary">
          Drop their number and we&apos;ll take it from here. A friendly intro gets a café listed way faster than us
          walking in cold.
        </p>
      </div>

      <div className="flex items-center gap-3 rounded-2xl bg-surface px-3.5 py-2.5">
        <HelperEmblem badge="matchmaker" size={36} />
        <span className="flex min-w-0 flex-col">
          <span className="text-caption font-semibold text-text-primary">Earn the Matchmaker badge · +100 XP</span>
          <span className="text-[11px] text-text-secondary">Once we&apos;ve reached the owner. If they join, you become a Local Legend (+500 XP).</span>
        </span>
      </div>

      {!knownCafe && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <input
            value={cafe}
            onChange={(e) => setCafe(e.target.value)}
            placeholder="Café name"
            aria-label="Café name"
            maxLength={160}
            className={inputClass}
          />
          <input
            value={area}
            onChange={(e) => setArea(e.target.value)}
            placeholder="Area (e.g. Kondapur)"
            aria-label="Area"
            maxLength={160}
            className={inputClass}
          />
        </div>
      )}

      <input
        value={ownerName}
        onChange={(e) => setOwnerName(e.target.value)}
        placeholder="Owner's name"
        aria-label="Owner's name"
        autoComplete="off"
        maxLength={120}
        className={inputClass}
      />
      <div className="flex flex-col gap-1">
        <input
          type="tel"
          inputMode="tel"
          value={ownerPhone}
          onChange={(e) => setOwnerPhone(e.target.value)}
          placeholder="Owner's phone (WhatsApp works best)"
          aria-label="Owner's phone number"
          autoComplete="off"
          maxLength={20}
          className={inputClass}
        />
        {ownerPhone.trim().length >= 6 && !phoneOk && (
          <p className="text-caption text-error">That number looks a bit off, mind checking it?</p>
        )}
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-caption font-semibold text-text-primary">How do you know them?</legend>
        <div className="flex flex-wrap gap-2">
          {RELATIONS.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              aria-pressed={relation === key}
              onClick={() => setRelation(key)}
              className={`min-h-[40px] rounded-full border px-3.5 text-caption font-semibold transition-colors ${
                relation === key
                  ? 'border-secondary bg-secondary text-white'
                  : 'border-border bg-card text-text-primary hover:bg-surface'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </fieldset>

      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Anything we should know? e.g. best time to call (optional)"
        aria-label="Note for our team (optional)"
        maxLength={500}
        rows={2}
        className={`${inputClass} py-2.5`}
      />

      <label className="flex min-h-[44px] cursor-pointer items-start gap-3 rounded-xl bg-surface px-3 py-2.5">
        <input
          type="checkbox"
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
          className="mt-0.5 h-5 w-5 flex-shrink-0 accent-primary"
        />
        <span className="text-caption text-text-primary">
          {ownerName.trim() ? ownerName.trim().split(/\s+/)[0] : 'The owner'} is cool with KHEL-O giving them a call
        </span>
      </label>

      {error && <p className="text-caption text-error">{error}</p>}
      <Button type="submit" variant="primary" size="lg" fullWidth disabled={!ready} isLoading={sending}>
        Send intro
      </Button>
    </form>
  );
}
