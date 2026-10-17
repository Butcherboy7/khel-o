// Every word of the owner Tutorial. Plain English, one idea per step, and
// only things the app really does: check a claim against the page before
// changing it here. Names must match the menu (OwnerShell) exactly.
//
// A lesson spotlights real buttons on the real page. "tap" steps wait for
// that exact button (or Skip); "look" steps explain and have Next / Back;
// "practice" steps use a pretend customer so nothing real changes.

import { PAGE_GUIDES, type GuidePage } from '@/lib/ownerGuideCopy';

/** A `data-tour` id, or a form field found by its visible label text. */
export type TourTarget = string | { label: string };

export interface TourStep {
  kind: 'look' | 'tap' | 'practice';
  /** Route the step happens on. Nav steps work from anywhere. */
  page: string;
  target?: TourTarget;
  title: string;
  body: string;
  /** "How to get to this page": dropped when the lesson starts on its page. */
  nav?: boolean;
  /** Skipped when the target isn't on screen (More only exists on phones). */
  onlyIfVisible?: boolean;
  /** Only shown when the tap step before it really happened (a form opened). */
  afterTap?: boolean;
  /** Passed over when this is already on screen (a section already open). */
  skipIfFound?: TourTarget;
  /** Show the worked ₹150 example under the text. */
  moneyExample?: boolean;
}

export interface TourLesson {
  page: GuidePage;
  name: string;
  steps: TourStep[];
}

const D = '/owner/dashboard';

function navTo(href: string, label: string, viaMore = false): TourStep[] {
  const more: TourStep[] = viaMore
    ? [{
        kind: 'tap', page: '*', target: 'nav-more', nav: true, onlyIfVisible: true,
        title: 'Tap More', body: `${label} is in the menu.`,
      }]
    : [];
  return [
    ...more,
    { kind: 'tap', page: '*', target: `nav:${href}`, nav: true, title: `Tap ${label}`, body: 'Tap the lit-up button to open it.' },
  ];
}

export const TOUR_LESSONS: TourLesson[] = [
  {
    page: 'dashboard',
    name: 'Dashboard',
    steps: [
      {
        kind: 'look', page: D, target: 'dash-stats',
        title: 'Your day in three numbers',
        body: 'Money earned today, stations free right now, and customers who are late to check in.',
      },
      {
        kind: 'look', page: D, target: 'dash-arrivals',
        title: 'Who is coming today',
        body: 'Every booking for today. When someone reaches the desk, tap Check in next to their name.',
      },
      {
        kind: 'look', page: D, target: 'dash-seats',
        title: 'Keep seats for walk-ins',
        body: 'Use − and + to choose how many stations people can book in the app. The rest stay for walk-ins.',
      },
    ],
  },
  {
    page: 'scanner',
    name: 'Scan & check-in',
    steps: [
      ...navTo('/owner/scanner', 'Scan'),
      {
        kind: 'look', page: '/owner/scanner', target: 'scan-tabs',
        title: 'Three ways to find a booking',
        body: 'Camera reads the QR on their phone. Photo reads a screenshot. Name lets you type their name, phone or booking code.',
      },
      {
        kind: 'practice', page: '/owner/scanner',
        title: 'Practice: check Rahul in',
        body: 'Rahul has just shown you his pass. Green means he has paid. Tap Check in.',
      },
    ],
  },
  {
    page: 'bookings',
    name: 'Bookings',
    steps: [
      ...navTo('/owner/bookings', 'Bookings'),
      {
        kind: 'look', page: '/owner/bookings', target: 'bookings-days',
        title: 'Pick a day',
        body: 'It opens on today. Tap Tomorrow, or pick any date.',
      },
      {
        kind: 'look', page: '/owner/bookings', target: 'bookings-show',
        title: 'Find one kind of booking',
        body: '“Paid, not arrived”: the money is in. “Not paid yet”: not confirmed. “Never showed up”: paid but didn’t come.',
      },
    ],
  },
  {
    page: 'availability',
    name: 'Free slots',
    steps: [
      ...navTo('/owner/availability', 'Free slots'),
      {
        kind: 'look', page: '/owner/availability', target: 'slots-now',
        title: 'Free right now',
        body: 'How many stations are free, in use, and waiting for payment.',
      },
      {
        kind: 'look', page: '/owner/availability', target: 'slots-tiers',
        title: 'One setup at a time',
        body: 'Tap PS5, PC or any setup to see its hours. Look here before you promise a walk-in a time later in the day.',
      },
    ],
  },
  {
    page: 'tiers',
    name: 'Setups & prices',
    steps: [
      ...navTo('/owner/tiers', 'Setups & prices', true),
      {
        kind: 'tap', page: '/owner/tiers', target: 'tier-edit',
        title: 'Practice: change a price',
        body: 'Tap Edit. You’ll see the form, then close it without saving.',
      },
      {
        kind: 'tap', page: '/owner/tiers', target: 'tier-open', afterTap: true, skipIfFound: { label: 'Price per hour (₹)' },
        title: 'Open its details',
        body: 'Tap the name of your setup to see its numbers.',
      },
      {
        kind: 'look', page: '/owner/tiers', target: { label: 'Price per hour (₹)' }, afterTap: true,
        title: 'Price per hour',
        body: 'Customers see ₹1 less on a round price (₹149 for ₹150). KHEL-O pays you that ₹1.',
      },
      {
        kind: 'look', page: '/owner/tiers', target: { label: 'Bookable on KHEL-O app' }, afterTap: true,
        title: 'How many in the app',
        body: 'How many of these customers can book online. Keep the rest for walk-ins.',
      },
      {
        kind: 'tap', page: '/owner/tiers', target: 'tier-cancel', afterTap: true,
        title: 'Close without saving',
        body: 'This was practice. Tap Cancel and nothing changes.',
      },
    ],
  },
  {
    page: 'offers',
    name: 'Offers',
    steps: [
      ...navTo('/owner/offers', 'Offers', true),
      {
        kind: 'tap', page: '/owner/offers', target: 'offer-new',
        title: 'Practice: make an offer',
        body: 'Tap New offer. You’ll see the form, then close it without saving.',
      },
      {
        kind: 'look', page: '/owner/offers', target: 'offer-type', afterTap: true,
        title: 'Pick a kind of offer',
        body: '% off, a fixed price like ₹119 for 1 hour, or ₹ off. Customers get it at checkout by themselves, no code needed.',
      },
      {
        kind: 'look', page: '/owner/offers', target: 'offer-when', afterTap: true,
        title: 'Choose when it runs',
        body: 'One tap: Happy hours (10 AM–2 PM), Weekdays, Weekends or Late night.',
      },
      {
        kind: 'tap', page: '/owner/offers', target: 'offer-cancel', afterTap: true,
        title: 'Close without saving',
        body: 'This was practice. Tap Cancel and nothing changes.',
      },
    ],
  },
  {
    page: 'payouts',
    name: 'Payouts',
    steps: [
      ...navTo('/owner/payouts', 'Payouts', true),
      {
        kind: 'look', page: '/owner/payouts', moneyExample: true,
        title: 'How a booking pays you',
        body: 'You always get your own price. KHEL-O’s booking fee is added on top for the customer.',
      },
      {
        kind: 'look', page: '/owner/payouts', target: 'payout-stages',
        title: 'Where your money is now',
        body: '“Still clearing”: the bank is moving it (2–3 working days). “Ready to pay you”: KHEL-O sends it next. “Paid to you”: sent, with the bank’s UTR number.',
      },
      {
        kind: 'look', page: '/owner/payouts', target: 'payout-where',
        title: 'Where it is sent',
        body: 'Your UPI ID or bank account. Add it in Café Settings first. Nothing can be sent until you do.',
      },
    ],
  },
  {
    page: 'settings',
    name: 'Café settings',
    steps: [
      ...navTo('/owner/settings', 'Café Settings', true),
      {
        kind: 'look', page: '/owner/settings', target: 'settings-stop',
        title: 'The off switch',
        body: 'Pause: no new app bookings, walk-ins are fine. Emergency: nobody can book at all. Bookings already made stay valid either way.',
      },
    ],
  },
];

const INTRO: TourStep = {
  kind: 'look', page: D,
  title: 'Welcome to KHEL-O',
  body: 'This tutorial lights up the buttons you need, one at a time. About 3 minutes. Tap Skip any time, and replay a lesson from the Tutorial button on each page.',
};

const OUTRO: TourStep = {
  kind: 'look', page: D,
  title: 'You’re ready',
  body: 'Reviews, Insights, Alerts and Your Team are in the menu too. Every page has a Tutorial button at the top if you want a lesson again.',
};

/** One step as it plays, with its place in the lesson and the tour. */
export interface PlayStep extends TourStep {
  lessonName: string;
  lessonNo: number;
  lessonCount: number;
  stepNo: number;
  stepCount: number;
}

function number(lessons: { name: string; steps: TourStep[] }[]): PlayStep[] {
  return lessons.flatMap((lesson, li) =>
    lesson.steps.map((step, si) => ({
      ...step,
      lessonName: lesson.name,
      lessonNo: li + 1,
      lessonCount: lessons.length,
      stepNo: si + 1,
      stepCount: lesson.steps.length,
    })),
  );
}

/** The whole tutorial, dashboard first, walking page to page. */
export function fullTour(): PlayStep[] {
  const lessons = TOUR_LESSONS.map((l, i) => ({
    name: l.name,
    steps: i === 0 ? [INTRO, ...l.steps] : l.steps,
  }));
  lessons[lessons.length - 1] = { ...lessons[lessons.length - 1], steps: [...lessons[lessons.length - 1].steps, OUTRO] };
  return number(lessons);
}

/** One page's lesson, played on that page (no "how to get here" steps).
 *  Pages without a spotlight lesson get their tips as one card. */
export function pageLesson(page: GuidePage, href: string): PlayStep[] {
  const lesson = TOUR_LESSONS.find((l) => l.page === page);
  if (lesson) return number([{ name: lesson.name, steps: lesson.steps.filter((s) => !s.nav) }]);
  return number([{
    name: 'This page',
    steps: [{ kind: 'look', page: href, title: 'How this page works', body: PAGE_GUIDES[page].tips.join(' ') }],
  }]);
}
