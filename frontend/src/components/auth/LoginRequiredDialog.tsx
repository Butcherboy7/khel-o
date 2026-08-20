'use client';

import { LogIn } from 'lucide-react';
import { Modal, Button } from '@/components/ui';

interface LoginRequiredDialogProps {
  isOpen: boolean;
  onCancel: () => void;
  onLogin: () => void;
  title?: string;
  description?: string;
}

/**
 * Explains *why* a protected action was blocked instead of silently
 * redirecting to /login. Purely a UX affordance — the backend remains the
 * actual security boundary; this dialog just tells the visitor what
 * happened and lets them choose to log in (preserving whatever they were
 * doing) or stay put.
 */
export function LoginRequiredDialog({
  isOpen,
  onCancel,
  onLogin,
  title = 'Login required',
  description = "Please log in to continue with your booking. We'll bring you right back to this slot.",
}: LoginRequiredDialogProps) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onCancel}
      title={title}
      footer={
        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button variant="primary" onClick={onLogin}>
            Log in
          </Button>
        </div>
      }
    >
      <div className="flex items-start gap-3">
        <div className="h-10 w-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center flex-shrink-0">
          <LogIn className="h-5 w-5" />
        </div>
        <p className="text-caption text-text-secondary">{description}</p>
      </div>
    </Modal>
  );
}
