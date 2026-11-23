'use client';

import { MessageCircle, Phone } from 'lucide-react';
import { KHELO_CONTACT, telHref, whatsappHref } from '@/constants/contact';
import { trackAction } from '@/lib/api/analyticsEvents';

/**
 * "Contact KHEL-O to find a GTA 6 slot": the main conversion on every GTA 6 page.
 * Everything a crawler or an AI assistant needs is plain text in the HTML (the number,
 * the hours, the steps); the buttons only add click tracking.
 */
export function ContactBlock({ where, source }: { where: string; source: string }) {
  const message = `Hi KHEL-O, I want to play GTA 6${where ? ` in ${where}` : ''} and don't have a PS5. Which café has a free slot?`;
  const track = (channel: 'call' | 'whatsapp') => trackAction(`gta6_contact_${channel}`, { source, page: where || 'all' });
  return (
    <section aria-labelledby="gta6-contact-h" className="flex max-w-3xl flex-col gap-4 rounded-2xl border border-primary/40 bg-primary/10 p-5">
      <div className="flex flex-col gap-1">
        <h2 id="gta6-contact-h" className="font-heading text-h2 font-bold text-balance text-text-primary">
          Not sure which café has a free PS5? Ask KHEL-O.
        </h2>
        <p className="text-body text-text-secondary">
          Call or message the KHEL-O team on <strong className="font-semibold text-text-primary">{KHELO_CONTACT.phoneDisplay}</strong>{' '}
          (one number for calls and WhatsApp). We reply fastest {KHELO_CONTACT.hours}.
        </p>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <a
          href={telHref}
          onClick={() => track('call')}
          className="btn-depth inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-primary px-5 font-semibold text-white sm:min-w-[11rem]"
        >
          <Phone className="h-5 w-5" aria-hidden="true" />
          Call {KHELO_CONTACT.phoneDisplay}
        </a>
        <a
          href={whatsappHref(message)}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => track('whatsapp')}
          className="inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-primary px-5 font-semibold text-primary transition-colors hover:bg-primary/10"
        >
          <MessageCircle className="h-5 w-5" aria-hidden="true" />
          WhatsApp us
        </a>
      </div>

      <div className="flex flex-col gap-2">
        <h3 className="font-heading text-body font-bold text-text-primary">What happens when you contact us</h3>
        <ol className="flex list-decimal flex-col gap-1 pl-5 text-body text-text-secondary marker:font-semibold marker:text-text-primary">
          <li>Tell us your area, the day and how many of you are playing.</li>
          <li>We check which partner café has a PS5 free at that time.</li>
          <li>You pay online on KHEL-O, get a QR pass, and play at the café.</li>
        </ol>
        <p className="text-caption text-text-secondary">
          The cafés are independent partners, not KHEL-O branches: you play at the café&apos;s own address. KHEL-O is the booking platform.
        </p>
      </div>
    </section>
  );
}
