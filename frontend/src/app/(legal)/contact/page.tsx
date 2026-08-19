import type { Metadata } from 'next';
import { Mail, Phone, MapPin } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Contact Us',
  description: 'How to reach the KHEL-O team.',
};

export default function ContactPage() {
  return (
    <>
      <h1>Contact Us</h1>
      <p className="prose-legal-updated">We usually respond within 1–2 business days.</p>

      <p>
        KHEL-O is operated as a sole proprietorship by Uzair, based in Hyderabad, Telangana, India. For booking,
        payment, or account issues, the fastest path is the in-app Help &amp; Support ticket form (Profile → Help
        &amp; Support) since it&apos;s tied to your account and booking history. For everything else, reach us
        directly:
      </p>

      <div className="not-prose grid grid-cols-1 sm:grid-cols-3 gap-4 my-8">
        <a
          href="mailto:mallareddyuniversity010003@gmail.com"
          className="flex flex-col items-start gap-2 rounded-2xl border border-border bg-card p-5 hover:border-primary/40 transition-colors"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Mail className="h-5 w-5" />
          </div>
          <span className="text-caption font-semibold text-text-primary">Email</span>
          <span className="text-caption text-text-secondary break-all">mallareddyuniversity010003@gmail.com</span>
        </a>

        <a
          href="tel:+918142128389"
          className="flex flex-col items-start gap-2 rounded-2xl border border-border bg-card p-5 hover:border-primary/40 transition-colors"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Phone className="h-5 w-5" />
          </div>
          <span className="text-caption font-semibold text-text-primary">Phone</span>
          <span className="text-caption text-text-secondary">+91 81421 28389</span>
        </a>

        <div className="flex flex-col items-start gap-2 rounded-2xl border border-border bg-card p-5">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <MapPin className="h-5 w-5" />
          </div>
          <span className="text-caption font-semibold text-text-primary">Location</span>
          <span className="text-caption text-text-secondary">Hyderabad, Telangana, India</span>
        </div>
      </div>

      <h2>Business Hours</h2>
      <p>Monday – Saturday, 10:00 AM – 7:00 PM IST. Support tickets submitted outside these hours are answered the next business day.</p>

      <h2>Café Partner Enquiries</h2>
      <p>
        Own a gaming café and want to list on KHEL-O? Apply directly from the app (Profile → Become a Partner) or
        email us using the address above.
      </p>
    </>
  );
}
