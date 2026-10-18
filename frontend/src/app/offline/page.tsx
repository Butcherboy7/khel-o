import type { Metadata } from 'next';

// Served by the service worker (next.config.js `fallbacks.document`) when a
// page can't load because the phone is offline. Without it the Android app
// would show Chrome's dinosaur page. Static on purpose: it must render from
// the precache with no network at all.
export const metadata: Metadata = {
  title: "You're offline",
  robots: { index: false },
};

export default function OfflinePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-surface px-6 text-center">
      {/* Plain <img>: next/image would route through the optimizer, which needs the network. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/icons/icon-192x192.png" alt="" width={96} height={96} className="rounded-3xl" />
      <h1 className="font-heading text-h2 font-bold text-text-primary">You&apos;re offline</h1>
      <p className="max-w-xs text-body text-text-secondary">
        KHEL-O needs the internet to show live seats and take bookings. Check your connection and
        try again. Your booking passes are safe.
      </p>
      {/* A plain link, not router.refresh(): reloads the page the person was on. */}
      <a
        href=""
        className="mt-2 inline-flex h-11 items-center rounded-xl bg-primary px-5 text-body font-semibold text-white"
      >
        Try again
      </a>
    </main>
  );
}
