'use client';

import { useEffect, useState } from 'react';
import { Phone } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { updateMe } from '@/lib/api/auth';
import { Modal, Button } from '@/components/ui';

const SESSION_DISMISS_KEY = 'khelo_phone_prompt_dismissed';

/**
 * One-time-per-session nudge to collect a phone number for any signed-in
 * user who doesn't have one on file — chiefly Google sign-ins, which never
 * ask for a phone at all, and older accounts from before phone was required
 * at registration. No OTP, no verification: just a plain field, saved via
 * PATCH /api/v1/auth/me. Skippable; reappears next session if still empty.
 */
export function PhoneNumberPrompt() {
  const user = useAuthStore((s) => s.user);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const setUser = useAuthStore((s) => s.setUser);

  const [isOpen, setIsOpen] = useState(false);
  const [phoneNumber, setPhoneNumber] = useState('');
  const [error, setError] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!isAuthenticated || !user || user.phoneNumber) return;
    if (sessionStorage.getItem(SESSION_DISMISS_KEY)) return;
    setIsOpen(true);
  }, [isAuthenticated, user]);

  const handleSkip = () => {
    sessionStorage.setItem(SESSION_DISMISS_KEY, '1');
    setIsOpen(false);
  };

  const handlePhoneChange = (val: string) => {
    setPhoneNumber(val.replace(/\D/g, '').slice(0, 10));
    setError('');
  };

  const handleSubmit = async () => {
    if (!/^[6-9]\d{9}$/.test(phoneNumber)) {
      setError('Enter a valid 10-digit Indian mobile number starting with 6-9.');
      return;
    }
    setError('');
    setIsSaving(true);
    try {
      const res = await updateMe({ phoneNumber: `+91 ${phoneNumber}` });
      setUser(res.user);
      setIsOpen(false);
    } catch (err: any) {
      setError(err?.message || 'Failed to save. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleSkip}
      title="Add your phone number"
      footer={
        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" onClick={handleSkip}>
            Maybe later
          </Button>
          <Button variant="primary" onClick={handleSubmit} isLoading={isSaving} loadingText="Saving…">
            Save
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex items-start gap-3">
          <div className="h-10 w-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center flex-shrink-0">
            <Phone className="h-5 w-5" />
          </div>
          <p className="text-caption text-text-secondary">
            Get booking reminders and offers on your phone. No OTP needed — we just save the number.
          </p>
        </div>

        <div>
          <label className="text-caption font-semibold text-text-secondary mb-1 block">
            10-Digit Mobile Number (India)
          </label>
          <div className="relative flex items-center">
            <span className="absolute left-3.5 text-caption font-bold text-text-secondary">+91</span>
            <input
              type="text"
              value={phoneNumber}
              maxLength={10}
              autoFocus
              onChange={(e) => handlePhoneChange(e.target.value)}
              placeholder="9876543210"
              className="w-full rounded-xl border border-border bg-surface pl-12 pr-3.5 py-2 font-data text-body text-text-primary focus:ring-2 focus:ring-primary/40 focus:outline-none"
            />
          </div>
          {error && <p className="text-caption text-error mt-1">{error}</p>}
        </div>
      </div>
    </Modal>
  );
}
