'use client';

import { useState } from 'react';
import { X, Copy, MessageCircle, Send, Share2, Facebook, Linkedin, Check } from 'lucide-react';
import { Button } from '@/components/ui';

interface ShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  url?: string;
}

export function ShareModal({ isOpen, onClose, title, url }: ShareModalProps) {
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const targetUrl = url || (typeof window !== 'undefined' ? window.location.href : '');
  const encodedUrl = encodeURIComponent(targetUrl);
  const encodedTitle = encodeURIComponent(`Check out ${title} on KHEL-O!`);

  const shareLinks = [
    {
      name: 'WhatsApp',
      icon: MessageCircle,
      color: 'bg-emerald-500 text-white',
      href: `https://api.whatsapp.com/send?text=${encodedTitle}%20${encodedUrl}`,
    },
    {
      name: 'Telegram',
      icon: Send,
      color: 'bg-sky-500 text-white',
      href: `https://t.me/share/url?url=${encodedUrl}&text=${encodedTitle}`,
    },
    {
      name: 'Facebook',
      icon: Facebook,
      color: 'bg-blue-600 text-white',
      href: `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`,
    },
    {
      name: 'LinkedIn',
      icon: Linkedin,
      color: 'bg-blue-700 text-white',
      href: `https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}`,
    },
  ];

  const handleCopy = () => {
    navigator.clipboard.writeText(targetUrl).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-modal flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in">
      <div className="w-full max-w-sm rounded-3xl bg-card border border-border/80 shadow-overlay p-6 flex flex-col gap-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Share2 className="h-5 w-5 text-primary" />
            <h3 className="font-heading text-h3 text-text-primary">Share Venue</h3>
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
          {shareLinks.map((link) => (
            <a
              key={link.name}
              href={link.href}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 p-3 rounded-2xl bg-surface hover:bg-border/40 transition-colors font-medium text-body text-text-primary"
            >
              <div className={`flex h-9 w-9 items-center justify-center rounded-xl ${link.color}`}>
                <link.icon className="h-4 w-4" />
              </div>
              <span>{link.name}</span>
            </a>
          ))}
        </div>

        <div className="flex items-center gap-2 p-2 rounded-2xl bg-surface border border-border/60">
          <input
            type="text"
            readOnly
            value={targetUrl}
            className="flex-1 bg-transparent px-2 text-caption text-text-secondary outline-none truncate"
          />
          <Button size="sm" onClick={handleCopy} className="gap-1 flex-shrink-0">
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            <span>{copied ? 'Copied' : 'Copy'}</span>
          </Button>
        </div>
      </div>
    </div>
  );
}
