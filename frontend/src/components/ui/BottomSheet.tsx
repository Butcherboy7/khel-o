'use client';

import {
  useEffect,
  useRef,
  useCallback,
  type ReactNode,
  type KeyboardEvent,
} from 'react';
import { X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/cn';
import { Button } from './Button';

interface BottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  preventBackdropClose?: boolean;
}

export function BottomSheet({
  isOpen,
  onClose,
  title,
  description,
  children,
  footer,
  preventBackdropClose = false,
}: BottomSheetProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      if (e.key === 'Escape' && !preventBackdropClose) {
        onClose();
      }
      if (e.key === 'Tab') {
        const focusable = panelRef.current?.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        );
        if (!focusable || focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    },
    [onClose, preventBackdropClose],
  );

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      panelRef.current?.focus();
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  return (
    <AnimatePresence>
      {isOpen && (
        <div
          className="fixed inset-0 z-modal flex flex-col justify-end"
          role="dialog"
          aria-modal="true"
          aria-labelledby={title ? 'bottomsheet-title' : undefined}
          aria-describedby={description ? 'bottomsheet-description' : undefined}
          onKeyDown={handleKeyDown}
        >
          {/* Backdrop */}
          <motion.div
            className="absolute inset-0 bg-secondary/60 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={preventBackdropClose ? undefined : onClose}
            aria-hidden="true"
          />

          {/* Sheet Panel */}
          <motion.div
            ref={panelRef}
            tabIndex={-1}
            className={cn(
              'relative z-10 w-full rounded-t-3xl bg-card shadow-overlay',
              'flex max-h-[85vh] flex-col mx-auto max-w-content',
              'focus:outline-none',
            )}
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
          >
            {/* Drag Handle Indicator */}
            <div className="flex justify-center pt-3 pb-1">
              <div className="h-1.5 w-12 rounded-full bg-border" />
            </div>

            {/* Header */}
            {(title || description) && (
              <div className="flex items-start justify-between gap-4 border-b border-border px-6 py-4">
                <div>
                  {title && (
                    <h2 id="bottomsheet-title" className="font-heading text-h2 text-text-primary">
                      {title}
                    </h2>
                  )}
                  {description && (
                    <p id="bottomsheet-description" className="mt-1 text-body text-text-secondary">
                      {description}
                    </p>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={onClose}
                  aria-label="Close bottom sheet"
                  className="flex-shrink-0"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            )}

            {/* Body */}
            <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>

            {/* Footer */}
            {footer && (
              <div className="border-t border-border px-6 py-4 safe-bottom">{footer}</div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
