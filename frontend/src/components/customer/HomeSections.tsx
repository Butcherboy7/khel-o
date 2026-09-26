import Link from 'next/link';
import { Search, SlidersHorizontal, CreditCard, QrCode, Radio, RotateCcw, ShieldCheck, Zap } from 'lucide-react';

// Server-rendered, so the copy is in the raw HTML. Plain, verifiable claims
// only — each one describes how the product actually works today.

const STEPS = [
  { icon: Search, title: 'Find a café', body: 'Search by city, game or what you want to play.' },
  { icon: SlidersHorizontal, title: 'Choose your setup', body: 'Pick a PC, console or table and a time slot.' },
  { icon: CreditCard, title: 'Book & pay', body: 'Pay online in a few taps. The total is shown upfront.' },
  { icon: QrCode, title: 'Show your pass & play', body: 'Scan your QR pass at the desk. Your station is ready.' },
];

const REASONS = [
  { icon: Radio, title: 'Live availability', body: 'See which stations are free before you leave home.' },
  { icon: Zap, title: 'Instant confirmation', body: 'Your slot is locked the moment you pay. No calls or waiting.' },
  { icon: RotateCcw, title: 'Easy cancellation', body: 'Cancel 2+ hours before your session for a full refund.' },
  { icon: ShieldCheck, title: 'Secure payments', body: 'Payments are processed by Razorpay. Cards, UPI and wallets.' },
];

function Grid({ items }: { items: typeof STEPS }) {
  return (
    <ol className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {items.map(({ icon: Icon, title, body }, i) => (
        <li key={title} className="flex gap-3 rounded-2xl border border-border bg-card p-4">
          <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Icon className="h-5 w-5" aria-hidden />
          </span>
          <div className="flex flex-col gap-0.5">
            <h3 className="font-heading text-body-emphasis text-text-primary">
              <span className="sr-only">{i + 1}. </span>
              {title}
            </h3>
            <p className="text-caption text-text-secondary">{body}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}

export function HomeSections() {
  return (
    <div className="flex flex-col gap-8 pt-4">
      <section aria-labelledby="how-it-works" className="flex flex-col gap-3">
        <h2 id="how-it-works" className="font-heading text-h2 text-text-primary">How KHEL-O works</h2>
        <Grid items={STEPS} />
      </section>

      <section aria-labelledby="why-khelo" className="flex flex-col gap-3">
        <h2 id="why-khelo" className="font-heading text-h2 text-text-primary">Why book through KHEL-O?</h2>
        <Grid items={REASONS} />
      </section>

      <p className="text-center text-caption text-text-secondary">
        Own a gaming café?{' '}
        <Link href="/partner" className="font-semibold text-primary hover:underline">
          List it for free
        </Link>
      </p>
    </div>
  );
}
