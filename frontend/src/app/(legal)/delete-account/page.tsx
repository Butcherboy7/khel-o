import type { Metadata } from 'next';
import { Suspense } from 'react';
import { DeleteAccountPanel } from '@/components/account/DeleteAccountPanel';

// Google Play's account-deletion policy: this URL goes in the Play Console
// Data safety form, and the app links here from Profile → Delete account.
export const metadata: Metadata = {
  alternates: { canonical: '/delete-account' },
  title: 'Delete your account',
  description: 'How to delete your KHEL-O account, what we delete and what we keep.',
};

export default function DeleteAccountPage() {
  return (
    <>
      <h1>Delete your KHEL-O account</h1>
      <p className="prose-legal-updated">Last updated: 18 October 2026</p>

      <p>
        You can delete your KHEL-O account yourself, right here or from <strong>Profile → Delete
        account</strong> in the app. It works the same on the website and in the Android app.
      </p>

      <Suspense fallback={null}>
        <DeleteAccountPanel />
      </Suspense>

      <h2>What we delete</h2>
      <ul>
        <li>Your name, email address, phone number, city and profile photo.</li>
        <li>Your password and your Google sign-in link, so nobody can sign in to the account again.</li>
        <li>Your game and activity preferences, notifications and push-notification subscriptions.</li>
        <li>Your contact details on any &ldquo;tell me when this café goes live&rdquo; list. Your vote still counts, without your name on it.</li>
        <li>Any staff access you had to a café.</li>
      </ul>

      <h2>What we keep, and why</h2>
      <p>
        Bookings and payments are also a café&apos;s business records and ours. We keep them for as long
        as Indian tax and accounting law requires, but they no longer carry your name or contact
        details: they show &ldquo;Deleted user&rdquo;. Reviews you wrote stay up under that name too.
        Support conversations are kept so we can deal with any dispute about a past booking.
      </p>

      <h2>Before you delete</h2>
      <ul>
        <li>
          <strong>Upcoming bookings:</strong> if you have a paid session that hasn&apos;t finished, cancel
          it from <a href="/bookings">My Bookings</a> (our <a href="/refund-policy">refund policy</a> applies)
          or wait until it&apos;s over.
        </li>
        <li>
          <strong>Café owners:</strong> your account holds your café and payouts, so we close it by hand.
          Press Delete and we&apos;ll settle what you&apos;re owed, take the café off KHEL-O and delete your
          details within 7 days.
        </li>
        <li>
          <strong>Launch lists</strong> (like the GTA 6 list) that you joined with just a phone number
          aren&apos;t tied to an account. To be removed, email{' '}
          <a href="mailto:support@khel-o.com?subject=Remove%20me%20from%20a%20launch%20list">support@khel-o.com</a>{' '}
          with that number.
        </li>
      </ul>

      <p>
        Questions? Read our <a href="/privacy">Privacy Policy</a> or write to{' '}
        <a href="mailto:support@khel-o.com">support@khel-o.com</a>.
      </p>
    </>
  );
}
