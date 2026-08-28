import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Terms & Conditions',
  description: 'Terms and conditions governing the use of the KHEL-O gaming café booking platform.',
};

export default function TermsPage() {
  return (
    <>
      <h1>Terms &amp; Conditions</h1>
      <p className="prose-legal-updated">Last updated: 19 August 2026</p>

      <p>
        These Terms &amp; Conditions (&quot;Terms&quot;) govern your use of KHEL-O (&quot;we&quot;, &quot;us&quot;,
        &quot;our&quot;, the &quot;Platform&quot;), a website and mobile web application operated as a sole
        proprietorship by Mohammed Abdullah, based in Hyderabad, Telangana, India. KHEL-O lets gamers (&quot;Gamers&quot;,
        &quot;you&quot;) discover, compare, and book time-slots at gaming cafés (&quot;Café Partners&quot;) that
        list their stations on the Platform. By creating an account or making a booking, you agree to these Terms.
      </p>

      <h2>1. What KHEL-O Is and Isn&apos;t</h2>
      <p>
        KHEL-O is a booking marketplace. We connect you with independently owned and operated gaming cafés and
        facilitate slot reservations and online payment collection on their behalf. We do not own, operate, or
        staff any Café Partner venue. The hardware, seating, network quality, and in-venue conduct at a Café
        Partner is that partner&apos;s responsibility; KHEL-O verifies listings at onboarding but is not liable
        for a venue&apos;s day-to-day operation.
      </p>

      <h2>2. Accounts</h2>
      <ul>
        <li>You must provide accurate, current information when registering (name, email, and optionally phone number).</li>
        <li>You are responsible for keeping your login credentials confidential and for all activity under your account.</li>
        <li>Accounts are personal and non-transferable. We may suspend an account for fraud, abuse, repeated no-shows, or violation of these Terms.</li>
      </ul>

      <h2>3. Bookings</h2>
      <ul>
        <li>A booking reserves a specific hardware tier, seat count, date, and time window at a Café Partner.</li>
        <li>Prices shown at checkout include the station&apos;s hourly rate, a 2% payment gateway fee, and a flat ₹10 convenience fee — the full breakdown is always shown before you pay.</li>
        <li>A booking is confirmed only after successful payment. Unpaid/pending bookings are not held indefinitely and may be released.</li>
        <li>You must check in at the venue within your booked window. A QR check-in code is issued on confirmation and can be shown to venue staff or scanned by them.</li>
        <li>If a booked window ends without a check-in, the booking is automatically marked as a no-show (see Section 4).</li>
      </ul>

      <h2>4. Cancellations, Refunds &amp; No-Shows</h2>
      <p>
        Full details are in our <a href="/refund-policy">Cancellation &amp; Refunds Policy</a>. In summary:
        confirmed bookings can be cancelled free of charge up to 2 hours before the session start time, with a
        refund to your original payment method. Bookings not checked into by the end of the session window are
        marked as a no-show and are not eligible for a refund.
      </p>

      <h2>5. Payments</h2>
      <p>
        All payments are processed through Razorpay, a PCI-DSS compliant payment gateway. KHEL-O does not store
        your card, UPI, or net-banking credentials on its own servers — that data is handled entirely by Razorpay.
      </p>

      <h2>6. Café Partner Listings</h2>
      <p>
        Café Partners apply to list their venue and go through a verification step (business details, address,
        and hardware tiers) before appearing on the Platform. KHEL-O reserves the right to suspend or remove a
        listing that receives repeated verified complaints, misrepresents its hardware, or violates these Terms.
      </p>

      <h2>7. Acceptable Use</h2>
      <p>You agree not to: create multiple accounts to abuse promotions; make bookings you don&apos;t intend to honor; harass venue staff or other users; or attempt to bypass the Platform&apos;s payment flow to pay a Café Partner directly for a listed slot.</p>

      <h2>8. Limitation of Liability</h2>
      <p>
        KHEL-O is provided on an &quot;as is&quot; basis. To the extent permitted by law, we are not liable for
        indirect or consequential loss arising from your use of a Café Partner&apos;s venue, equipment, or staff
        conduct. Our liability for any claim relating to a booking is limited to the amount you paid for that
        booking.
      </p>

      <h2>9. Changes to These Terms</h2>
      <p>We may update these Terms as the Platform evolves. Material changes will be reflected here with an updated &quot;Last updated&quot; date.</p>

      <h2>10. Contact</h2>
      <p>Questions about these Terms? Reach us via the details on our <a href="/contact">Contact Us</a> page.</p>
    </>
  );
}
