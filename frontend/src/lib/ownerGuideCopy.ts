// Every word of owner in-app guidance lives here, so wording can change
// without touching the pages. Page keys must match GuidePage in
// backend/app/api/v1/owner_guide.py.

export type GuidePage =
  | 'dashboard'
  | 'scanner'
  | 'bookings'
  | 'availability'
  | 'tiers'
  | 'offers'
  | 'reviews'
  | 'analytics'
  | 'notifications'
  | 'payouts'
  | 'staff'
  | 'settings';

interface PageGuide {
  /** Shown in the ⓘ beside the page title — one or two lines, always available. */
  info: string;
  /** "How this page works" bullets, shown for the first few visits. */
  tips: string[];
}

export const PAGE_GUIDES: Record<GuidePage, PageGuide> = {
  dashboard: {
    info: "Your café at a glance: who's arriving today, check-ins, and how many seats customers can book online.",
    tips: [
      "Today's arrivals are listed here. Check people in as they walk through the door.",
      'The badge by your café name shows if you’re open, paused, or in emergency mode.',
      'Use the + and − under “Seats open for online booking” to keep some seats for walk-ins.',
    ],
  },
  scanner: {
    info: "Checks a customer in by reading the QR pass on their phone. Their seat is then marked as in use.",
    tips: [
      'Point the camera at the QR code on the customer’s phone. It checks them in automatically.',
      'Camera not working? Upload a screenshot of their pass, or search their name.',
      'A red result means the pass isn’t valid for today. Don’t give them a seat until it’s sorted.',
    ],
  },
  bookings: {
    info: 'Every booking at your café, past and upcoming. Pick a date and a status to narrow it down.',
    tips: [
      'Pick a date, then use “Show” to see only paid, playing, finished or cancelled bookings.',
      '“Paid, not arrived” means the money is in. Let them play when they turn up.',
      '“Not paid yet” bookings aren’t guaranteed. You can free up that seat if nobody pays.',
    ],
  },
  availability: {
    info: "Hour-by-hour view of which seats are taken and which are free, for each type of station.",
    tips: [
      'Each row is one type of station, like PCs or PS5s. Each block is an hour.',
      'Coloured blocks are booked; empty blocks are free for customers to book.',
      'Check this before promising a walk-in a seat for later in the day.',
    ],
  },
  tiers: {
    info: 'Groups of machines that share a price, e.g. “Gaming PCs” or “PS5”. Customers book a group, not a specific machine.',
    tips: [
      'Make one group per kind of machine, and set its price per hour.',
      'The number of seats in a group is how many customers can book it at the same time.',
      'Hiding a group stops new bookings for it. Nothing is deleted.',
    ],
  },
  offers: {
    info: 'Discounts that apply automatically at checkout. Each offer also gets a code you can share or print as a QR.',
    tips: [
      'Choose % off, a fixed price, or a flat amount off, and set when it runs.',
      'Customers get the discount automatically at checkout, with no code needed.',
      'Share the offer’s code or QR on Instagram or at your counter to bring people in.',
    ],
  },
  reviews: {
    info: 'What customers wrote after playing here. Your replies are public.',
    tips: [
      'New reviews show up here after a customer finishes their session.',
      'Anything you reply is public, and everyone reading the review sees it.',
      'A short, polite reply to a bad review often matters more than the review itself.',
    ],
  },
  analytics: {
    info: 'Your busiest hours, which stations earn most, and how many customers come back.',
    tips: [
      'Busy hours tell you when to have more staff on the desk.',
      'Station earnings show which machines are worth adding more of.',
      'Returning customers is a good sign your café is doing well.',
    ],
  },
  notifications: {
    info: 'New bookings, cancellations and payment problems for your café, newest first.',
    tips: [
      'Every new booking, cancellation and payment problem lands here.',
      'Dismiss an alert once you’ve dealt with it to keep this list short.',
      'Turn on phone notifications so you don’t have to keep checking this page.',
    ],
  },
  payouts: {
    info: 'What customers paid, what KHEL-O kept, and what has reached your bank. Payouts go out weekly.',
    tips: [
      'Add your bank account details first. Nothing can be sent until you do.',
      'Each payout shows what customers paid, the KHEL-O fee, and what you receive.',
      'Payouts go out weekly. “Awaiting transfer” means it’s on its way, and “Failed” means contact support.',
    ],
  },
  staff: {
    info: 'Give the people who run your desk their own login, so nobody has to share yours.',
    tips: [
      'Tap “Invite someone” and enter their name and email. They’ll get a link to set up their login.',
      'Staff only see Dashboard, Scan, Bookings and Free seats. They never see prices, payouts or settings.',
      'Deactivate someone’s login the day they stop working for you.',
    ],
  },
  settings: {
    info: 'Your café details, opening hours, payout details, and the switches to stop taking bookings.',
    tips: [
      'Pausing stops new bookings in the app. You can still take walk-ins at the desk.',
      'Emergency mode means nobody can book at all. Bookings already made stay valid.',
      'Keep your address, phone and hours correct. Customers see them before they book.',
    ],
  },
};

// Inline ⓘ explanations for specific controls, keyed by where they sit.
export const INFO_TIPS = {
  bookingsStatusFilter:
    '“Not paid yet” = payment hasn’t gone through. “Paid, not arrived” = safe to let them in. “Never showed up” = paid but didn’t come.',
  dashboardOnlineSeats:
    'How many seats of each type customers can book in the app. The rest are kept for people who walk in.',
  settingsStopBookings:
    'Pause = no new app bookings, but walk-ins are fine. Emergency = nobody can book at all. Either way, bookings already made stay valid.',
} as const;

/** A page's tip box shows for this many visits unless dismissed for good. */
export const TIP_VISITS = 3;
/** ⓘ icons pulse for this many app sessions so new owners notice them. */
export const PULSE_SESSIONS = 5;
