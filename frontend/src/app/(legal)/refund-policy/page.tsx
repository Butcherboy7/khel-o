import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Cancellation & Refunds Policy',
  description: 'How cancellations, refunds, and no-shows work on KHEL-O.',
};

export default function RefundPolicyPage() {
  return (
    <>
      <h1>Cancellation &amp; Refunds Policy</h1>
      <p className="prose-legal-updated">Last updated: 19 August 2026</p>

      <p>
        This policy explains exactly when you can cancel a booking on KHEL-O, when you&apos;ll get a refund, and
        how long it takes. It applies to all bookings made through the Platform, at any Café Partner.
      </p>

      <h2>1. Cancelling a Confirmed Booking</h2>
      <p>
        You can cancel a <strong>confirmed, paid</strong> booking free of charge up to <strong>2 hours before</strong>{' '}
        the session&apos;s start time, directly from the &quot;My Booking Passes&quot; screen in the app.
        Cancellations requested within 2 hours of the session start time are not accepted through self-service
        cancellation, since the seat/hardware has already been held for you.
      </p>

      <h2>2. Refund Timeline</h2>
      <p>
        Once a cancellation is accepted, a refund is automatically initiated to your <strong>original payment
        method</strong> via Razorpay. Refunds typically reflect in your account within <strong>5–7 business
        days</strong>, depending on your bank or payment provider — this timeline is set by Razorpay and your
        bank, not by KHEL-O.
      </p>

      <h2>3. Bookings That Were Never Paid</h2>
      <p>
        A booking that was never completed (payment pending or failed) is not charged and does not require a
        refund — no money was collected.
      </p>

      <h2>4. No-Shows</h2>
      <p>
        If you do not check in at the venue before your booked session window ends, the booking is automatically
        marked as a <strong>no-show</strong>. No-show bookings are <strong>not eligible for a refund</strong>,
        since the Café Partner held the station for you for the full window.
      </p>

      <h2>5. Café-Initiated Cancellations</h2>
      <p>
        If a Café Partner cancels your booking (e.g. hardware outage, venue closure) or is placed in emergency
        mode by KHEL-O, you receive a <strong>full refund automatically</strong>, regardless of how close to the
        session time it happens.
      </p>

      <h2>6. Fees on Refunds</h2>
      <p>
        When a cancellation is eligible for a refund under this policy, the full amount you paid — including the
        2% gateway fee and ₹10 convenience fee — is refunded. We don&apos;t retain any portion of a valid refund.
      </p>

      <h2>7. How to Request Help</h2>
      <p>
        If a refund hasn&apos;t reflected after 7 business days, or you believe you were charged incorrectly,
        raise a &quot;Payment / refund&quot; ticket from the Help &amp; Support section in the app, or reach us
        via <a href="/contact">Contact Us</a>. Please include your booking reference (e.g.{' '}
        <code>GC-2026-XXXXXX</code>).
      </p>
    </>
  );
}
