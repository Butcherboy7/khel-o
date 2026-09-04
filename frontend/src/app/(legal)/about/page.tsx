import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'About Us',
  description: 'Who builds KHEL-O and why — the gaming café booking platform for India.',
};

export default function AboutPage() {
  return (
    <>
      <h1>About KHEL-O</h1>

      <p>
        KHEL-O is a booking marketplace for gaming cafés in India. Gamers search for a café near them, compare
        hardware tiers and pricing, check real-time seat availability, and pay online — no calling ahead, no
        showing up to a full house. Café owners get a booking system, QR check-in, and online payment collection
        without having to build any of it themselves.
      </p>

      <h2>The problem we&apos;re solving</h2>
      <p>
        Gaming cafés in India have historically run on walk-ins and phone calls: no way to check seat availability
        remotely, no online payments, and no visibility for gamers searching for a good rig nearby. KHEL-O gives
        cafés a real booking and payments layer, and gives gamers a single place to discover and book a session at
        any participating venue.
      </p>

      <h2>Company</h2>
      <p>
        KHEL-O is operated as a sole proprietorship by Mohammed Abdullah, headquartered in Hyderabad, Telangana,
        India. The Platform is a software product — a Next.js web application backed by a Python/FastAPI service —
        built and operated in-house, not resold or white-labeled from another provider.
      </p>

      <h2>Get in touch</h2>
      <p>
        For partnership, press, or general enquiries, see our <a href="/contact">Contact Us</a> page.
      </p>
    </>
  );
}
