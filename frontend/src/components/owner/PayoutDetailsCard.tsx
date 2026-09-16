'use client';

import { useState, useEffect, type FormEvent } from 'react';
import { Landmark, AlertCircle, Pencil } from 'lucide-react';
import { Card, CardContent, Button, Input, Badge } from '@/components/ui';
import { getPayoutDestination, updatePayoutDestination } from '@/lib/api/owner';
import type { PayoutDestination } from '@/lib/api/owner';

export function PayoutDetailsCard() {
  const [destination, setDestination] = useState<PayoutDestination | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [currentPassword, setCurrentPassword] = useState('');
  const [upiVpa, setUpiVpa] = useState('');
  const [bankAccountNumber, setBankAccountNumber] = useState('');
  const [bankIfsc, setBankIfsc] = useState('');
  const [accountHolderName, setAccountHolderName] = useState('');

  function loadDestination() {
    setIsLoading(true);
    getPayoutDestination()
      .then((res) => setDestination(res.destination))
      .catch(() => setDestination(null))
      .finally(() => setIsLoading(false));
  }

  useEffect(() => {
    loadDestination();
  }, []);

  function startEdit() {
    setError(null);
    setCurrentPassword('');
    setUpiVpa(destination?.upiVpa ?? '');
    setBankAccountNumber('');
    setBankIfsc(destination?.bankIfsc ?? '');
    setAccountHolderName(destination?.accountHolderName ?? '');
    setIsEditing(true);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      const res = await updatePayoutDestination({
        currentPassword,
        upiVpa: upiVpa || null,
        bankAccountNumber: bankAccountNumber || undefined,
        bankIfsc: bankIfsc || undefined,
        accountHolderName: accountHolderName || undefined,
      });
      setDestination(res.destination);
      setIsEditing(false);
    } catch (err: any) {
      setError(err?.message || 'Failed to update payout details.');
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isLoading) {
    return (
      <Card elevation="resting" className="bg-surface border border-border">
        <CardContent className="p-6">
          <div className="animate-pulse h-16 rounded-xl bg-surface-hover" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card elevation="resting" className="bg-surface border border-border">
      <CardContent className="p-4 sm:p-6 flex flex-col gap-4">
        <div className="flex items-start gap-3.5">
          <div className="h-11 w-11 sm:h-12 sm:w-12 rounded-2xl flex items-center justify-center shrink-0 bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
            <Landmark className="h-6 w-6" />
          </div>
          <div className="flex flex-col gap-1.5 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-heading text-body font-bold text-text-primary">Payout Details</h3>
              {destination && <Badge variant="default" size="sm">On file</Badge>}
            </div>
            <p className="text-caption text-text-secondary max-w-md">
              The UPI ID or bank account KHEL-O sends your weekly payout to.
            </p>
          </div>
        </div>

        {!isEditing && (
          <>
            {destination ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-4 rounded-2xl bg-surface-hover border border-border/80 text-caption">
                <div>
                  <span className="text-xs text-text-tertiary block">UPI ID</span>
                  <span className="font-bold text-text-primary">{destination.upiVpa || '—'}</span>
                </div>
                <div>
                  <span className="text-xs text-text-tertiary block">Bank Account</span>
                  <span className="font-bold text-text-primary">{destination.bankAccountNumberMasked || '—'}</span>
                </div>
                <div>
                  <span className="text-xs text-text-tertiary block">Bank IFSC</span>
                  <span className="font-bold text-text-primary">{destination.bankIfsc || '—'}</span>
                </div>
                <div>
                  <span className="text-xs text-text-tertiary block">Last Updated</span>
                  <span className="font-bold text-text-primary">
                    {new Date(destination.updatedAt).toLocaleDateString()}
                  </span>
                </div>
              </div>
            ) : (
              <p className="text-caption text-text-secondary">No payout details on file yet.</p>
            )}
            <Button variant="secondary" onClick={startEdit} className="gap-2 self-start">
              <Pencil className="h-4 w-4" />
              {destination ? 'Edit payout details' : 'Add payout details'}
            </Button>
          </>
        )}

        {isEditing && (
          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            {error && (
              <div className="flex items-center gap-2 p-3 rounded-xl bg-error/10 border border-error/20 text-caption text-error">
                <AlertCircle className="h-4 w-4 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Input
                label="UPI ID"
                placeholder="yourname@okhdfcbank"
                value={upiVpa}
                onChange={(e) => setUpiVpa(e.target.value)}
              />
              <Input
                label="Account Holder Name"
                placeholder="As per bank records"
                value={accountHolderName}
                onChange={(e) => setAccountHolderName(e.target.value)}
              />
              <Input
                label="Bank Account Number"
                placeholder="Leave blank to keep unchanged"
                value={bankAccountNumber}
                onChange={(e) => setBankAccountNumber(e.target.value.replace(/\D/g, ''))}
              />
              <Input
                label="Bank IFSC Code"
                placeholder="HDFC0000128"
                value={bankIfsc}
                onChange={(e) => setBankIfsc(e.target.value.toUpperCase())}
                maxLength={11}
              />
              <Input
                label="Current Password *"
                type="password"
                placeholder="Confirm it's you"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                required
                className="sm:col-span-2"
              />
            </div>
            <div className="flex items-center gap-2 self-end">
              <Button type="button" variant="ghost" onClick={() => setIsEditing(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" isLoading={isSubmitting} loadingText="Saving…">
                Save payout details
              </Button>
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
