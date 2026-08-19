'use client';

import { useState, useEffect, type FormEvent } from 'react';
import { Landmark, ShieldCheck, ShieldAlert, Clock, AlertCircle } from 'lucide-react';
import { Card, CardContent, Button, Input, Badge } from '@/components/ui';
import { getPayoutStatus, setupPayout } from '@/lib/api/owner';
import type { OwnerPayoutAccount } from '@/types';

export function PayoutSetupCard() {
  const [account, setAccount] = useState<OwnerPayoutAccount | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [businessPan, setBusinessPan] = useState('');
  const [bankAccountNumber, setBankAccountNumber] = useState('');
  const [bankIfsc, setBankIfsc] = useState('');
  const [accountHolderName, setAccountHolderName] = useState('');

  useEffect(() => {
    getPayoutStatus()
      .then((res) => setAccount(res.payoutAccount))
      .catch(() => setAccount(null))
      .finally(() => setIsLoading(false));
  }, []);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (businessPan.trim().length !== 10) {
      setError('Business PAN must be exactly 10 characters.');
      return;
    }
    if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(bankIfsc.toUpperCase())) {
      setError('Enter a valid 11-character Bank IFSC code (e.g. HDFC0000128).');
      return;
    }
    if (!/^\d{9,18}$/.test(bankAccountNumber)) {
      setError('Bank account number must be 9-18 digits.');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await setupPayout({
        businessPan: businessPan.toUpperCase(),
        bankAccountNumber,
        bankIfsc: bankIfsc.toUpperCase(),
        accountHolderName,
      });
      setAccount(res.payoutAccount);
    } catch (err: any) {
      setError(err?.message || 'Failed to save payout details.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <Card elevation="resting" className="bg-surface border border-border">
        <CardContent className="p-6">
          <div className="animate-pulse h-16 rounded-xl bg-surface-hover" />
        </CardContent>
      </Card>
    );
  }

  const kycActivated = account?.kycStatus === 'activated';

  return (
    <Card elevation="resting" className="bg-surface border border-border">
      <CardContent className="p-4 sm:p-6 flex flex-col gap-4">
        <div className="flex items-start gap-3.5">
          <div className="h-11 w-11 sm:h-12 sm:w-12 rounded-2xl flex items-center justify-center shrink-0 bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
            <Landmark className="h-6 w-6" />
          </div>
          <div className="flex flex-col gap-1.5 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-heading text-body font-bold text-text-primary">Direct Bank Payouts</h3>
              {account && (
                kycActivated ? (
                  <Badge variant="success" size="sm" className="gap-1"><ShieldCheck className="h-3 w-3" /> Verified</Badge>
                ) : account.kycStatus === 'rejected' ? (
                  <Badge variant="error" size="sm" className="gap-1"><ShieldAlert className="h-3 w-3" /> Rejected</Badge>
                ) : (
                  <Badge variant="warning" size="sm" className="gap-1"><Clock className="h-3 w-3" /> Pending Verification</Badge>
                )
              )}
            </div>
            <p className="text-caption text-text-secondary max-w-md">
              Add your bank details once to receive future booking payments directly via Razorpay Route,
              instead of manual settlement.
            </p>
          </div>
        </div>

        {account ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-4 rounded-2xl bg-surface-hover border border-border/80 text-caption">
            <div>
              <span className="text-xs text-text-tertiary block">Account Holder</span>
              <span className="font-bold text-text-primary">{account.accountHolderName || '—'}</span>
            </div>
            <div>
              <span className="text-xs text-text-tertiary block">Bank Account</span>
              <span className="font-bold text-text-primary">{account.bankAccountNumberMasked || '—'}</span>
            </div>
            <div>
              <span className="text-xs text-text-tertiary block">Bank IFSC</span>
              <span className="font-bold text-text-primary">{account.bankIfsc || '—'}</span>
            </div>
            <div>
              <span className="text-xs text-text-tertiary block">Business PAN</span>
              <span className="font-bold text-text-primary">{account.businessPan || '—'}</span>
            </div>
            {!kycActivated && (
              <p className="col-span-full text-xs text-text-secondary">
                {account.kycStatus === 'rejected'
                  ? 'Razorpay rejected this submission. Contact support to resubmit with corrected details.'
                  : "Submitted — Razorpay is verifying these details. This can take a little time; you'll be paid manually until it's activated."}
              </p>
            )}
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            {error && (
              <div className="flex items-center gap-2 p-3 rounded-xl bg-error/10 border border-error/20 text-caption text-error">
                <AlertCircle className="h-4 w-4 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Input
                label="Account Holder Name"
                placeholder="As per bank records"
                value={accountHolderName}
                onChange={(e) => setAccountHolderName(e.target.value)}
                required
              />
              <Input
                label="Business PAN"
                placeholder="ABCDE1234F"
                value={businessPan}
                onChange={(e) => setBusinessPan(e.target.value.toUpperCase())}
                maxLength={10}
                required
              />
              <Input
                label="Bank Account Number"
                placeholder="123456789012"
                value={bankAccountNumber}
                onChange={(e) => setBankAccountNumber(e.target.value.replace(/\D/g, ''))}
                required
              />
              <Input
                label="Bank IFSC Code"
                placeholder="HDFC0000128"
                value={bankIfsc}
                onChange={(e) => setBankIfsc(e.target.value.toUpperCase())}
                maxLength={11}
                required
              />
            </div>
            <Button
              type="submit"
              variant="primary"
              isLoading={isSubmitting}
              loadingText="Saving…"
              className="w-full sm:w-auto self-end gap-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold"
            >
              Save Payout Details
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
