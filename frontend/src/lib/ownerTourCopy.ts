// Every word of the owner app tour. Plain English, one idea per line, and
// only things the app really does: check a claim against the page before
// changing it here. Names must match the menu (OwnerShell) exactly.

export interface TourStep {
  /** Page the tour opens behind this card. */
  href: string;
  title: string;
  lines: string[];
  /** Show the worked ₹150 example under the lines. */
  moneyExample?: boolean;
}

export const OWNER_TOUR: TourStep[] = [
  {
    href: '/owner/dashboard',
    title: 'Welcome to KHEL-O',
    lines: [
      'This quick tour shows what each part of the app does. It takes about 2 minutes.',
      'Tap Start to begin. You can skip it, and watch it again any time from Help & Support.',
    ],
  },
  {
    href: '/owner/dashboard',
    title: 'Dashboard: your day at a glance',
    lines: [
      'Today’s bookings and who is coming in.',
      '“Seats open for online booking”: use + and − to keep some stations free for walk-ins.',
      'The badge next to your café name says if you are Open, Paused or in Emergency mode.',
    ],
  },
  {
    href: '/owner/scanner',
    title: 'Scan & Check-in: when a customer arrives',
    lines: [
      'The customer shows a QR pass on their phone. Point your camera at it.',
      'Green means paid: let them play. Red means don’t give them a station yet.',
      'Camera not working? Type their name, phone number or booking code instead.',
    ],
  },
  {
    href: '/owner/bookings',
    title: 'Bookings: every booking, past and coming',
    lines: [
      '“Paid, not arrived”: the money is in. Let them play when they come.',
      '“Playing”: checked in and playing now.',
      '“Not paid yet”: not confirmed. “Never showed up”: paid but didn’t come.',
    ],
  },
  {
    href: '/owner/availability',
    title: 'Free slots: what is free, hour by hour',
    lines: [
      'Each row is one setup, like PS5 or Snooker table. Each block is an hour.',
      'Look here before you promise a walk-in a time later in the day.',
    ],
  },
  {
    href: '/owner/tiers',
    title: 'Setups & prices: what customers can book',
    lines: [
      'A setup is one kind of thing customers book: “PS5”, “Gaming PCs”, “Snooker table”.',
      'For each setup: how many you have, the price per hour, and the shortest and longest booking.',
      'Customers book a setup, not a machine. Your staff pick the exact one at check-in.',
    ],
  },
  {
    href: '/owner/offers',
    title: 'Offers: fill your quiet hours',
    lines: [
      'Give % off, a fixed price, or ₹ off. Customers get it at checkout by themselves, no code needed.',
      'Choose when it runs with one tap: Happy hours (10 AM–2 PM), Weekdays, Weekends or Late night.',
      'Every offer also gets a code and a QR you can share on Instagram or print for your counter.',
    ],
  },
  {
    href: '/owner/payouts',
    title: 'Your money: how a booking pays you',
    lines: [
      'You always get your own price. KHEL-O’s booking fee is added on top for the customer. It never comes out of your money.',
      'If your price is a round number, customers see ₹1 less (₹149, not ₹150). KHEL-O pays you that ₹1.',
      'If you run an offer, you get the offer price (₹120 with 20% off ₹150).',
    ],
    moneyExample: true,
  },
  {
    href: '/owner/payouts',
    title: 'Payouts: where your money is now',
    lines: [
      '“Still clearing”: the customer paid and the bank is moving it (2–3 working days).',
      '“Ready to pay you”: it has cleared. KHEL-O sends it to you next.',
      '“Paid to you”: sent to your UPI or bank, with the UTR number (the bank’s receipt number).',
      'Add your UPI ID in Café Settings first. Nothing can be sent until you do.',
    ],
  },
  {
    href: '/owner/settings',
    title: 'Café Settings: your details and the off switch',
    lines: [
      'Your address, phone, opening hours, photos and UPI ID. Customers see these before they book.',
      'Pause: no new app bookings, walk-ins are fine. Emergency: nobody can book at all.',
      'Either way, bookings already made stay valid.',
    ],
  },
  {
    href: '/owner/dashboard',
    title: 'That’s it. A few more things in the menu',
    lines: [
      'Reviews: what customers said. Your replies are public.',
      'Insights: your busy hours and which setups earn most.',
      'Alerts: new bookings and cancellations. Turn on phone alerts so you don’t miss one.',
      'Your Team: give staff their own login. They can’t see prices or money.',
    ],
  },
];
