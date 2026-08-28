import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Service Delivery Policy',
  description: 'How KHEL-O delivers your booked gaming session — there are no physical goods shipped.',
};

export default function ShippingPolicyPage() {
  return (
    <>
      <h1>Service Delivery Policy</h1>
      <p className="prose-legal-updated">Last updated: 19 August 2026</p>

      <p>
        KHEL-O is a service booking platform, not an e-commerce store — we don&apos;t ship physical goods. This
        page explains how your purchase (a gaming station booking) is &quot;delivered&quot;.
      </p>

      <h2>1. What You&apos;re Buying</h2>
      <p>
        When you pay on KHEL-O, you&apos;re purchasing a reserved time-slot on a specific hardware tier (e.g. an
        RTX 4070 PC, a PS5 pod) at a Café Partner&apos;s physical venue, for a set number of seats and a set
        duration.
      </p>

      <h2>2. Delivery Timing</h2>
      <p>
        Delivery is instant: as soon as your payment is confirmed, your booking status updates to{' '}
        <strong>Confirmed</strong> and a QR check-in code is generated immediately in the &quot;My
        Bookings&quot; section of the app. There is nothing further to wait for — you can show up at the venue at
        your booked time.
      </p>

      <h2>3. Redeeming Your Booking</h2>
      <p>
        Arrive at the Café Partner&apos;s venue within your booked time window and show your QR code at the
        counter, or have venue staff scan it / look it up by your booking reference. This checks you in and
        starts your session.
      </p>

      <h2>4. If You Can&apos;t Make It</h2>
      <p>
        See our <a href="/refund-policy">Cancellation &amp; Refunds Policy</a> — you can cancel up to 2 hours
        before your session for a full refund. Sessions not checked into by the end of the booked window are
        marked as a no-show.
      </p>

      <h2>5. Service Quality Issues at the Venue</h2>
      <p>
        If the hardware at the venue doesn&apos;t match what was listed, or the venue can&apos;t honor your
        booking, contact us via <a href="/contact">Contact Us</a> or the in-app Help &amp; Support with your
        booking reference — we&apos;ll work with the Café Partner to resolve it, which may include a refund.
      </p>
    </>
  );
}
