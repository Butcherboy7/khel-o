'use client';

import { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { KHELO_CONTACT, telHref } from '@/constants/contact';
import { trackAction } from '@/lib/api/analyticsEvents';

/** Copies the number (with +91, no spaces) so it pastes cleanly into WhatsApp or a dialler. */
export function CopyPhoneButton({ where, label = false, className = '' }: { where: string; label?: boolean; className?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    const text = KHELO_CONTACT.phoneE164;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Older or locked-down browsers: fall back to a hidden field.
      const el = document.createElement('textarea');
      el.value = text;
      el.setAttribute('readonly', '');
      el.style.position = 'fixed';
      el.style.opacity = '0';
      document.body.appendChild(el);
      el.select();
      try { document.execCommand('copy'); } catch { /* nothing more to try */ }
      document.body.removeChild(el);
    }
    trackAction('gta6_contact_copy', { page: where });
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button
      type="button"
      onClick={copy}
      aria-label={copied ? 'Number copied' : 'Copy phone number'}
      className={`inline-flex min-h-[44px] min-w-[44px] items-center justify-center gap-1.5 rounded-lg px-2 text-caption font-semibold text-primary transition-colors hover:bg-primary/10 ${className}`}
    >
      {copied ? <Check className="h-4 w-4" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
      {label && <span>{copied ? 'Copied' : 'Copy number'}</span>}
      <span role="status" className="sr-only">{copied ? 'Number copied' : ''}</span>
    </button>
  );
}

/** The number inside a sentence: a tap-to-call link, selectable in one tap, with a copy button beside it. */
export function PhoneInline({ where = 'text' }: { where?: string }) {
  return (
    <span className="inline-flex items-center gap-0.5 whitespace-nowrap align-middle">
      <a href={telHref} onClick={() => trackAction('gta6_contact_call', { page: where, source: 'inline' })} className="select-all font-semibold text-primary underline underline-offset-2">
        {KHELO_CONTACT.phoneDisplay}
      </a>
      <CopyPhoneButton where={where} />
    </span>
  );
}
