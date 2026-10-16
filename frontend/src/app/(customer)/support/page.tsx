'use client';

import Link from 'next/link';
import { LifeBuoy, Mail, Phone } from 'lucide-react';
import { SupportView } from '@/components/support/SupportView';
import { ContactForm } from '@/app/(legal)/contact/ContactForm';
import { PageSpinner } from '@/components/ui';
import { useAuthStore } from '@/store/authStore';

/** Signed in: tickets tied to the account. Signed out: a way to reach us that
 *  doesn't start with "make an account first" — the public contact form, which
 *  emails the support inbox. */
export default function SupportPage() {
  const isHydrated = useAuthStore((s) => s.isHydrated);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  if (!isHydrated) return <PageSpinner />;
  if (isAuthenticated) return <SupportView />;

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5 px-4 pb-12 pt-6">
      <div className="flex flex-col gap-1">
        <h1 className="flex items-center gap-2 font-heading text-h1 text-text-primary">
          <LifeBuoy className="h-5 w-5 text-primary" aria-hidden />
          Help & Support
        </h1>
        <p className="text-caption text-text-secondary">
          Stuck with a booking, a payment or a café? Tell us what happened. You don&apos;t need an account.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <a
          href="mailto:hello@khel-o.com"
          className="flex min-h-[44px] flex-col gap-1 rounded-2xl border border-border bg-card p-4 transition-colors hover:border-primary/40"
        >
          <Mail className="h-4 w-4 text-primary" aria-hidden />
          <span className="text-caption font-semibold text-text-primary">Email us</span>
          <span className="break-all text-caption text-text-secondary">hello@khel-o.com</span>
        </a>
        <a
          href="tel:+918142128389"
          className="flex min-h-[44px] flex-col gap-1 rounded-2xl border border-border bg-card p-4 transition-colors hover:border-primary/40"
        >
          <Phone className="h-4 w-4 text-primary" aria-hidden />
          <span className="text-caption font-semibold text-text-primary">Call us</span>
          <span className="text-caption text-text-secondary">+91 81421 28389</span>
        </a>
      </div>
      <p className="-mt-2 text-caption text-text-tertiary">Mon–Sat, 10 AM–7 PM. We usually reply within 1–2 working days.</p>

      <ContactForm />

      <p className="text-center text-caption text-text-secondary">
        Have an account?{' '}
        <Link href="/login?redirect=/support" className="font-semibold text-primary hover:underline">
          Sign in
        </Link>{' '}
        to see your past requests and replies.
      </p>
    </div>
  );
}
