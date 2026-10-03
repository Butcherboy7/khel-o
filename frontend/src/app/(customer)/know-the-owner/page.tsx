'use client';

import Link from 'next/link';
import { OwnerIntroForm } from '@/components/customer/OwnerIntroForm';

const WHY = [
  { emoji: '🤝', text: 'A friendly intro beats us walking in cold, every single time.' },
  { emoji: '🤙', text: "We call once, keep it chill, and say you sent us. No spam, ever." },
  { emoji: '🎮', text: 'Once they’re on, you book your station online. No calls, no waiting.' },
];

/** "Know a gaming café owner?" — the general intro form, for cafés that
 *  aren't on KHEL-O at all yet (lead cafés have it on their own page). */
export default function KnowTheOwnerPage() {
  return (
    <div className="mx-auto flex w-full max-w-lg flex-col gap-6 pb-24">
      <div className="flex flex-col gap-2">
        <span className="text-[40px] leading-none" aria-hidden>👀</span>
        <h1 className="font-heading text-h1 text-text-primary">Know a gaming café owner?</h1>
        <p className="text-body text-text-secondary">
          Your favourite spot isn&apos;t on KHEL-O yet? Put us in touch and we&apos;ll do the rest. You&apos;d be doing
          every gamer in your area a huge favour 🙏
        </p>
      </div>

      <ul className="flex flex-col gap-2">
        {WHY.map(({ emoji, text }) => (
          <li key={text} className="flex items-start gap-3 text-caption text-text-primary">
            <span className="text-body leading-tight" aria-hidden>{emoji}</span>
            <span>{text}</span>
          </li>
        ))}
      </ul>

      <div className="rounded-2xl border border-border bg-card p-4 shadow-card">
        <OwnerIntroForm />
      </div>

      <p className="text-center text-caption text-text-secondary">
        You own the café?{' '}
        <Link href="/partner" className="font-semibold text-primary hover:underline">
          List it yourself for free
        </Link>
      </p>
    </div>
  );
}
