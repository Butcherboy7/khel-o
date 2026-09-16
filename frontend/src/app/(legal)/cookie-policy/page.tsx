import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Cookie Policy',
  description: 'What cookies and local storage KHEL-O uses, and why.',
};

export default function CookiePolicyPage() {
  return (
    <>
      <h1>Cookie Policy</h1>
      <p className="prose-legal-updated">Last updated: 16 September 2026</p>

      <p>
        This policy explains the cookies and browser storage KHEL-O (&quot;we&quot;, &quot;us&quot;) uses when
        you visit khel-o.online, and why. It should be read alongside our{' '}
        <a href="/privacy">Privacy Policy</a>.
      </p>

      <h2>1. We Don&apos;t Use Advertising or Tracking Cookies</h2>
      <p>
        KHEL-O does not run Google Analytics, Meta Pixel, or any third-party advertising/marketing tracker. We
        don&apos;t sell or share browsing data with ad networks, and we don&apos;t build advertising profiles of
        visitors.
      </p>

      <h2>2. What We Do Store, and Why</h2>
      <table>
        <thead>
          <tr>
            <th>Storage</th>
            <th>Purpose</th>
            <th>Type</th>
            <th>Retention</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Session/login tokens</td>
            <td>Keeps you signed in between visits</td>
            <td>Browser local storage (not a cookie)</td>
            <td>Until you log out or the token expires</td>
          </tr>
          <tr>
            <td>Selected city / location preference</td>
            <td>Remembers the city you&apos;re browsing cafés in</td>
            <td>Browser local storage</td>
            <td>Until you change it or clear site data</td>
          </tr>
          <tr>
            <td>Anonymous session ID &amp; referral source (e.g. <code>utm_source</code>)</td>
            <td>
              Lets us see which channel (e.g. Instagram, Google, a referral link) brought a signup to the
              Platform, purely in aggregate. Not used to build a cross-site advertising profile.
            </td>
            <td>Browser local storage</td>
            <td>Until you clear site data</td>
          </tr>
          <tr>
            <td>Google Sign-In session cookie</td>
            <td>Set by Google when you use &quot;Sign in with Google&quot;</td>
            <td>Third-party cookie, set by Google, governed by Google&apos;s own policy</td>
            <td>Controlled by Google</td>
          </tr>
          <tr>
            <td>Razorpay checkout cookies</td>
            <td>Set by Razorpay during the payment step, for fraud prevention on their end</td>
            <td>Third-party cookie, set by Razorpay, governed by Razorpay&apos;s own policy</td>
            <td>Controlled by Razorpay</td>
          </tr>
        </tbody>
      </table>

      <h2>3. Error Monitoring</h2>
      <p>
        We use Sentry to catch and diagnose crashes and bugs. This can include a session identifier and technical
        logs tied to your browser session, used only to debug the Platform — never for advertising.
      </p>

      <h2>4. Your Choices</h2>
      <p>
        Most of what&apos;s listed above is local storage, not a tracking cookie, and you can clear it any time
        from your browser&apos;s site-data settings — though doing so will log you out and reset saved
        preferences. Third-party cookies set by Google or Razorpay during sign-in/checkout are controlled by
        those providers&apos; own cookie settings, not ours.
      </p>

      <h2>5. Changes to This Policy</h2>
      <p>We may update this policy if what we store changes. Material changes will be reflected here with an updated &quot;Last updated&quot; date.</p>

      <h2>6. Contact</h2>
      <p>Questions about this policy? Reach us via the details on our <a href="/contact">Contact Us</a> page.</p>
    </>
  );
}
