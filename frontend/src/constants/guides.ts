/**
 * GTA 6 guides (/guides). Each article answers one real question and links to the KHEL-O page that
 * solves it. Facts here are limited to what is true today: GTA 6 released 19 November 2026 on PS5 and
 * Xbox Series X|S, with no PC release; KHEL-O sells PS5 time by the hour at partner cafés and does not
 * rent consoles to take home. `{price}` becomes the lowest live GTA 6 café price per hour, or is
 * removed when no café is listed. Update `updated` whenever an article's facts change.
 */
export interface GuideSection {
  h2: string;
  p: string[];
}

export interface Guide {
  slug: string;
  title: string;
  /** Meta description and the index-page summary. */
  description: string;
  /** The one-sentence answer shown first, so a reader or an AI answer gets it without scrolling. */
  answer: string;
  published: string;
  updated: string;
  sections: GuideSection[];
  /** The KHEL-O page this guide sends people to. */
  cta: { href: string; label: string };
}

export const GUIDES: Guide[] = [
  {
    slug: 'where-to-play-gta-6-in-hyderabad-without-ps5',
    title: 'Where to Play GTA 6 in Hyderabad Without Owning a PS5',
    description: 'No PS5? Here is where to play GTA 6 in Hyderabad: PS5 gaming cafés you can book by the hour, how booking works, and what it costs.',
    answer: 'You can play GTA 6 in Hyderabad at a gaming café that has a PS5. Book a time slot by the hour on KHEL-O, pay online and show your QR pass at the café.',
    published: '2026-11-24',
    updated: '2026-11-24',
    sections: [
      {
        h2: 'The short answer',
        p: [
          'GTA 6 came out on 19 November 2026 for PS5 and Xbox Series X|S. If you own neither, the quickest way to play in Hyderabad is a gaming café that already has the console and the game. You pay for the hours you play and nothing else.',
        ],
      },
      {
        h2: 'How to find a café that actually has GTA 6',
        p: [
          'Not every gaming café has a PS5, and not every PS5 café has the game ready. KHEL-O lists the partner cafés taking GTA 6 bookings, with the price per hour, opening hours and the café\'s own address. The list is read from the cafés\' live listings, so it only shows cafés that are taking bookings.',
          'The cafés are independent businesses, not KHEL-O branches. You book and pay on KHEL-O, then play at the café\'s own address.',
        ],
      },
      {
        h2: 'How much it costs',
        p: [
          'Cafés charge by the hour. Cafés on KHEL-O start from ₹{price} an hour, and each café shows its price before you pay. Your first KHEL-O booking has no booking fee.',
        ],
      },
      {
        h2: 'What to do on the day',
        p: [
          'Pick a café and a time, pay online, and go. At the café, show the QR pass from your booking at the desk. If you are going with friends, book the time for the whole group, since one PS5 is one booking.',
          'Not sure which café is free? Call or WhatsApp KHEL-O on +918142128389 (Monday to Saturday, 10:00 AM to 7:00 PM IST) and we will check which partner café has a PS5 free.',
        ],
      },
    ],
    cta: { href: '/gta6/hyderabad', label: 'See GTA 6 cafés in Hyderabad' },
  },
  {
    slug: 'how-to-play-gta-6-without-buying-a-console',
    title: 'How to Play GTA 6 Without Buying a Gaming Console',
    description: 'GTA 6 is on PS5 and Xbox Series X|S only. If you do not own one, here are the real options for playing without buying a console.',
    answer: 'GTA 6 only runs on PS5 and Xbox Series X|S, so without a console the practical way to play is by the hour at a gaming café that has a PS5.',
    published: '2026-11-24',
    updated: '2026-11-24',
    sections: [
      {
        h2: 'What GTA 6 runs on',
        p: [
          'GTA 6 released on 19 November 2026 for PS5 and Xbox Series X|S. It did not release for PS4 or PC, so an older console or a gaming PC will not run it.',
        ],
      },
      {
        h2: 'Your options if you do not own a console',
        p: [
          'Buy a console: the most expensive route, and only sensible if you will keep playing for months. Borrow a friend\'s: free, but it depends on a friend with a PS5 and spare time. Play at a gaming café: you pay per hour for a PS5 with the game ready, with nothing to buy.',
          'For most people who just want to see GTA 6, the café route costs a small fraction of a console and the game.',
        ],
      },
      {
        h2: 'Booking a café PS5',
        p: [
          'On KHEL-O you can compare PS5 cafés, see price per hour and opening hours, and book a slot online. You get a QR pass and show it at the café. Prices start from ₹{price} an hour.',
        ],
      },
      {
        h2: 'What about your save?',
        p: [
          'Ask the café how it handles saves. Many people play on the café\'s account for a session and treat it as a try-out rather than a long playthrough. If you want a long story playthrough on a console you own, the café is the way to try it first.',
        ],
      },
    ],
    cta: { href: '/gta6/without-ps5', label: 'Play GTA 6 without a PS5' },
  },
  {
    slug: 'can-you-rent-a-ps5-to-play-gta-6-in-india',
    title: 'Can You Rent a PS5 to Play GTA 6 in India?',
    description: 'Renting a PS5 to take home versus renting PS5 time at a gaming café: what each means for playing GTA 6 in India, and how KHEL-O fits in.',
    answer: 'You can rent PS5 time by the hour at a gaming café. KHEL-O does not rent consoles to take home; it lists partner cafés where you book a PS5 by the hour.',
    published: '2026-11-24',
    updated: '2026-11-24',
    sections: [
      {
        h2: 'Two things people mean by renting a PS5',
        p: [
          'Some people want a console delivered to their home for a week. Others want to pay by the hour to use a PS5 somewhere. Home console rental exists through a few local rental shops, and availability and deposits vary, so check the shop directly.',
          'KHEL-O does the second: you rent time on a PS5 at a partner gaming café.',
        ],
      },
      {
        h2: 'How hourly café rental works on KHEL-O',
        p: [
          'You choose a café, pick a time, and pay online. The café has the PS5 and GTA 6 ready. Cafés on KHEL-O start from ₹{price} an hour, and the price is shown before you pay.',
        ],
      },
      {
        h2: 'Which is cheaper?',
        p: [
          'For one or two sessions, an hourly café booking is usually cheaper than a home rental plus deposit, and there is nothing to set up or return. For a long playthrough at home, a rental or a purchase may make sense.',
        ],
      },
      {
        h2: 'Not sure? Ask us',
        p: [
          'Call or WhatsApp KHEL-O on +918142128389 and tell us your area and time. We will check which partner café has a PS5 free.',
        ],
      },
    ],
    cta: { href: '/gta6/price', label: 'See what GTA 6 costs per hour' },
  },
  {
    slug: 'best-ways-to-experience-gta-6-on-a-budget',
    title: 'Best Ways to Experience GTA 6 on a Budget',
    description: 'Ways to play GTA 6 without spending on a console and the game: café hours, splitting with friends, off-peak slots and earning free play time.',
    answer: 'The cheapest way to play GTA 6 is by the hour at a PS5 gaming café, ideally off-peak and split between friends. There is no legal free copy of the game.',
    published: '2026-11-24',
    updated: '2026-11-24',
    sections: [
      {
        h2: 'Pay by the hour, not for a console',
        p: [
          'A PS5 and the game cost far more than a few café sessions. On KHEL-O, PS5 cafés start from ₹{price} an hour, and each café shows its own price before you pay.',
        ],
      },
      {
        h2: 'Go off-peak',
        p: [
          'Weekday mornings and afternoons are usually quieter, and some cafés price them lower. Compare the café cards and check the opening hours.',
        ],
      },
      {
        h2: 'Split the hour with friends',
        p: [
          'One PS5 booking covers the time, so a group can share the cost and take turns. Our with-friends page explains how groups book.',
        ],
      },
      {
        h2: 'Use offers and your first booking',
        p: [
          'Your first KHEL-O booking has no booking fee, and any offers that apply are added at checkout.',
        ],
      },
      {
        h2: 'A note on "free" GTA 6',
        p: [
          'There is no legal free download of GTA 6, and sites that promise one are scams or malware. What KHEL-O offers is free play time you earn by joining the KHEL-O WhatsApp community and playing in a tournament.',
        ],
      },
    ],
    cta: { href: '/gta6/price', label: 'Compare café prices' },
  },
  {
    slug: 'gta-6-gaming-cafes-in-hyderabad-what-to-know',
    title: 'GTA 6 Gaming Cafés in Hyderabad: What You Need to Know',
    description: 'What to check before you go to a GTA 6 gaming café in Hyderabad: console, price, hours, booking, group size and how partner cafés work.',
    answer: 'Before going, check that the café has a PS5 with GTA 6, the price per hour, opening hours and whether your slot is booked. KHEL-O shows all of this for its partner cafés.',
    published: '2026-11-24',
    updated: '2026-11-24',
    sections: [
      {
        h2: 'What to check first',
        p: [
          'Console: GTA 6 runs on PS5 and Xbox Series X|S only. Price: cafés charge per hour. Hours: some cafés open late morning and close late at night. Booking: a booked slot keeps a console for you; walk-ins depend on what is free.',
        ],
      },
      {
        h2: 'How KHEL-O cafés work',
        p: [
          'The cafés on KHEL-O are independent partners. KHEL-O lists them, shows their live prices and hours, and handles online booking and payment. You play at the café\'s own address.',
          'Each café page shows its area, hours, setups and photos, so you can compare before you book.',
        ],
      },
      {
        h2: 'Getting there',
        p: [
          'Check the café\'s area on its page, plan the trip, and arrive a few minutes before your slot. Show your QR pass at the desk.',
        ],
      },
    ],
    cta: { href: '/gta6/gaming-cafe', label: 'See gaming cafés with GTA 6' },
  },
  {
    slug: 'how-to-find-a-gaming-cafe-near-you-to-play-gta-6',
    title: 'How to Find a Gaming Café Near You to Play GTA 6',
    description: 'A simple way to find a gaming café with GTA 6 near you: check the console, compare prices and hours, and book a slot before you travel.',
    answer: 'Use a list of cafés that confirm a PS5 and GTA 6, sort by distance, check price and hours, then book a slot. KHEL-O\'s GTA 6 near me page does this.',
    published: '2026-11-24',
    updated: '2026-11-24',
    sections: [
      {
        h2: 'Why a map search is not enough',
        p: [
          'A search for gaming cafés shows places that may have only PCs, or a PS5 without the game. Confirm the console and the game before you travel.',
        ],
      },
      {
        h2: 'A simple checklist',
        p: [
          'Does it have a PS5 or Xbox Series X|S? Is the price per hour shown? Are the opening hours right for you? Can you book a slot so the console is free when you arrive?',
        ],
      },
      {
        h2: 'Use KHEL-O\'s near-me page',
        p: [
          'The GTA 6 near me page lists the cafés taking GTA 6 bookings, with price, hours and a Book button. If your city has no café yet, you can ask us to bring one, or message +918142128389 on WhatsApp.',
        ],
      },
    ],
    cta: { href: '/gta6/near-me', label: 'GTA 6 near me' },
  },
  {
    slug: 'gta-6-pc-vs-ps5-what-indian-gamers-should-know',
    title: 'GTA 6 PC vs PS5: What Indian Gamers Should Know',
    description: 'GTA 6 released on PS5 and Xbox Series X|S with no PC release. What that means for Indian gamers who own a gaming PC or no console at all.',
    answer: 'GTA 6 is out on PS5 and Xbox Series X|S. There is no PC release, so a gaming PC cannot run it; a PS5 at a gaming café is the way to play without buying a console.',
    published: '2026-11-24',
    updated: '2026-11-24',
    sections: [
      {
        h2: 'Where GTA 6 is available',
        p: [
          'GTA 6 released on 19 November 2026 for PS5 and Xbox Series X|S. Rockstar has not released it for PC, so a powerful gaming PC does not help for now. Check Rockstar\'s official site for any future platform news.',
        ],
      },
      {
        h2: 'Beware of PC "downloads"',
        p: [
          'Because there is no PC release, any site offering a PC download or a free copy is not legitimate. Do not enter card details or install files from them.',
        ],
      },
      {
        h2: 'If you only have a gaming PC',
        p: [
          'You have two honest options: buy a console, or play on a PS5 at a gaming café. KHEL-O lists PS5 cafés you can book by the hour, from ₹{price} an hour.',
        ],
      },
    ],
    cta: { href: '/gta6/online', label: 'Book a PS5 for GTA 6' },
  },
];

export const GUIDE_BY_SLUG: Record<string, Guide> = Object.fromEntries(GUIDES.map((g) => [g.slug, g]));

/** Fills in the live lowest price, or says "a low hourly price" when no café is listed (never a made-up number). */
export function withGuidePrice(text: string, min: number | null): string {
  if (min != null) return text.replace(/\{price\}/g, String(min));
  return text.replace(/₹\{price\}(?: an hour|\/hr)?/g, 'a low hourly price');
}
