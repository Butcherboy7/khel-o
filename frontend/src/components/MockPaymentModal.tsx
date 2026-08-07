'use client';

import { AlertCircle, CheckCircle2, CreditCard } from 'lucide-react';

interface MockPaymentModalProps {
  isOpen: boolean;
  orderId: string;
  amount: number;
  onSuccess: () => void;
  onFailure: () => void;
  onClose: () => void;
}

export function MockPaymentModal({
  isOpen,
  orderId,
  amount,
  onSuccess,
  onFailure,
  onClose,
}: MockPaymentModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-sm w-full mx-4 border border-border">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 rounded-full bg-primary/10">
            <CreditCard className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h3 className="font-heading text-h3 font-bold text-text-primary">
              Sandbox Payment
            </h3>
            <p className="text-caption text-text-secondary">Test Mode</p>
          </div>
        </div>

        <div className="bg-surface rounded-xl p-4 mb-4">
          <div className="flex justify-between text-caption mb-2">
            <span className="text-text-secondary">Order ID</span>
            <span className="font-data font-semibold text-text-primary">{orderId}</span>
          </div>
          <div className="flex justify-between text-body">
            <span className="text-text-secondary">Amount</span>
            <span className="font-bold text-text-primary">₹{amount / 100}</span>
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <button
            onClick={onSuccess}
            className="w-full flex items-center justify-center gap-2 bg-primary text-white font-semibold py-3 px-4 rounded-xl hover:bg-primary/90 transition-colors"
          >
            <CheckCircle2 className="h-5 w-5" />
            <span>Simulate SUCCESS</span>
          </button>

          <button
            onClick={onFailure}
            className="w-full flex items-center justify-center gap-2 bg-error text-white font-semibold py-3 px-4 rounded-xl hover:bg-error/90 transition-colors"
          >
            <AlertCircle className="h-5 w-5" />
            <span>Simulate FAILURE</span>
          </button>

          <button
            onClick={onClose}
            className="w-full text-text-secondary font-semibold py-2 px-4 rounded-xl hover:bg-surface transition-colors text-caption"
          >
            Cancel (Close)
          </button>
        </div>

        <p className="text-xsmall text-text-secondary text-center mt-4">
          This is a sandbox modal for testing purposes only.
          <br />
          No real payment will be processed.
        </p>
      </div>
    </div>
  );
}
