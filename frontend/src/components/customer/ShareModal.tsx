'use client';

import { useState } from 'react';
import { X, Copy, MessageCircle, Send, Share2, Facebook, Check, MoreHorizontal } from 'lucide-react';
import { Button } from '@/components/ui';
import { createShare, type ShareChannel, type ShareTarget } from '@/lib/share';

interface ShareModalProps extends ShareTarget {
  isOpen: boolean;
  onClose: () => void;
  /** Heading, e.g. "Share this café". */
  heading?: string;
  /** Message that goes with the link. */
  message: string;
}

const CHANNELS: { channel: Exclude<ShareChannel, 'copy' | 'native'>; name: string; icon: typeof Send; color: string; href: (url: string, text: string) => string }[] = [
  {
    channel: 'whatsapp',
    name: 'WhatsApp',
    icon: MessageCircle,
    color: 'bg-emerald-500 text-white',
    href: (url, text) => `https://api.whatsapp.com/send?text=${encodeURIComponent(`${text} ${url}`)}`,
  },
  {
    channel: 'telegram',
    name: 'Telegram',
    icon: Send,
    color: 'bg-sky-500 text-white',
    href: (url, text) => `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`,
  },
  {
    channel: 'facebook',
    name: 'Facebook',
    icon: Facebook,
    color: 'bg-blue-600 text-white',
    href: (url) => `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`,
  },
  {
    channel: 'x',
    name: 'X',
    icon: X,
    color: 'bg-secondary text-white',
    href: (url, text) => `https://twitter.com/intent/tweet?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`,
  },
];

/**
 * Share sheet. Each tap mints its own tracked link (see lib/share.ts), so
 * admin can see which channel and café every share, open and signup came from.
 */
export function ShareModal({ isOpen, onClose, heading = 'Share', message, ...target }: ShareModalProps) {
  const [copied, setCopied] = useState(false);
  if (!isOpen) return null;

  const canNativeShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  const openChannel = (c: (typeof CHANNELS)[number]) => {
    window.open(c.href(createShare(target, c.channel), message), '_blank', 'noopener,noreferrer');
  };

  const handleCopy = async () => {
    const url = createShare(target, 'copy');
    try {
      await navigator.clipboard.writeText(`${message} ${url}`);
    } catch {
      // Clipboard blocked — nothing sensible to fall back to in a modal.
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleNative = async () => {
    try {
      await navigator.share({ text: message, url: createShare(target, 'native') });
    } catch {
      // Share sheet dismissed.
    }
  };

  return (
    <div
      className="fixed inset-0 z-modal flex items-end sm:items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={heading}
        className="w-full max-w-sm rounded-3xl bg-card border border-border/80 shadow-overlay p-6 flex flex-col gap-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Share2 className="h-5 w-5 text-primary" />
            <h3 className="font-heading text-h3 text-text-primary">{heading}</h3>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="flex h-8 w-8 items-center justify-center rounded-full text-text-secondary hover:bg-surface"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {CHANNELS.map((c) => (
            <button
              key={c.channel}
              type="button"
              onClick={() => openChannel(c)}
              className="flex items-center gap-3 p-3 rounded-2xl bg-surface hover:bg-border/40 transition-colors font-medium text-body text-text-primary text-left"
            >
              <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${c.color}`}>
                <c.icon className="h-4 w-4" />
              </span>
              <span>{c.name}</span>
            </button>
          ))}
        </div>

        <div className="flex gap-2">
          <Button variant="secondary" onClick={handleCopy} className="flex-1 gap-1.5">
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            <span>{copied ? 'Link copied' : 'Copy link'}</span>
          </Button>
          {canNativeShare && (
            <Button variant="secondary" onClick={handleNative} className="flex-1 gap-1.5">
              <MoreHorizontal className="h-4 w-4" />
              <span>More apps</span>
            </Button>
          )}
        </div>
        <p className="text-caption text-text-secondary -mt-2">Copy link works for Instagram stories and bios too.</p>
      </div>
    </div>
  );
}
