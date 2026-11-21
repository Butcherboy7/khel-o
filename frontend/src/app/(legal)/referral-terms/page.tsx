import type { Metadata } from 'next';

export const metadata: Metadata = {
  alternates: { canonical: '/referral-terms' },
  title: 'Invite friends and first-booking offers: terms',
  description: 'How KHEL-O first-booking discounts, the community code and friend rewards work.',
};

export default function ReferralTermsPage() {
  return (
    <>
      <h1>Invite friends and first-booking offers</h1>
      <p className="prose-legal-updated">Last updated: 21 November 2026</p>

      <p>
        These terms cover three discounts KHEL-O gives on bookings made on the KHEL-O website and app. They sit
        alongside our <a href="/terms">Terms of Service</a> and <a href="/refund-policy">Refund Policy</a>. The amounts
        running right now are shown on the invite card and at checkout before you pay.
      </p>

      <h2>1. What you can get</h2>
      <ul>
        <li>
          <strong>Welcome offer.</strong> Your first paid booking on KHEL-O is a fixed amount off (currently ₹15).
        </li>
        <li>
          <strong>Community code.</strong> A code posted in the KHEL-O WhatsApp community takes a further fixed amount
          off your first paid booking (currently ₹15). Type it in &quot;Have a code?&quot; at checkout.
        </li>
        <li>
          <strong>Friend reward.</strong> When a friend makes a KHEL-O account from your invite link and their own
          first booking is checked in at the café, you get a fixed amount off one future booking (currently ₹15).
        </li>
      </ul>

      <h2>2. They are discounts, not money</h2>
      <p>
        Every reward is only a lower price on a KHEL-O booking, paid for by KHEL-O. The café always receives its full
        price. Rewards have no cash value: they cannot be withdrawn, transferred, sold, exchanged for cash or added
        to any balance or wallet. The amount you pay through Razorpay is the price after the discount.
      </p>

      <h2>3. Limits</h2>
      <ul>
        <li>At most ₹30 of these discounts apply to one booking, and you always pay at least ₹1.</li>
        <li>They apply to sessions of ₹50 or more.</li>
        <li>One friend reward per booking. A friend reward lasts 60 days from the day you earn it.</li>
        <li>You can earn friend rewards for up to 10 friends.</li>
        <li>
          Your friend&apos;s account must be new: made no more than 14 days before they use your link, with no paid
          booking yet. Each person can be invited by only one friend.
        </li>
        <li>Your own link, a second account of yours, or an account with your phone number does not count.</li>
        <li>Only one level counts: you earn nothing when your friend&apos;s friends join.</li>
      </ul>

      <h2>4. Cancellations and refunds</h2>
      <p>
        A refund returns what you actually paid. A discount is never paid out as cash. If you cancel a booking that
        used a friend reward, the reward comes back to you (if it hasn&apos;t expired).
      </p>

      <h2>5. Fair use</h2>
      <p>
        We may cancel a reward or a referral that looks like misuse: fake or duplicate accounts, self-referrals, or
        sharing the community code outside the community. We may change or end these offers at any time. A booking
        already paid for keeps the price it was paid at.
      </p>

      <h2>6. Questions</h2>
      <p>
        Write to us from the <a href="/contact">Contact</a> page.
      </p>
    </>
  );
}
