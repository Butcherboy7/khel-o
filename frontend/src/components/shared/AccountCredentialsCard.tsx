'use client';

import { useState, type FormEvent } from 'react';
import { Mail, KeyRound, AlertCircle, CheckCircle2, Pencil } from 'lucide-react';
import { Card, CardContent, Button, Input } from '@/components/ui';
import { updateMe, changePassword } from '@/lib/api/auth';
import { useAuthStore } from '@/store/authStore';
import { GoogleReauthButton } from '@/components/auth/GoogleReauthButton';

/**
 * Email + password self-service, shared by the gamer profile and owner
 * settings pages. Both `PATCH /auth/me` (email) and `POST /auth/change-password`
 * already existed on the backend and in lib/api/auth.ts with no UI anywhere
 * consuming them — this is that missing UI, not a new capability.
 */
export function AccountCredentialsCard() {
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);

  const [isEditingEmail, setIsEditingEmail] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [emailPassword, setEmailPassword] = useState('');
  const [googleIdToken, setGoogleIdToken] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [emailSuccess, setEmailSuccess] = useState(false);
  const [isSavingEmail, setIsSavingEmail] = useState(false);

  const [isEditingPassword, setIsEditingPassword] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState(false);
  const [isSavingPassword, setIsSavingPassword] = useState(false);

  const hasPassword = user?.hasPassword !== false; // Google-only accounts can't change-password

  function startEditEmail() {
    setEmailError(null);
    setEmailSuccess(false);
    setNewEmail(user?.email ?? '');
    setEmailPassword('');
    setGoogleIdToken(null);
    setIsEditingEmail(true);
  }

  async function handleEmailSubmit(e: FormEvent) {
    e.preventDefault();
    setEmailError(null);
    if (!hasPassword && !googleIdToken) {
      setEmailError('Verify with Google before saving.');
      return;
    }
    setIsSavingEmail(true);
    try {
      const res = await updateMe(
        hasPassword
          ? { email: newEmail, currentPassword: emailPassword }
          : { email: newEmail, googleIdToken: googleIdToken! },
      );
      setUser(res.user);
      setIsEditingEmail(false);
      setEmailSuccess(true);
    } catch (err: any) {
      setEmailError(err?.message || 'Failed to update email.');
      setGoogleIdToken(null);
    } finally {
      setIsSavingEmail(false);
    }
  }

  function startEditPassword() {
    setPasswordError(null);
    setPasswordSuccess(false);
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setIsEditingPassword(true);
  }

  async function handlePasswordSubmit(e: FormEvent) {
    e.preventDefault();
    setPasswordError(null);
    if (newPassword.length < 8) {
      setPasswordError('New password must be at least 8 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('New password and confirmation do not match.');
      return;
    }
    setIsSavingPassword(true);
    try {
      await changePassword(currentPassword, newPassword);
      setIsEditingPassword(false);
      setPasswordSuccess(true);
    } catch (err: any) {
      setPasswordError(err?.message || 'Failed to change password.');
    } finally {
      setIsSavingPassword(false);
    }
  }

  return (
    <Card elevation="resting" className="bg-surface border border-border">
      <CardContent className="p-4 sm:p-6 flex flex-col gap-6">
        <div className="flex items-start gap-3.5">
          <div className="h-11 w-11 sm:h-12 sm:w-12 rounded-2xl flex items-center justify-center shrink-0 bg-primary/10 text-primary border border-primary/20">
            <KeyRound className="h-6 w-6" />
          </div>
          <div className="flex flex-col gap-1">
            <h3 className="font-heading text-body font-bold text-text-primary">Login &amp; Security</h3>
            <p className="text-caption text-text-secondary max-w-md">
              The email and password you sign in with.
            </p>
          </div>
        </div>

        {/* Email */}
        <div className="flex flex-col gap-3 pt-2 border-t border-border">
          {!isEditingEmail ? (
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 min-w-0">
                <Mail className="h-4 w-4 text-text-secondary shrink-0" />
                <span className="text-caption text-text-primary truncate">{user?.email}</span>
              </div>
              <Button variant="secondary" size="sm" onClick={startEditEmail} className="gap-1.5 shrink-0">
                <Pencil className="h-3.5 w-3.5" />
                Change
              </Button>
            </div>
          ) : (
            <form onSubmit={handleEmailSubmit} className="flex flex-col gap-3">
              {emailError && (
                <div className="flex items-center gap-2 p-3 rounded-xl bg-error/10 border border-error/20 text-caption text-error">
                  <AlertCircle className="h-4 w-4 flex-shrink-0" />
                  <span>{emailError}</span>
                </div>
              )}
              <Input
                label="New email"
                type="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                required
              />
              {hasPassword ? (
                <Input
                  label="Current password *"
                  type="password"
                  placeholder="Confirm it's you"
                  value={emailPassword}
                  onChange={(e) => setEmailPassword(e.target.value)}
                  required
                />
              ) : googleIdToken ? (
                <div className="flex items-center gap-2 text-caption text-emerald-600">
                  <CheckCircle2 className="h-4 w-4" />
                  <span>Verified with Google.</span>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  <span className="text-caption text-text-secondary">
                    This account signs in with Google. Verify it&apos;s you to change your email.
                  </span>
                  <GoogleReauthButton onToken={setGoogleIdToken} />
                </div>
              )}
              <div className="flex items-center gap-2 self-end">
                <Button type="button" variant="ghost" size="sm" onClick={() => setIsEditingEmail(false)}>
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  isLoading={isSavingEmail}
                  loadingText="Saving…"
                  disabled={!hasPassword && !googleIdToken}
                >
                  Save email
                </Button>
              </div>
            </form>
          )}
          {emailSuccess && !isEditingEmail && (
            <div className="flex items-center gap-2 text-caption text-emerald-600">
              <CheckCircle2 className="h-4 w-4" />
              <span>Email updated.</span>
            </div>
          )}
        </div>

        {/* Password */}
        {hasPassword && (
          <div className="flex flex-col gap-3 pt-2 border-t border-border">
            {!isEditingPassword ? (
              <div className="flex items-center justify-between gap-3">
                <span className="text-caption text-text-secondary">Password</span>
                <Button variant="secondary" size="sm" onClick={startEditPassword} className="gap-1.5 shrink-0">
                  <Pencil className="h-3.5 w-3.5" />
                  Change
                </Button>
              </div>
            ) : (
              <form onSubmit={handlePasswordSubmit} className="flex flex-col gap-3">
                {passwordError && (
                  <div className="flex items-center gap-2 p-3 rounded-xl bg-error/10 border border-error/20 text-caption text-error">
                    <AlertCircle className="h-4 w-4 flex-shrink-0" />
                    <span>{passwordError}</span>
                  </div>
                )}
                <Input
                  label="Current password"
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  required
                />
                <Input
                  label="New password"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  minLength={8}
                  required
                />
                <Input
                  label="Confirm new password"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                />
                <div className="flex items-center gap-2 self-end">
                  <Button type="button" variant="ghost" size="sm" onClick={() => setIsEditingPassword(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" variant="primary" size="sm" isLoading={isSavingPassword} loadingText="Saving…">
                    Save password
                  </Button>
                </div>
              </form>
            )}
            {passwordSuccess && !isEditingPassword && (
              <div className="flex items-center gap-2 text-caption text-emerald-600">
                <CheckCircle2 className="h-4 w-4" />
                <span>Password updated.</span>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
