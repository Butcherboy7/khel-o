'use client';

import Link from 'next/link';
import { Banknote, CalendarPlus, CheckCircle2, GraduationCap, HandCoins, Share2, Ticket, UserPlus } from 'lucide-react';
import { Button, Card, CardContent } from '@/components/ui';
import { OwnerPageHeader } from '@/components/owner/OwnerPageHeader';
import { useOwnerTourStore } from '@/store/ownerTourStore';

/** Everything an owner needs to run GTA 6 reservations, on one page, in plain English. */

const STEPS: { icon: typeof Ticket; title: string; body: string }[] = [
  {
    icon: CalendarPlus,
    title: '1. Make your drop',
    body: 'Open Launch drops and tap New drop. Pick the game, which of your rigs it runs on (PS5, Xbox or PC) and how many, the days, your hours, the price and a photo. It takes about two minutes.',
  },
  {
    icon: Share2,
    title: '2. Share your link',
    body: 'Every drop has its own page. Tap Share on the drop to send it on WhatsApp or Instagram, or print the QR for your counter. People reserve a seat in under a minute.',
  },
  {
    icon: Ticket,
    title: '3. Reservations come in',
    body: 'Each person pays a small booking fee online. It comes off their bill. They get a QR pass. You see their name, phone, seats and time under Who is coming.',
  },
  {
    icon: UserPlus,
    title: '4. Sold a seat at the café? Write it down',
    body: 'Walk-ins, phone calls and WhatsApp bookings you took yourself go in the box “Sold a seat at the café?”. The app then holds those seats, so nobody else can book them online.',
  },
  {
    icon: CheckCircle2,
    title: '5. On the day, check people in',
    body: 'Scan their QR pass or type the code. If someone is 15 minutes late, you can give their seat away. Seats you wrote down yourself do not need a pass.',
  },
  {
    icon: Banknote,
    title: '6. The money',
    body: 'Online fees are sent to your UPI or bank by KHEL-O (see Payouts). The rest of the bill, and everything you sold at the café, you collect yourself.',
  },
];

const HELPS = [
  ['You know your crowd before launch day', 'See who is coming, for which hour, how many seats. No guessing how many staff you need.'],
  ['Fewer empty seats', 'People who paid a fee turn up. If someone does not, you can give the seat away after 15 minutes.'],
  ['Never sold twice', 'Seats are counted hour by hour. An online booking and a café booking can never take the same seat.'],
  ['Your café, your page', 'Your own photo, your price, your link. You can change prices any time, even when it is live.'],
];

const FAQ = [
  ['What if I made a mistake in an offline booking?', 'Open the drop, find the booking under Who is coming and tap Remove, then Yes. The seats are free again straight away.'],
  ['Does KHEL-O take money for offline bookings?', 'No. The customer paid you at the café, so the money is already with you. It is only written down so the app knows the seats are gone.'],
  ['Can my staff add offline bookings?', 'Not yet. Only the café owner login can. Staff can still check people in from the Scan page.'],
  ['What if two people want the last seat?', 'The first one to finish gets it. The other is told it just got taken and can pick another time.'],
  ['What if I cancel the drop?', 'Everyone who paid online gets their money back in full, automatically. Offline bookings are not touched, because no app money was involved.'],
  ['Do normal bookings still work?', 'Yes. The rigs you give the drop show as taken for normal bookings during the drop hours only. Make the hours shorter to free them.'],
];

export default function Gta6GuidePage() {
  const startLesson = useOwnerTourStore((s) => s.startLesson);
  const tourReady = useOwnerTourStore((s) => s.enabled);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <OwnerPageHeader
        title="GTA 6 at your café"
        description="Sell seats before launch day, take walk-in bookings too, and never double-book a seat. Here is how it works."
      />

      <Card elevation="raised" className="border border-primary/30 bg-primary/5">
        <CardContent className="flex flex-col gap-3 p-5">
          <p className="font-heading text-h3 font-bold text-text-primary">The short version</p>
          <p className="text-body text-text-primary">
            Customers reserve a seat on KHEL-O with a small online fee. They pay the rest at your café. You can also write down seats you sold yourself, so the app stops selling them.
          </p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Link href="/owner/drops" className="flex h-11 items-center justify-center rounded-xl bg-primary px-5 font-semibold text-white hover:bg-primary-dark">
              Start my GTA 6 drop
            </Link>
            {tourReady && (
              <Button variant="secondary" onClick={() => startLesson('drops', '/owner/drops')} className="gap-1.5">
                <GraduationCap className="h-4 w-4" aria-hidden /> Show me on screen
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <section className="flex flex-col gap-3" aria-labelledby="gta-how">
        <h2 id="gta-how" className="font-heading text-h2 font-semibold text-text-primary">How it works</h2>
        <ol className="flex flex-col gap-3">
          {STEPS.map(({ icon: Icon, title, body }) => (
            <li key={title} className="flex gap-3 rounded-2xl border border-border bg-card p-4">
              <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Icon className="h-5 w-5" aria-hidden />
              </span>
              <span className="min-w-0">
                <span className="block font-heading text-body-emphasis font-bold text-text-primary">{title}</span>
                <span className="block text-body text-text-secondary">{body}</span>
              </span>
            </li>
          ))}
        </ol>
      </section>

      <section className="flex flex-col gap-3" aria-labelledby="gta-offline">
        <h2 id="gta-offline" className="font-heading text-h2 font-semibold text-text-primary">Taking bookings at the café</h2>
        <Card elevation="resting">
          <CardContent className="flex flex-col gap-3 p-5">
            <p className="text-body text-text-secondary">
              Example: a customer comes to your counter on Saturday and pays <strong className="text-text-primary">₹1,500 in cash</strong> for 2 seats, 6 PM to 9 PM.
            </p>
            <ol className="flex list-decimal flex-col gap-1.5 pl-5 text-body text-text-primary">
              <li>Open <strong>Launch drops</strong>, then tap your drop.</li>
              <li>Find the box <strong>Sold a seat at the café?</strong></li>
              <li>Pick the day, the start time and the hours. Type 2 seats and the customer’s name.</li>
              <li>Type the cash you took (or leave it empty for the usual price). Tap <strong>Hold these seats</strong>.</li>
            </ol>
            <p className="flex items-start gap-2 rounded-xl bg-surface p-3 text-body text-text-primary">
              <HandCoins className="mt-0.5 h-5 w-5 flex-shrink-0 text-primary" aria-hidden />
              The app now shows 2 fewer seats for those hours. Online customers can no longer book them. The booking also shows under Bookings, marked as sold at the café.
            </p>
          </CardContent>
        </Card>
      </section>

      <section className="flex flex-col gap-3" aria-labelledby="gta-help">
        <h2 id="gta-help" className="font-heading text-h2 font-semibold text-text-primary">How it helps you</h2>
        <ul className="grid gap-3 sm:grid-cols-2">
          {HELPS.map(([t, b]) => (
            <li key={t} className="rounded-2xl border border-border bg-card p-4">
              <span className="block font-heading text-body-emphasis font-bold text-text-primary">{t}</span>
              <span className="block text-body text-text-secondary">{b}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="flex flex-col gap-3" aria-labelledby="gta-faq">
        <h2 id="gta-faq" className="font-heading text-h2 font-semibold text-text-primary">Questions owners ask</h2>
        <div className="flex flex-col gap-2">
          {FAQ.map(([q, a]) => (
            <details key={q} className="group rounded-2xl border border-border bg-card p-4">
              <summary className="flex min-h-[44px] cursor-pointer list-none items-center justify-between gap-3 font-semibold text-text-primary">
                {q}
                <span className="text-caption font-semibold text-primary group-open:hidden">Show</span>
                <span className="hidden text-caption font-semibold text-primary group-open:inline">Hide</span>
              </summary>
              <p className="mt-1 text-body text-text-secondary">{a}</p>
            </details>
          ))}
        </div>
      </section>

      <Link href="/owner/support" className="self-start text-body font-semibold text-primary">
        Need help? Ask KHEL-O
      </Link>
    </div>
  );
}
