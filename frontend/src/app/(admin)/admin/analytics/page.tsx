import { redirect } from 'next/navigation';

/** /admin/analytics has no page of its own; Traffic is the first analytics screen. */
export default function AdminAnalyticsIndex() {
  redirect('/admin/analytics/traffic');
}
