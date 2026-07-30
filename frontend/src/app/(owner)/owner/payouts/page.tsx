'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Building,
  CreditCard,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  ShieldAlert,
} from 'lucide-react';
import { getPayoutStatus, submitPayoutDetails } from '@/lib/api';

export default function OwnerPayoutsPage() {
  const router = useRouter();
  const queryClient = useQueryClient();

  const [businessPan, setBusinessPan] = useState('');
  const [bankAccountNumber, setBankAccountNumber] = useState('');
  const [bankIfsc, setBankIfsc] = useState('');
  const [accountHolderName, setAccountHolderName] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const { data: payoutAccount, isLoading, refetch } = useQuery({
    queryKey: ['payoutAccount'],
    queryFn: getPayoutStatus,
    staleTime: 30_000,
  });

  useEffect(() => {
    if (payoutAccount) {
      setBusinessPan(payoutAccount.businessPan || '');
      setBankAccountNumber(''); // Don't show plain text bank account
      setBankIfsc(payoutAccount.bankIfsc || '');
      setAccountHolderName(payoutAccount.accountHolderName || '');
    }
  }, [payoutAccount]);

  const submitMutation = useMutation({
    mutationFn: submitPayoutDetails,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['payoutAccount'] });
      setSuccessMsg('Payout details submitted successfully.');
      setErrorMsg(null);
      refetch();
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.error?.message || err?.response?.data?.detail || 'Failed to submit details.';
      setErrorMsg(msg);
      setSuccessMsg(null);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!businessPan.trim() || !bankAccountNumber.trim() || !bankIfsc.trim() || !accountHolderName.trim()) {
      setErrorMsg('All fields are required.');
      return;
    }
    submitMutation.mutate({
      businessPan,
      bankAccountNumber,
      bankIfsc,
      accountHolderName,
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
      </div>
    );
  }

  const kycStatus = payoutAccount?.kycStatus || 'pending';

  return (
    <div className="space-y-6 pb-24">
      {/* Header */}
      <div className="flex items-center space-x-3 border-b border-border pb-3 -mx-4 px-4 bg-card sticky top-0 z-10 shadow-sm">
        <button
          type="button"
          onClick={() => router.push('/owner/dashboard')}
          className="p-2 hover:bg-surface rounded-full text-text-secondary transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-lg font-bold font-heading text-text-primary">Payout & KYC Setup</h1>
      </div>

      {/* KYC Warning/Status Banner */}
      {kycStatus === 'pending' && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-2xl p-4 flex items-start space-x-3 text-xs shadow-sm font-body">
          <ShieldAlert className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
          <div>
            <p className="font-bold text-sm">Payouts Configuration Needed</p>
            <p className="mt-1 leading-normal">
              Your café bookings are currently paused. You must complete your KYC and payout account setup before you can accept reservations.
            </p>
          </div>
        </div>
      )}

      {kycStatus === 'submitted' && (
        <div className="bg-blue-50 border border-blue-200 text-blue-800 rounded-2xl p-4 flex items-start space-x-3 text-xs shadow-sm font-body">
          <Loader2 className="w-5 h-5 text-blue-500 shrink-0 animate-spin mt-0.5" />
          <div>
            <p className="font-bold text-sm">Verification in Progress</p>
            <p className="mt-1 leading-normal">
              Your KYC details have been submitted. Razorpay is verifying your identity and bank credentials. This usually takes 1-3 business days.
            </p>
          </div>
        </div>
      )}

      {kycStatus === 'activated' && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-2xl p-4 flex items-start space-x-3 text-xs shadow-sm font-body">
          <CheckCircle2 className="w-5 h-5 text-primary shrink-0 mt-0.5" />
          <div>
            <p className="font-bold text-sm">KYC Active & Payouts Unlocked</p>
            <p className="mt-1 leading-normal">
              Your account is fully verified. Splits are enabled automatically via Razorpay Route.
            </p>
          </div>
        </div>
      )}

      {kycStatus === 'rejected' && (
        <div className="bg-red-50 border border-red-200 text-red-800 rounded-2xl p-4 flex items-start space-x-3 text-xs shadow-sm font-body">
          <AlertTriangle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
          <div>
            <p className="font-bold text-sm">KYC Verification Rejected</p>
            <p className="mt-1 leading-normal">
              Razorpay rejected the submitted details. Please verify your PAN and Bank credentials and re-submit the form below.
            </p>
          </div>
        </div>
      )}

      {/* Success/Error Alerts */}
      {successMsg && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-xl p-3 flex items-center space-x-2">
          <CheckCircle2 className="w-4 h-4 text-primary" />
          <span>{successMsg}</span>
        </div>
      )}

      {errorMsg && (
        <div className="bg-red-50 border border-red-200 text-red-800 text-xs rounded-xl p-3 flex items-center space-x-2">
          <AlertTriangle className="w-4 h-4 text-red-500" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Form Card */}
      <div className="bg-card border border-border rounded-2xl p-6 shadow-md space-y-4">
        <h2 className="font-heading font-bold text-base text-text-primary border-b border-border pb-2 flex items-center gap-2">
          <Building className="w-5 h-5 text-primary" />
          <span>Business & Payout Details</span>
        </h2>

        <form onSubmit={handleSubmit} className="space-y-4 font-body">
          <div className="space-y-1">
            <label className="block text-xs font-semibold text-text-secondary">Account Holder Name (as in bank) *</label>
            <input
              type="text"
              required
              disabled={kycStatus === 'activated' || kycStatus === 'submitted'}
              value={accountHolderName}
              onChange={(e) => setAccountHolderName(e.target.value)}
              placeholder="e.g. Ramesh Kumar"
              className="w-full bg-card border border-border rounded-xl px-4 py-3 text-sm text-text-primary focus:outline-none focus:border-primary disabled:opacity-60 disabled:cursor-not-allowed"
            />
          </div>

          <div className="space-y-1">
            <label className="block text-xs font-semibold text-text-secondary">PAN Number *</label>
            <input
              type="text"
              required
              disabled={kycStatus === 'activated' || kycStatus === 'submitted'}
              maxLength={10}
              value={businessPan}
              onChange={(e) => setBusinessPan(e.target.value.toUpperCase())}
              placeholder="e.g. ABCDE1234F"
              className="w-full bg-card border border-border rounded-xl px-4 py-3 text-sm text-text-primary focus:outline-none focus:border-primary disabled:opacity-60 disabled:cursor-not-allowed uppercase font-data"
            />
          </div>

          <div className="space-y-1">
            <label className="block text-xs font-semibold text-text-secondary">
              {kycStatus === 'activated' || kycStatus === 'submitted'
                ? 'Bank Account Number (Masked)'
                : 'Bank Account Number *'}
            </label>
            <input
              type="password"
              required
              disabled={kycStatus === 'activated' || kycStatus === 'submitted'}
              value={
                kycStatus === 'activated' || kycStatus === 'submitted'
                  ? payoutAccount?.bankAccountNumberMasked || ''
                  : bankAccountNumber
              }
              onChange={(e) => setBankAccountNumber(e.target.value)}
              placeholder={
                kycStatus === 'activated' || kycStatus === 'submitted'
                  ? ''
                  : 'e.g. 987654321012'
              }
              className="w-full bg-card border border-border rounded-xl px-4 py-3 text-sm text-text-primary focus:outline-none focus:border-primary disabled:opacity-60 disabled:cursor-not-allowed font-data"
            />
          </div>

          <div className="space-y-1">
            <label className="block text-xs font-semibold text-text-secondary">Bank IFSC Code *</label>
            <input
              type="text"
              required
              disabled={kycStatus === 'activated' || kycStatus === 'submitted'}
              maxLength={11}
              value={bankIfsc}
              onChange={(e) => setBankIfsc(e.target.value.toUpperCase())}
              placeholder="e.g. SBIN0001234"
              className="w-full bg-card border border-border rounded-xl px-4 py-3 text-sm text-text-primary focus:outline-none focus:border-primary disabled:opacity-60 disabled:cursor-not-allowed uppercase font-data"
            />
          </div>

          {kycStatus !== 'activated' && kycStatus !== 'submitted' && (
            <button
              type="submit"
              disabled={submitMutation.isPending}
              className="btn-primary w-full py-3 flex items-center justify-center gap-2 mt-4"
            >
              {submitMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Submitting Details...</span>
                </>
              ) : (
                <>
                  <CreditCard className="w-4 h-4" />
                  <span>Submit for KYC Verification</span>
                </>
              )}
            </button>
          )}
        </form>
      </div>
    </div>
  );
}
