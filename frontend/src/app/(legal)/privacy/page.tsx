import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description: 'How KHEL-O collects, uses, and protects your personal data.',
};

export default function PrivacyPage() {
  return (
    <>
      <h1>Privacy Policy</h1>
      <p className="prose-legal-updated">Last updated: 19 August 2026</p>

      <p>
        KHEL-O (&quot;we&quot;, &quot;us&quot;, &quot;our&quot;) respects your privacy. This policy explains what
        data we collect when you use our gaming café booking platform, why we collect it, and how it&apos;s
        protected.
      </p>

      <h2>1. Information We Collect</h2>
      <ul>
        <li><strong>Account information:</strong> full name, email address, phone number (optional), and a hashed password. We never store your password in plain text.</li>
        <li><strong>Booking information:</strong> the café, hardware tier, date/time, and seat count you book, plus your booking history.</li>
        <li><strong>Payment information:</strong> we do not collect or store card, UPI, or bank details ourselves. Payments are processed by Razorpay, and we only retain the payment status, amount, and Razorpay&apos;s transaction reference for our records.</li>
        <li><strong>Location:</strong> if you grant permission, we use your device&apos;s approximate location to show nearby cafés. You can decline this and search by city/area instead.</li>
        <li><strong>Usage data:</strong> basic technical logs (device type, IP address, pages visited) collected automatically to keep the Platform secure and to fix bugs, via our error-monitoring tool (Sentry).</li>
      </ul>

      <h2>2. How We Use Your Information</h2>
      <ul>
        <li>To create and manage your account and process your bookings.</li>
        <li>To send booking confirmations, reminders, and check-in QR passes.</li>
        <li>To share the minimum necessary booking details (your name, booking reference, seat count) with the Café Partner you&apos;ve booked, so their staff can check you in.</li>
        <li>To respond to support requests you submit.</li>
        <li>To detect and prevent fraud or abuse of the Platform.</li>
      </ul>

      <h2>3. Who We Share Data With</h2>
      <ul>
        <li><strong>Razorpay</strong> — to process your payment. Governed by Razorpay&apos;s own privacy policy.</li>
        <li><strong>The Café Partner you book with</strong> — your name, booking reference, and session time, so they can honor your reservation.</li>
        <li><strong>Sentry</strong> — limited technical error logs, used only to diagnose and fix bugs. Not used for advertising or profiling.</li>
      </ul>
      <p>We do not sell your personal data to third parties.</p>

      <h2>4. Data Retention</h2>
      <p>
        We retain account and booking data for as long as your account is active, and for a reasonable period
        afterward as required for accounting, dispute resolution, and legal compliance. You can request deletion
        of your account at any time via <a href="/contact">Contact Us</a>.
      </p>

      <h2>5. Your Rights</h2>
      <ul>
        <li>Access and correct the personal information in your profile at any time from the app.</li>
        <li>Request a copy of the data we hold about you.</li>
        <li>Request deletion of your account and associated personal data, subject to bookings/payment records we&apos;re legally required to retain.</li>
      </ul>

      <h2>6. Security</h2>
      <p>
        Passwords are hashed, not stored in plain text. Payment data never touches our servers — it&apos;s
        handled directly by Razorpay, a PCI-DSS compliant payment gateway. Access to booking and user data
        within KHEL-O is restricted by role (gamer, café owner, venue staff, admin), so venue staff can only see
        bookings for their own café.
      </p>

      <h2>7. Cookies &amp; Local Storage</h2>
      <p>
        We use browser local storage to keep you signed in and remember basic preferences (like your selected
        city). We do not use third-party advertising cookies.
      </p>

      <h2>8. Children</h2>
      <p>KHEL-O is intended for users aged 13 and above. If you believe a minor under 13 has created an account, contact us and we&apos;ll remove it.</p>

      <h2>9. Changes to This Policy</h2>
      <p>We may update this policy as the Platform evolves. Material changes will be reflected here with an updated &quot;Last updated&quot; date.</p>

      <h2>10. Contact</h2>
      <p>Questions about this policy or your data? Reach us via the details on our <a href="/contact">Contact Us</a> page.</p>
    </>
  );
}
