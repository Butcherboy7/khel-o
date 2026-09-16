import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Café Partner Terms & Conditions',
  description: 'Terms and conditions governing gaming cafés that list on the KHEL-O platform.',
};

export default function OwnerTermsPage() {
  return (
    <>
      <h1>Café Partner Terms &amp; Conditions</h1>
      <p className="prose-legal-updated">Last updated: 16 September 2026</p>

      <p>
        These Café Partner Terms &amp; Conditions (&quot;Partner Terms&quot;) govern the relationship between
        KHEL-O — operated as a sole proprietorship by Mohammed Abdullah, based in Hyderabad, Telangana, India,
        under Udyam (MSME) registration — and any gaming café, lounge, or venue owner (&quot;Café Partner&quot;,
        &quot;you&quot;) that lists a venue on the KHEL-O platform (the &quot;Platform&quot;). These Partner Terms
        apply in addition to, not instead of, our general <a href="/terms">Terms &amp; Conditions</a>. By
        submitting an onboarding application or accepting a booking through the Platform, you agree to these
        Partner Terms.
      </p>

      <h2>1. Relationship Between KHEL-O and Café Partners</h2>
      <p>
        KHEL-O is a booking marketplace, not your employer, franchisor, or co-owner. Your venue, staff, hardware,
        licenses, and day-to-day operations remain entirely your responsibility. Nothing in these Partner Terms
        creates a partnership, joint venture, or agency relationship between KHEL-O and you.
      </p>

      <h2>2. Onboarding &amp; Verification</h2>
      <ul>
        <li>
          You must provide accurate business details during onboarding, including venue address, contact
          information, and (where applicable) PAN and GSTIN. Providing false or misleading business, hardware,
          or pricing information is grounds for suspension or removal from the Platform.
        </li>
        <li>
          KHEL-O&apos;s compliance team reviews applications before a venue goes live. Approval is at KHEL-O&apos;s
          discretion and does not constitute a guarantee of business volume or a warranty of your venue&apos;s
          legal compliance — you remain responsible for holding any local licenses, permits, gaming-parlour
          registrations, or shop &amp; establishment registrations required in your jurisdiction.
        </li>
      </ul>

      <h2>3. Listing Accuracy</h2>
      <p>
        You are responsible for keeping your listing accurate: hardware tiers and specs, pricing, opening hours,
        photos, amenities, and games supported. Bookings are made by gamers relying on this information — a
        listing that materially misrepresents hardware (e.g. advertising a tier you don&apos;t have) may be
        suspended pending correction.
      </p>

      <h2>4. Bookings &amp; Check-In</h2>
      <ul>
        <li>You (or your venue staff) must honor confirmed bookings for the reserved hardware tier, seat count, and time window.</li>
        <li>Check-in is performed by scanning or looking up the gamer&apos;s QR code / booking reference at the venue.</li>
        <li>If you are unable to honor a confirmed booking (e.g. hardware outage, venue closure), cancel it from the Owner Portal as early as possible — the gamer receives a full, automatic refund per our <a href="/refund-policy">Refund Policy</a>, at no cost to you beyond the lost booking revenue.</li>
      </ul>

      <h2>5. Pricing, Fees &amp; Payouts</h2>
      <ul>
        <li>You set your own hourly rates per hardware tier, subject to KHEL-O&apos;s reasonable review for accuracy.</li>
        <li>Gamers pay through the Platform via Razorpay. KHEL-O does not take a percentage commission on bookings beyond the payment-gateway fee and convenience fee already disclosed to the gamer at checkout, unless a different fee structure is agreed with you in writing.</li>
        <li>Payouts are made to the UPI ID (or bank account, if provided) you supply during onboarding, on the payout cadence shown in your Owner Portal. You are responsible for keeping payout details accurate and up to date — KHEL-O is not liable for a payout sent to an incorrect UPI ID or account you supplied.</li>
        <li>You are solely responsible for your own tax obligations (GST, income tax, or otherwise) on revenue earned through the Platform. KHEL-O does not act as your accountant or tax agent.</li>
      </ul>

      <h2>6. Refunds &amp; Cancellations</h2>
      <p>
        Refunds to gamers follow our <a href="/refund-policy">Cancellation &amp; Refunds Policy</a>. Where a
        refund is issued because of a venue-side failure (hardware down, venue closed, no staff to check the
        gamer in), that amount is not payable to you for that booking. Where a gamer cancels within policy before
        any fault of yours, you are not penalized.
      </p>

      <h2>7. Suspension &amp; Delisting</h2>
      <p>
        KHEL-O may suspend or remove a listing that receives repeated verified complaints, misrepresents its
        hardware or pricing, engages in fraud (including attempts to redirect gamers to pay outside the
        Platform for a listed slot), or violates these Partner Terms or applicable law. Where practical, we will
        notify you of the reason and give you an opportunity to respond before permanent removal.
      </p>

      <h2>8. Data You Receive About Gamers</h2>
      <p>
        We share the minimum booking details needed to honor a reservation (gamer name, booking reference, seat
        count, session time) with your venue staff. You may not use this data for marketing, resell it, or
        retain it beyond what is needed to operate the booking — see our <a href="/privacy">Privacy Policy</a>.
      </p>

      <h2>9. Reviews</h2>
      <p>
        Gamers may leave ratings and reviews after a completed booking. You may not submit, solicit, or pay for
        reviews of your own venue, and may not submit fake or incentivized reviews of competitors. KHEL-O may
        remove reviews found to violate this.
      </p>

      <h2>10. Limitation of Liability</h2>
      <p>
        KHEL-O&apos;s liability to you under these Partner Terms, for any claim arising from your use of the
        Platform, is limited to the payout amounts owed to you for the bookings giving rise to the claim. KHEL-O
        is not liable for indirect or consequential losses, including lost profits from a suspended listing.
      </p>

      <h2>11. Changes to These Partner Terms</h2>
      <p>We may update these Partner Terms as the Platform evolves. Material changes will be reflected here with an updated &quot;Last updated&quot; date, and significant changes affecting active Café Partners will also be emailed.</p>

      <h2>12. Contact</h2>
      <p>Questions about these Partner Terms? Reach us via the details on our <a href="/contact">Contact Us</a> page.</p>
    </>
  );
}
