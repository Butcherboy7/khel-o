/**
 * GTA 6 search pages by what people want ("play GTA 6 with friends", "at night"…).
 * Each one opens the KHEL-O home screen with the GTA 6 cafés on top; the words
 * below are what makes each page its own answer, so keep them specific and true.
 *
 * Rules for this copy:
 * - "Free" only ever with its condition: join the community and play the tournament.
 * - No claims about GTA 6's own online modes, PC or cloud versions beyond "PS5 and Xbox at launch".
 * - Prices, cafés and hours come from the live listings at render time, never from here.
 */
export type Gta6Sort = 'price' | 'late' | 'early';

export interface Gta6Intent {
  slug: string;
  /** <title>; "{price}" becomes the lowest live price per hour. */
  title: string;
  description: string;
  /** The visible headline on the GTA 6 block. */
  h1: string;
  /** One line under it. */
  line: string;
  /** Which cafés come first. */
  sort?: Gta6Sort;
  /** Short answer people came for, shown under the cafés. */
  body: string[];
  faq: { question: string; answer: string }[];
}

export const GTA6_INTENTS: Gta6Intent[] = [
  {
    slug: 'free',
    title: 'Play GTA 6 Free: Earn Play Time in a KHEL-O Tournament',
    description:
      'Want to play GTA 6 free? Join the KHEL-O gamer community and play our next tournament: players who take part earn free GTA 6 time at a PS5 café. Or book a PS5 from ₹{price}/hr.',
    h1: 'Play GTA 6 free: earn it in our tournament',
    line: 'Join the community, play the tournament, earn free GTA 6 time at a PS5 café.',
    body: [
      'GTA 6 is a paid game on PS5 and Xbox, so there is no legal way to download it for free. What KHEL-O offers is free play time you earn: join our WhatsApp gamer community and play in our next tournament, and everyone who takes part gets free GTA 6 time at a partner café, plus launch goodies.',
      'The rules and rewards are posted inside the community. If you would rather just play now, the cafés above take bookings by the hour.',
    ],
    faq: [
      {
        question: 'Can I play GTA 6 for free?',
        answer:
          'You can earn free GTA 6 play time at a PS5 café: join the KHEL-O WhatsApp community and play in our next tournament. Players who take part get free time as a reward. Free download sites for GTA 6 are scams or malware.',
      },
      {
        question: 'How do I get the free GTA 6 time?',
        answer: 'Join the community from this page, enter the next tournament posted there, and play. The reward and how to use it are posted in the community.',
      },
    ],
  },
  {
    slug: 'online',
    title: 'Play GTA 6 Online Without a Console: Book a PS5 from ₹{price}/hr',
    description:
      'GTA 6 is on PS5 and Xbox at launch, not PC. No console? Book a PS5 at a gaming café online on KHEL-O in a minute, from ₹{price}/hr, and walk in with a QR pass.',
    h1: 'Play GTA 6 without owning a console',
    line: 'Book a PS5 online in a minute. Walk in, show your QR, play.',
    body: [
      'At launch GTA 6 is a PS5 and Xbox Series X|S game. It is not on PC. If you do not own a console, the quickest way to play is a PS5 at a gaming café, booked online.',
      'On KHEL-O you pick a café, choose a time and pay online. You get a QR pass and show it at the desk. No membership, no deposit at the counter.',
    ],
    faq: [
      {
        question: 'Can I play GTA 6 on PC or online without a PS5?',
        answer: 'Not at launch. GTA 6 is announced for PS5 and Xbox Series X|S only. Without a console, book a PS5 at a gaming café on KHEL-O.',
      },
      {
        question: 'How do I book a GTA 6 slot online?',
        answer: 'Open a café on this page, pick a time, and pay online. You get a QR pass to show at the desk.',
      },
    ],
  },
  {
    slug: 'with-friends',
    title: 'Play GTA 6 With Friends at a PS5 Café from ₹{price}/hr',
    description:
      'Play GTA 6 with your friends at a PS5 gaming café: book side-by-side consoles for your group on KHEL-O, from ₹{price}/hr each. Pay online, walk in together.',
    h1: 'Play GTA 6 with your friends',
    line: 'Book consoles side by side for the whole group. Take turns, shout at the screen.',
    body: [
      'GTA 6 is more fun with your squad in the room. Book a PS5 for each friend at the same café and time, or share one console and pass the controller between missions.',
      'Each café shows how many consoles are free for your time, so you know the whole group fits before you go.',
    ],
    faq: [
      {
        question: 'Can my friends and I play GTA 6 together at a café?',
        answer: 'Yes. Book one PS5 each at the same café and time, or share a console. Each café page shows how many are free for the hour you pick.',
      },
      {
        question: 'How much does it cost for a group?',
        answer: 'Each console is charged per hour at the café\'s price, shown on its page before you pay. Splitting one console between friends costs the same as one booking.',
      },
    ],
  },
  {
    slug: 'with-college-friends',
    title: 'Play GTA 6 With College Friends: PS5 Cafés from ₹{price}/hr',
    description:
      'Bunk plan sorted. Play GTA 6 with your college friends at a PS5 café near campus, from ₹{price}/hr. Book on KHEL-O in a minute and walk in with a QR pass.',
    h1: 'GTA 6 with the college gang',
    line: 'After class, between classes, or the whole Saturday. Book a PS5 for the group.',
    body: [
      'A café is the easiest way for a college group to play GTA 6 without anyone buying a console. Book one PS5 each, or one between two, and split the bill.',
      'Pick a time after class; afternoons on weekdays are usually the easiest to get.',
    ],
    faq: [
      {
        question: 'Is a gaming café cheaper than buying a PS5 for GTA 6?',
        answer: 'For most students, yes. A PS5 and the game cost tens of thousands of rupees; a café charges by the hour, and you can split one console between friends.',
      },
      {
        question: 'When is the best time to book with friends?',
        answer: 'Weekday afternoons are usually free. Weekends and evenings fill first, so book early for a big group.',
      },
    ],
  },
  {
    slug: 'alone',
    title: 'Play GTA 6 Solo at a PS5 Café: Your Own Console from ₹{price}/hr',
    description:
      'Just you and the open world. Book your own PS5 at a gaming café to play GTA 6 solo, from ₹{price}/hr on KHEL-O. Quiet hours, your own screen, no waiting.',
    h1: 'Play GTA 6 solo',
    line: 'Your own PS5, your own screen, your story. Book an hour or the whole afternoon.',
    body: [
      'Want to play the story at your own pace? Book a single PS5 for as long as you like. Weekday mornings and afternoons are the quietest hours at most cafés.',
      'Cafés keep your console for the time you booked, so there is no queue when you walk in.',
    ],
    faq: [
      {
        question: 'Can I book a PS5 just for myself?',
        answer: 'Yes. Book one console for the hours you want. It is kept for you for that time.',
      },
      {
        question: 'Will my GTA 6 story save at the café?',
        answer: 'Ask the café when you arrive. Most let you sign in to your own PlayStation account so your progress stays with you.',
      },
    ],
  },
  {
    slug: 'at-night',
    title: 'Play GTA 6 at Night: Late-Night PS5 Cafés from ₹{price}/hr',
    description:
      'Night owl? Find PS5 gaming cafés open late to play GTA 6 at night, some open 24 hours. See each café\'s hours and book your late slot on KHEL-O from ₹{price}/hr.',
    h1: 'Play GTA 6 late at night',
    line: 'Cafés open late come first. Check the hours on each card.',
    sort: 'late',
    body: [
      'GTA 6 hits different after dark. The cafés open latest are listed first, with their hours on each card; some are open all night.',
      'Late-night and early-morning sessions outside a café\'s normal hours are special sessions: you reserve them with a small booking fee and pay the rest at the café.',
    ],
    faq: [
      {
        question: 'Are there gaming cafés open at night for GTA 6?',
        answer: 'Yes. The cafés on this page are sorted by how late they stay open, and each card shows its hours. Some are open 24 hours.',
      },
      {
        question: 'How do late-night GTA 6 sessions work?',
        answer: 'Times inside the café\'s normal hours are normal bookings. Special late-night sessions outside those hours are reserved with a small booking fee, and you pay the rest at the café.',
      },
    ],
  },
  {
    slug: 'in-the-morning',
    title: 'Play GTA 6 in the Morning: Early PS5 Café Slots from ₹{price}/hr',
    description:
      'Beat the crowd. Book an early-morning PS5 slot to play GTA 6 before work or college, from ₹{price}/hr. Cafés that open earliest are listed first on KHEL-O.',
    h1: 'Play GTA 6 first thing in the morning',
    line: 'The quietest hours of the day. Cafés that open earliest come first.',
    sort: 'early',
    body: [
      'Mornings are the easiest time to get a PS5 at a café: fewer people and the pick of the consoles. The cafés that open earliest are listed first.',
      'Early-morning sessions before a café\'s normal opening time are special sessions, reserved with a small booking fee.',
    ],
    faq: [
      {
        question: 'What time do gaming cafés open?',
        answer: 'Each café sets its own hours; they are on every card on this page. Some open at 10 AM, some are open 24 hours.',
      },
      {
        question: 'Is morning a good time to play GTA 6 at a café?',
        answer: 'Yes. Mornings are the quietest, so it is the easiest time to get a console without booking far ahead.',
      },
    ],
  },
  {
    slug: 'without-ps5',
    title: 'How to Play GTA 6 Without a PS5: Book a Café PS5 from ₹{price}/hr',
    description:
      'No PS5 or Xbox? You can still play GTA 6: book a PS5 at a gaming café near you on KHEL-O from ₹{price}/hr. No console to buy, no game to buy.',
    h1: 'No PS5? Play GTA 6 at a café',
    line: 'No console to buy, no game to buy. Pay by the hour.',
    body: [
      'GTA 6 needs a PS5 or an Xbox Series X|S. If you have neither, a gaming café has both the console and the game ready, and you pay only for the hours you play.',
      'Book a time on KHEL-O, show your QR pass at the desk, and play.',
    ],
    faq: [
      {
        question: 'Can I play GTA 6 without buying a PS5?',
        answer: 'Yes. Book a PS5 at a gaming café by the hour. The café has the console and the game.',
      },
      {
        question: 'Does GTA 6 run on PS4 or PC?',
        answer: 'No. At launch GTA 6 is on PS5 and Xbox Series X|S only.',
      },
    ],
  },
  {
    slug: 'price',
    title: 'GTA 6 Café Price: Play GTA 6 from ₹{price} an Hour',
    description:
      'How much does it cost to play GTA 6 at a gaming café? PS5 cafés on KHEL-O charge from ₹{price}/hr. See every café\'s price before you pay and book online.',
    h1: 'What it costs to play GTA 6 at a café',
    line: 'Every café\'s price per hour, before you pay.',
    sort: 'price',
    body: [
      'Cafés charge by the hour for a PS5 with GTA 6. The price on each card is what you pay per hour; the café page shows the total before you pay.',
      'Your first KHEL-O booking has no booking fee, and offers are applied for you at checkout.',
    ],
    faq: [
      {
        question: 'How much does it cost to play GTA 6 at a gaming café?',
        answer: 'PS5 cafés on KHEL-O charge from ₹{price} an hour for GTA 6. Each café shows its own price before you pay.',
      },
      {
        question: 'Is it cheaper than buying the game?',
        answer: 'For a few sessions, yes. You pay only for the hours you play, with no console or game to buy.',
      },
    ],
  },
  {
    slug: 'gaming-cafe',
    title: 'GTA 6 Gaming Café Near Me: PS5 Cafés with GTA 6 from ₹{price}/hr',
    description:
      'Find a gaming café with GTA 6 near you. PS5 cafés on KHEL-O with GTA 6 ready, from ₹{price}/hr. See hours and photos, book online, walk in with a QR pass.',
    h1: 'Gaming cafés with GTA 6',
    line: 'PS5 cafés with GTA 6 ready to play. Photos, hours and price on every card.',
    body: [
      'These gaming cafés have GTA 6 on PS5 and take bookings on KHEL-O. Cafés marked "Pre-ordered" had the game on launch day.',
      'Don\'t see a café near you? Tap "Your city not listed?" and we\'ll bring one on.',
    ],
    faq: [
      {
        question: 'Which gaming cafés have GTA 6?',
        answer: 'The cafés listed on this page have GTA 6 on PS5 and take bookings on KHEL-O.',
      },
      {
        question: 'Do I need to book before going?',
        answer: 'Booking keeps a console for you for the time you picked. Walk-ins depend on what is free.',
      },
    ],
  },
  {
    slug: 'today',
    title: 'Play GTA 6 Today: Book a PS5 Café Slot Now from ₹{price}/hr',
    description:
      'GTA 6 is out. Play it today at a PS5 gaming café: see which cafés are open now, book a slot in a minute on KHEL-O from ₹{price}/hr, and walk in.',
    h1: 'Play GTA 6 today',
    line: 'See who is open right now and book a slot in a minute.',
    body: [
      'GTA 6 came out on 19 November 2026. The cafés above show whether they are open right now; pick one, choose a time today, and pay online.',
      'Show your QR pass at the desk when you arrive.',
    ],
    faq: [
      {
        question: 'Can I play GTA 6 today at a café?',
        answer: 'Yes, if a café near you has a console free. Each card shows whether the café is open now; the café page shows today\'s free times.',
      },
      {
        question: 'When did GTA 6 release?',
        answer: 'GTA 6 released on 19 November 2026 on PS5 and Xbox Series X|S.',
      },
    ],
  },
];

export const GTA6_INTENT_BY_SLUG: Record<string, Gta6Intent> = Object.fromEntries(GTA6_INTENTS.map((i) => [i.slug, i]));

export const withPrice = (text: string, price: number | null) => (price != null ? text.replace(/\{price\}/g, String(price)) : text.replace(/ from ₹\{price\}(\/hr| an hour| each)?/g, '').replace(/₹\{price\}/g, 'a fair hourly price'));
