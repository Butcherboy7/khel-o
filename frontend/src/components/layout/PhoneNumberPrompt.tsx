'use client';

import { useEffect, useState } from 'react';
import { Check, MessageSquareText } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { updateMe } from '@/lib/api/auth';
import { trackAction } from '@/lib/api/analyticsEvents';
import { isPhoneAskSnoozed, snoozePhoneAsk } from '@/lib/homeBadges';

/**
 * Asks signed-in people with no phone number on file (Google sign-ins never
 * ask, and older accounts predate the field) for one, in context: a card on
 * the Drops tab and on Profile, never a pop-up at login. The Me tab carries a
 * red dot until it is saved. No OTP, no verification: a plain field saved via
 * PATCH /api/v1/auth/me. "Later" hides the card and the dot for 7 days.
 */
export function PhoneCaptureCard({ where, className }: { where: string; className?: string }) {
  const user = useAuthStore((s) => s.user);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const setUser = useAuthStore((s) => s.setUser);
  const [open, setOpen] = useState(false);
  const [phone, setPhone] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [hidden, setHidden] = useState(false);
  useEffect(() => setHidden(isPhoneAskSnoozed()), []);

  if (!isAuthenticated || !user || hidden) return null;
  if (user.phoneNumber && !saved) return null;
  if (saved) {
    return (
      <p role="status" className={`flex items-center gap-2 rounded-2xl border border-[#BFE5CD] bg-[#F2FBF5] p-3 text-caption font-semibold text-[#17693A] ${className ?? ''}`}>
        <Check className="h-4 w-4" aria-hidden /> Saved. We will text you when a drop opens.
      </p>
    );
  }

  const save = async () => {
    if (!/^[6-9]\d{9}$/.test(phone)) {
      setError('Enter a valid 10-digit Indian mobile number starting with 6-9.');
      return;
    }
    setError('');
    setSaving(true);
    try {
      const res = await updateMe({ phoneNumber: `+91 ${phone}` });
      setUser(res.user);
      setSaved(true);
      trackAction('phone_added', { where });
    } catch (err) {
      setError((err as { message?: string })?.message || 'Could not save. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={`rounded-2xl border border-[#F0D9A0] bg-[#FFF8E8] p-3.5 ${className ?? ''}`}>
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 flex-none items-center justify-center rounded-xl bg-[#FBEFD3] text-[#8A5A00]">
          <MessageSquareText className="h-4 w-4" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-body font-bold text-text-primary">Get a text when a drop opens</p>
          <p className="text-caption text-text-secondary">Only drops, challenges and your bookings. Reply STOP any time.</p>
        </div>
      </div>
      {open ? (
        <div className="mt-3">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-caption font-bold text-text-secondary">+91</span>
              <input
                type="tel"
                inputMode="numeric"
                autoFocus
                value={phone}
                maxLength={10}
                aria-label="10-digit mobile number"
                onChange={(e) => {
                  setPhone(e.target.value.replace(/\D/g, '').slice(0, 10));
                  setError('');
                }}
                placeholder="98765 43210"
                className="h-11 w-full rounded-xl border border-border bg-card pl-11 pr-3 font-data text-body text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </div>
            <button type="button" onClick={save} disabled={saving} className="h-11 rounded-xl bg-secondary px-4 text-caption font-bold text-white disabled:opacity-60">
              {saving ? 'Saving…' : 'Notify me'}
            </button>
          </div>
          {error && <p className="mt-1 text-caption text-error">{error}</p>}
        </div>
      ) : (
        <div className="mt-3 flex gap-2">
          <button type="button" onClick={() => setOpen(true)} className="h-11 flex-1 rounded-xl bg-secondary text-caption font-bold text-white">
            Add number
          </button>
          <button
            type="button"
            onClick={() => {
              snoozePhoneAsk();
              setHidden(true);
            }}
            className="h-11 rounded-xl border border-border bg-card px-4 text-caption font-bold text-text-primary"
          >
            Later
          </button>
        </div>
      )}
    </div>
  );
}
