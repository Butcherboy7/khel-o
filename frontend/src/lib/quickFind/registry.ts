/**
 * The one list of everything Quick Find can open or start in the owner portal.
 *
 * Static items are the portal's pages, settings and flows. Live items are made
 * from the café's own data (setups, launch drops and their consoles, today's
 * bookings) plus whatever the owner typed (a day, a length, "PS5 2").
 *
 * Rules: `go` items only navigate. `flow` items open the page's own editor with
 * the context filled in — the owner still checks it and confirms there. Nothing
 * here ever changes data by itself.
 */
import type { ParsedQuery } from './parse';
import { addDaysIso, labelNumber, machineFits } from './parse';

export type QFGroup = 'action' | 'bookings' | 'setups' | 'settings' | 'pages';
export type QFKind = 'go' | 'flow';
export type QFRole = 'owner' | 'staff';
export type QFIcon =
  | 'dashboard' | 'scan' | 'bookings' | 'calendar' | 'slots' | 'setups' | 'add' | 'wrench' | 'price' | 'offer'
  | 'drop' | 'walkin' | 'block' | 'clock' | 'pause' | 'emergency' | 'team' | 'wallet' | 'bank' | 'settings'
  | 'store' | 'map' | 'photo' | 'games' | 'star' | 'chart' | 'bell' | 'help' | 'tutorial' | 'lock' | 'share'
  | 'cancel' | 'unpaid' | 'user' | 'challenge' | 'seats' | 'guide' | 'eye';

export interface QFItem {
  id: string;
  title: string;
  /** One line under the title: what it does or what it is. */
  description: string;
  /** Where it lives, so the owner learns the map ("Café settings"). */
  where: string;
  group: QFGroup;
  icon: QFIcon;
  kind: QFKind;
  href: string;
  /** Words and phrases an owner might type for this, beyond the title. */
  keywords: string[];
  roles: QFRole[];
  /** Added to the text score: live items that fit what was typed rank above generic ones. */
  boost?: number;
  /** An action handled by the palette itself instead of a link. */
  run?: 'tutorial';
}

export interface QFSetup {
  id: string;
  name: string;
  platform?: string | null;
  model?: string | null;
  tierType?: string | null;
  isActive?: boolean;
  isRoom?: boolean;
  pricePerHour?: number;
  totalSeats?: number;
}

export interface QFConsole { key: string; label: string; platform?: string | null; setup?: string }

export interface QFDrop {
  id: string;
  title: string;
  game?: string;
  status: 'draft' | 'live' | 'cancelled';
  consoles: QFConsole[];
  flexible: boolean;
  startsOn?: string | null;
  endsOn?: string | null;
}

export interface QFBookingHit {
  id: string;
  reference: string;
  name: string;
  phone?: string | null;
  startTime: string;
  endTime: string;
  status: string;
}

export interface QFContext {
  role: QFRole;
  setups: QFSetup[];
  drops: QFDrop[];
  hostingChallenge: boolean;
  bookings: QFBookingHit[];
  now?: Date;
}

const OWNER: QFRole[] = ['owner'];
const BOTH: QFRole[] = ['owner', 'staff'];

/* ── Static items ───────────────────────────────────────────────────────── */

const STATIC: QFItem[] = [
  // Today
  { id: 'dashboard', title: 'Dashboard', description: "Today's takings, arrivals and what's on now", where: 'Today', group: 'pages', icon: 'dashboard', kind: 'go', href: '/owner/dashboard', keywords: ['home', 'overview', 'summary', 'today', 'main', 'start'], roles: BOTH },
  { id: 'scan', title: 'Scan a pass', description: "Check a customer in with the QR on their phone", where: 'Scan & check in', group: 'action', icon: 'scan', kind: 'go', href: '/owner/scanner', keywords: ['scan', 'qr', 'check in', 'checkin', 'arrived', 'customer came', 'camera', 'verify pass'], roles: BOTH },
  { id: 'scan-manual', title: 'Check in by name, phone or code', description: "When the QR won't scan: type their name, number or booking code", where: 'Scan & check in', group: 'action', icon: 'user', kind: 'go', href: '/owner/scanner?tab=manual', keywords: ['manual check in', 'qr not working', 'no qr', 'type code', 'booking code', 'search customer'], roles: BOTH },

  // Bookings
  { id: 'bookings-today', title: "Today's bookings", description: 'Who is coming today, paid or not', where: 'Bookings', group: 'bookings', icon: 'bookings', kind: 'go', href: '/owner/bookings?day=today', keywords: ['today bookings', 'todays bookings', 'manage bookings', 'arrivals', 'who is coming'], roles: BOTH },
  { id: 'bookings-tomorrow', title: "Tomorrow's bookings", description: 'Everyone booked for tomorrow', where: 'Bookings', group: 'bookings', icon: 'calendar', kind: 'go', href: '/owner/bookings?day=tomorrow', keywords: ['tomorrow bookings', 'next day'], roles: BOTH },
  { id: 'bookings-upcoming', title: 'Upcoming bookings', description: 'Every booking from today onwards', where: 'Bookings', group: 'bookings', icon: 'calendar', kind: 'go', href: '/owner/bookings?day=upcoming', keywords: ['future bookings', 'coming up', 'next bookings', 'advance bookings'], roles: BOTH },
  { id: 'bookings-all', title: 'All bookings', description: 'Every booking, past and upcoming', where: 'Bookings', group: 'bookings', icon: 'bookings', kind: 'go', href: '/owner/bookings?day=all', keywords: ['booking list', 'history', 'every booking', 'manage bookings', 'reservations'], roles: BOTH },
  { id: 'bookings-past', title: 'Past bookings', description: 'Sessions that have finished', where: 'Bookings', group: 'bookings', icon: 'bookings', kind: 'go', href: '/owner/bookings?day=all&status=completed', keywords: ['finished', 'completed', 'old bookings', 'history', 'previous'], roles: BOTH },
  { id: 'bookings-unpaid', title: 'Bookings not paid yet', description: 'Started but never paid — you can free the time for others', where: 'Bookings', group: 'bookings', icon: 'unpaid', kind: 'go', href: '/owner/bookings?day=all&status=pending_payment', keywords: ['pending payments', 'unpaid', 'payment pending', 'not paid', 'free up time', 'release'], roles: BOTH },
  { id: 'bookings-cancelled', title: 'Cancelled bookings', description: 'Cancelled bookings and refunds. KHEL-O sends refunds to the customer', where: 'Bookings', group: 'bookings', icon: 'cancel', kind: 'go', href: '/owner/bookings?day=all&status=cancelled', keywords: ['cancelled', 'cancellations', 'refunds', 'refund', 'money back'], roles: BOTH },
  { id: 'bookings-noshow', title: 'No-shows', description: 'Paid but never came', where: 'Bookings', group: 'bookings', icon: 'cancel', kind: 'go', href: '/owner/bookings?day=all&status=no_show', keywords: ['no show', 'never showed up', 'absent', 'did not come'], roles: BOTH },
  { id: 'bookings-playing', title: 'Playing now', description: 'Who is on a machine right now', where: 'Bookings', group: 'bookings', icon: 'user', kind: 'go', href: '/owner/bookings?day=today&status=active', keywords: ['in use', 'active', 'current', 'occupied', 'live'], roles: BOTH },

  // Free slots
  { id: 'slots', title: 'Free slots', description: "What's free and what's taken, hour by hour", where: 'Today', group: 'pages', icon: 'slots', kind: 'go', href: '/owner/availability', keywords: ['availability', 'free', 'empty', 'occupancy', 'hour by hour', 'timeline', 'setup availability', 'which free'], roles: BOTH },

  // Setups & prices
  { id: 'setups', title: 'Setups & prices', description: 'What customers can book and the price per hour', where: 'Your café', group: 'setups', icon: 'setups', kind: 'go', href: '/owner/tiers', keywords: ['manage setups', 'gaming setups', 'setup', 'console', 'consoles', 'machines', 'playstation', 'manage xbox', 'edit ps5', 'pc inventory', 'hourly pricing', 'price list', 'rate card', 'tiers', 'equipment'], roles: OWNER },
  { id: 'setup-add', title: 'Add a setup', description: 'PCs, a PS5, an Xbox, a cabin or a snooker table', where: 'Setups & prices', group: 'setups', icon: 'add', kind: 'flow', href: '/owner/tiers?add=1', keywords: ['add console', 'new console', 'add pc', 'add ps5', 'add xbox', 'add machine', 'new setup', 'add table', 'add cabin'], roles: OWNER },
  { id: 'broken', title: 'Mark a machine broken', description: "Under repair: customers can't book it until you mark it fixed", where: 'Setups & prices', group: 'action', icon: 'wrench', kind: 'flow', href: '/owner/tiers?qf=broken', keywords: ['broken', 'maintenance', 'repair', 'out of order', 'not working', 'faulty', 'equipment maintenance', 'block console', 'mark fixed'], roles: OWNER },
  { id: 'broken-staff', title: 'Mark a machine broken', description: "Under repair: customers can't book it until it's fixed", where: 'Free slots', group: 'action', icon: 'wrench', kind: 'flow', href: '/owner/availability?qf=broken', keywords: ['broken', 'maintenance', 'repair', 'out of order', 'not working', 'faulty', 'mark fixed'], roles: ['staff'] },
  { id: 'booking-length', title: 'Shortest and longest booking', description: 'Per setup: the least and most time a customer can book', where: 'Setups & prices', group: 'settings', icon: 'clock', kind: 'go', href: '/owner/tiers', keywords: ['minimum booking', 'minimum duration', 'min hours', 'maximum booking', 'booking duration', 'length prices', 'packages', 'default length'], roles: OWNER },
  { id: 'coop', title: 'Co-op price for friends', description: 'A price for 2 or more players sharing one PS5 or Xbox', where: 'Setups & prices', group: 'settings', icon: 'team', kind: 'go', href: '/owner/tiers', keywords: ['co op', 'coop', 'shared console', 'two players', 'extra player price', 'multiplayer'], roles: OWNER },
  { id: 'cabins', title: 'Private cabins', description: 'A room price plus a price per PC', where: 'Setups & prices', group: 'settings', icon: 'store', kind: 'go', href: '/owner/tiers', keywords: ['cabin', 'private room', 'room booking'], roles: OWNER },
  { id: 'setup-off', title: 'Turn a setup off', description: 'Hide it from customers; nothing is deleted', where: 'Setups & prices', group: 'settings', icon: 'eye', kind: 'go', href: '/owner/tiers', keywords: ['hide setup', 'remove setup', 'disable setup', 'delete console', 'turn on'], roles: OWNER },
  { id: 'setup-photos', title: 'Photos of a setup', description: 'Show customers the actual PCs or consoles', where: 'Setups & prices', group: 'settings', icon: 'photo', kind: 'go', href: '/owner/tiers', keywords: ['setup photos', 'console photos', 'pc photos', 'pictures'], roles: OWNER },
  { id: 'seat-split', title: 'Seats on the app vs walk-ins', description: 'How many of each setup customers can book online', where: 'Dashboard', group: 'settings', icon: 'seats', kind: 'go', href: '/owner/dashboard?qf=seats', keywords: ['walk in seats', 'app seats', 'online seats', 'bookable', 'keep for walkins', 'how many online'], roles: OWNER },
  { id: 'walkin-normal', title: 'Walk-in customers', description: 'Walk-ins play on the seats you keep off the app. Change how many here', where: 'Dashboard', group: 'action', icon: 'walkin', kind: 'go', href: '/owner/dashboard?qf=seats', keywords: ['mark walk in', 'walk in sale', 'walkin', 'sold at counter', 'cash customer', 'offline sale', 'sell'], roles: OWNER },

  // Offers
  { id: 'offers', title: 'Offers', description: 'Discounts and happy hours you are running', where: 'Your café', group: 'pages', icon: 'offer', kind: 'go', href: '/owner/offers', keywords: ['special offers', 'discounts', 'deals', 'promotions', 'coupons'], roles: OWNER },
  { id: 'offer-new', title: 'New offer', description: 'A discount, a happy hour or a first-booking deal', where: 'Offers', group: 'action', icon: 'add', kind: 'flow', href: '/owner/offers?new=1', keywords: ['create offer', 'add discount', 'happy hour', 'new deal', 'run a sale', 'promo code'], roles: OWNER },

  // Drops
  { id: 'drops', title: 'Launch drops', description: 'Pre-sold seats for a big game launch', where: 'Your café', group: 'bookings', icon: 'drop', kind: 'go', href: '/owner/drops', keywords: ['events', 'gta 6', 'gta', 'launch', 'event booking', 'reservations', 'manage launch drops'], roles: OWNER },
  { id: 'drop-new', title: 'New launch drop', description: 'Sell seats for a game launch before the day', where: 'Launch drops', group: 'action', icon: 'add', kind: 'flow', href: '/owner/drops?new=1', keywords: ['create event', 'new event', 'gta 6 drop', 'create drop'], roles: OWNER },
  { id: 'gta-guide', title: 'GTA 6 guide for owners', description: 'How the GTA 6 launch works at your café, step by step', where: 'Launch drops', group: 'pages', icon: 'guide', kind: 'go', href: '/owner/gta6-guide', keywords: ['gta 6 help', 'how gta works', 'launch guide'], roles: OWNER },

  // Your café
  { id: 'reviews', title: 'Reviews', description: 'What customers said about your café', where: 'Your café', group: 'pages', icon: 'star', kind: 'go', href: '/owner/reviews', keywords: ['ratings', 'feedback', 'stars', 'comments'], roles: OWNER },
  { id: 'insights', title: 'Insights', description: 'Busy hours, trends and what to try next', where: 'Your café', group: 'pages', icon: 'chart', kind: 'go', href: '/owner/analytics', keywords: ['analytics', 'stats', 'busy hours', 'peak time', 'reports', 'performance'], roles: OWNER },
  { id: 'alerts', title: 'Alerts', description: 'Updates and messages from KHEL-O', where: 'Your café', group: 'pages', icon: 'bell', kind: 'go', href: '/owner/notifications', keywords: ['notifications', 'messages', 'updates', 'inbox'], roles: OWNER },

  // Money & account
  { id: 'payouts', title: 'Payouts', description: 'What you have been paid, and what is on the way', where: 'Money & account', group: 'pages', icon: 'wallet', kind: 'go', href: '/owner/payouts', keywords: ['payments', 'earnings', 'money', 'settlement', 'income', 'when do i get paid'], roles: OWNER },
  { id: 'payout-bank', title: 'Bank account for payouts', description: 'Where KHEL-O sends your money', where: 'Café settings', group: 'settings', icon: 'bank', kind: 'go', href: '/owner/settings?qf=payout', keywords: ['bank details', 'upi', 'account number', 'ifsc', 'payment details', 'change bank'], roles: OWNER },
  { id: 'team', title: 'Your team', description: 'Staff logins for your desk', where: 'Money & account', group: 'pages', icon: 'team', kind: 'go', href: '/owner/staff', keywords: ['staff management', 'employees', 'staff list', 'remove staff'], roles: OWNER },
  { id: 'team-invite', title: 'Add someone to your team', description: 'Give a staff member their own login', where: 'Your team', group: 'action', icon: 'add', kind: 'flow', href: '/owner/staff?invite=1', keywords: ['add staff', 'invite staff', 'new employee', 'staff login', 'add manager'], roles: OWNER },
  { id: 'settings', title: 'Café settings', description: 'Details, hours, pausing and your login', where: 'Money & account', group: 'settings', icon: 'settings', kind: 'go', href: '/owner/settings', keywords: ['settings', 'preferences', 'business settings', 'configuration'], roles: OWNER },
  { id: 'hours', title: 'Opening hours', description: 'When you open and close, or open 24 hours', where: 'Café settings', group: 'settings', icon: 'clock', kind: 'flow', href: '/owner/settings?edit=hours', keywords: ['opening time', 'closing time', 'business hours', 'open time', 'close time', 'timings', 'when do we open', 'operating hours', '24 hours', 'schedule', 'day wise schedule'], roles: OWNER },
  { id: 'pause', title: 'Pause online bookings', description: 'Stop new app bookings for a while. Walk-ins carry on', where: 'Café settings', group: 'action', icon: 'pause', kind: 'flow', href: '/owner/settings?qf=pause', keywords: ['stop bookings', 'pause bookings', 'close today', 'closed today', 'holiday', 'temporary closure', 'take a break', 'resume bookings', 'turn bookings off', 'close cafe'], roles: OWNER },
  { id: 'emergency', title: 'Close the café now (emergency)', description: 'Power cut or flood: shut everything and tell booked customers', where: 'Café settings', group: 'action', icon: 'emergency', kind: 'flow', href: '/owner/settings?qf=emergency', keywords: ['emergency', 'close cafe', 'close today', 'shut down', 'power cut', 'urgent close', 'closed now', 'reopen'], roles: OWNER },
  { id: 'profile', title: 'Café name, phone and description', description: 'What customers see on your listing', where: 'Café settings', group: 'settings', icon: 'store', kind: 'flow', href: '/owner/settings?edit=basic', keywords: ['cafe profile', 'contact information', 'phone number', 'cafe name', 'description', 'about', 'edit profile', 'listing'], roles: OWNER },
  { id: 'location', title: 'Address and map pin', description: 'Where customers find you', where: 'Café settings', group: 'settings', icon: 'map', kind: 'flow', href: '/owner/settings?edit=location', keywords: ['address', 'location', 'google maps', 'map link', 'directions', 'city', 'pincode'], roles: OWNER },
  { id: 'amenities', title: 'Amenities and café photos', description: 'AC, snacks, parking — and photos of the place', where: 'Café settings', group: 'settings', icon: 'photo', kind: 'flow', href: '/owner/settings?edit=amenities', keywords: ['facilities', 'wifi', 'ac', 'parking', 'photos', 'cover photo', 'gallery', 'menu photos'], roles: OWNER },
  { id: 'games', title: 'Games you have', description: 'The games customers can play on each setup', where: 'Café settings', group: 'settings', icon: 'games', kind: 'flow', href: '/owner/settings?edit=games', keywords: ['games list', 'game library', 'titles', 'add game'], roles: OWNER },
  { id: 'login', title: 'Email and password', description: 'Change how you sign in', where: 'Café settings', group: 'settings', icon: 'lock', kind: 'go', href: '/owner/settings?qf=login', keywords: ['change password', 'change email', 'login', 'security', 'account'], roles: OWNER },
  { id: 'help', title: 'Help & support', description: 'Ask KHEL-O on WhatsApp, call or email', where: 'Money & account', group: 'pages', icon: 'help', kind: 'go', href: '/owner/support', keywords: ['support', 'contact khelo', 'problem', 'complaint', 'whatsapp', 'call us', 'refund help'], roles: BOTH },
  { id: 'tutorial', title: 'Replay the tutorial', description: 'Lights up each button, one at a time. About 4 minutes', where: 'Help & support', group: 'pages', icon: 'tutorial', kind: 'go', href: '/owner/support', keywords: ['tutorial', 'tour', 'how to use', 'learn', 'guide', 'training', 'demo'], roles: OWNER, run: 'tutorial' },
];

const CHALLENGE_ITEM: QFItem = { id: 'challenges', title: 'Challenges', description: 'The challenge at your café: players and the day', where: 'Today', group: 'bookings', icon: 'challenge', kind: 'go', href: '/owner/challenges', keywords: ['tournament', 'tekken', 'bracket', 'competition'], roles: OWNER };

/* ── Live items ─────────────────────────────────────────────────────────── */

const rupees = (n?: number) => (n == null ? '' : `₹${Math.round(n)}`);
const hrsText = (h: number) => `${Number.isInteger(h) ? h : h.toFixed(1)} ${h === 1 ? 'hr' : 'hrs'}`;
const enc = encodeURIComponent;

function platformWords(s: QFSetup): string[] {
  const p = s.platform ?? '';
  if (p === 'playstation') return ['playstation', 'ps5', 'ps', 'console'];
  if (p === 'xbox') return ['xbox', 'console'];
  if (p === 'pc') return ['pc', 'computer', 'gaming pc'];
  if (p === 'nintendo') return ['nintendo', 'switch', 'console'];
  return [];
}

function setupItems(ctx: QFContext, q: ParsedQuery): QFItem[] {
  const out: QFItem[] = [];
  const staff = ctx.role === 'staff';
  for (const s of ctx.setups) {
    if (s.isActive === false) continue;
    const words = [s.name, s.model ?? '', ...platformWords(s)].filter(Boolean);
    const fit = q.machine ? machineFits(q.machine, `${s.name} ${s.model ?? ''}`, s.platform) : 0;
    const lift = fit === 2 ? 0.3 : fit === 1 ? 0.18 : 0;
    const gaming = s.tierType !== 'activity';
    const facts = [rupees(s.pricePerHour) && `${rupees(s.pricePerHour)} an hour`, s.totalSeats ? `${s.totalSeats} ${s.totalSeats === 1 ? 'unit' : 'units'}` : ''].filter(Boolean).join(' · ');

    if (!staff) {
      out.push({
        id: `setup:${s.id}:edit`,
        title: `Edit ${s.name}`,
        description: facts ? `${facts}. Price, how many, booking length` : 'Price, how many, booking length',
        where: 'Setups & prices',
        group: 'setups',
        icon: 'price',
        kind: 'flow',
        href: `/owner/tiers?edit=${enc(s.id)}`,
        keywords: [...words, 'price', 'pricing', 'rate', 'change price', 'hourly price', 'edit', 'how many', 'minimum booking', 'booking length', 'manage'],
        roles: OWNER,
        boost: lift,
      });
    }
    const machineName = q.machine?.n && fit ? q.machine.text : '';
    out.push({
      id: `setup:${s.id}:broken`,
      title: machineName ? `Mark ${machineName} broken` : `Mark a ${s.name} broken`,
      description: `${s.name}. Customers can't book it until it's fixed`,
      where: staff ? 'Free slots' : 'Setups & prices',
      group: 'action',
      icon: 'wrench',
      kind: 'flow',
      href: staff
        ? `/owner/availability?tier=${enc(s.id)}${machineName ? `&machine=${enc(machineName)}` : ''}&qf=broken`
        : `/owner/tiers?broken=${enc(s.id)}${machineName ? `&machine=${enc(machineName)}` : ''}`,
      keywords: [...words, 'broken', 'maintenance', 'repair', 'out of order', 'not working', 'block', 'fix', 'faulty', 'under repair'],
      roles: BOTH,
      boost: lift + (machineName ? 0.12 : 0),
    });
    if (!gaming) continue;
    out.push({
      id: `setup:${s.id}:slots`,
      title: `${s.name} hour by hour${q.day && q.day.word !== 'today' ? `, ${q.day.label}` : ''}`,
      description: `What's free and taken on ${s.name}`,
      where: 'Free slots',
      group: 'setups',
      icon: 'slots',
      kind: 'go',
      href: `/owner/availability?tier=${enc(s.id)}${q.day ? `&date=${q.day.iso}` : ''}`,
      keywords: [...words, 'free', 'availability', 'available', 'occupied', 'slots', 'hour by hour', 'timeline'],
      roles: BOTH,
      boost: lift * 0.8,
    });
  }
  return out;
}

/** Which console in a drop the owner meant, only when it is unambiguous. */
function consoleFor(drop: QFDrop, q: ParsedQuery): QFConsole | null {
  const m = q.machine;
  if (!m) return null;
  const fits = drop.consoles.filter((c) => machineFits(m, c.label, c.platform) > 0);
  if (m.n != null) {
    const exact = fits.filter((c) => labelNumber(c.label) === m.n);
    const strong = exact.filter((c) => machineFits(m, c.label, c.platform) === 2);
    if (strong.length === 1) return strong[0];
    return exact.length === 1 ? exact[0] : null;
  }
  return fits.length === 1 ? fits[0] : null;
}

function dropItems(ctx: QFContext, q: ParsedQuery): QFItem[] {
  if (ctx.role !== 'owner') return [];
  const out: QFItem[] = [];
  for (const d of ctx.drops) {
    if (d.status === 'cancelled') continue;
    const base = `/owner/drops/${enc(d.id)}`;
    const words = [d.title, d.game ?? '', 'drop', 'launch', 'event', 'gta 6', 'gta'];
    const c = consoleFor(d, q);
    const ambiguousMachine = Boolean(q.machine) && !c;
    const machineKnown = c ? c.label : '';
    // A day the drop actually runs on (else the slot manager picks its own first day).
    const inRun = q.day && (!d.startsOn || q.day.iso >= addDaysIso(d.startsOn, -1)) && (!d.endsOn || q.day.iso <= d.endsOn);
    const dayPart = inRun && q.day ? q.day.label : '';
    const hours = d.flexible && q.hours ? q.hours : undefined;
    const params = (slot: string) =>
      [`slot=${slot}`, c ? `console=${enc(c.key)}` : '', hours ? `hours=${hours}` : '', inRun && q.day ? `date=${q.day.iso}` : ''].filter(Boolean).join('&');
    const said = [machineKnown, hours ? `for ${hrsText(hours)}` : '', dayPart].filter(Boolean).join(' ');
    const lift = (c ? 0.3 : 0) + (hours ? 0.08 : 0) + (dayPart ? 0.05 : 0);
    const draft = d.status === 'draft' ? ' (not live yet)' : '';

    out.push({
      id: `drop:${d.id}`,
      title: d.title,
      description: `Launch drop${draft}. Slots, prices, who is coming`,
      where: 'Launch drops',
      group: 'bookings',
      icon: 'drop',
      kind: 'go',
      href: base,
      keywords: [...words, 'manage', 'event', 'reservations', 'event availability'],
      roles: OWNER,
    });
    out.push({
      id: `drop:${d.id}:walkin`,
      title: said ? `Sell ${said} as a walk-in` : `Walk-in sale in ${d.title}`,
      description: `${d.title}. Pick the time, then confirm${ambiguousMachine ? ' — pick the console there' : ''}`,
      where: 'Manage slots',
      group: 'action',
      icon: 'walkin',
      kind: 'flow',
      href: `${base}?${params('walkin')}`,
      keywords: [...words, 'walk in', 'walkin', 'sell', 'sold', 'cash', 'counter', 'offline', 'phone booking', 'mark walk in', 'sale', ...(c ? [c.label] : [])],
      roles: OWNER,
      boost: lift,
    });
    out.push({
      id: `drop:${d.id}:block`,
      title: machineKnown ? `Block ${said}` : `Block time in ${d.title}`,
      description: `${d.title}. Nobody can book it online; you confirm first`,
      where: 'Manage slots',
      group: 'action',
      icon: 'block',
      kind: 'flow',
      href: `${base}?${params('block')}`,
      keywords: [...words, 'block', 'hold', 'not for sale', 'private', 'cleaning', 'maintenance', 'reserve', 'unavailable', ...(c ? [c.label] : [])],
      roles: OWNER,
      boost: lift,
    });
    out.push({
      id: `drop:${d.id}:hourprice`,
      title: `Price for some hours in ${d.title}`,
      description: 'Cheaper late nights, dearer evenings — and a minimum length for them',
      where: 'Manage slots',
      group: 'settings',
      icon: 'price',
      kind: 'flow',
      href: `${base}?${params('price')}`,
      keywords: [...words, 'pricing windows', 'time price', 'peak price', 'night price', 'happy hour', 'change price', 'event pricing'],
      roles: OWNER,
    });
    out.push({
      id: `drop:${d.id}:min`,
      title: `Minimum booking in ${d.title}`,
      description: 'Set the shortest booking for chosen hours, in Manage slots',
      where: 'Manage slots',
      group: 'settings',
      icon: 'clock',
      kind: 'flow',
      href: `${base}?${params('price')}`,
      keywords: [...words, 'minimum', 'minimum booking', 'min hours', 'shortest', 'least', 'duration', 'length'],
      roles: OWNER,
    });
    out.push({
      id: `drop:${d.id}:prices`,
      title: `${d.title} prices`,
      description: 'Price per hour, booking fee and packages',
      where: 'Launch drop settings',
      group: 'settings',
      icon: 'price',
      kind: 'flow',
      href: `${base}?qf=prices`,
      keywords: [...words, 'price', 'pricing', 'change price', 'booking fee', 'deposit', 'packages', 'event pricing', 'rate'],
      roles: OWNER,
    });
    out.push({
      id: `drop:${d.id}:status`,
      title: `Publish or hide ${d.title}`,
      description: d.status === 'live' ? 'Live now: hide it to stop new bookings' : 'Not live yet: open it for bookings',
      where: 'Launch drop',
      group: 'action',
      icon: 'eye',
      kind: 'flow',
      href: `${base}?qf=status`,
      keywords: [...words, 'publish', 'unpublish', 'go live', 'hide', 'open bookings', 'close bookings', 'pause event'],
      roles: OWNER,
    });
    out.push({
      id: `drop:${d.id}:who`,
      title: `Who is coming to ${d.title}`,
      description: 'Every reservation, day by day, with check-in',
      where: 'Launch drop',
      group: 'bookings',
      icon: 'bookings',
      kind: 'go',
      href: `${base}?qf=who`,
      keywords: [...words, 'reservations', 'gta 6 reservations', 'bookings', 'list', 'players', 'customers'],
      roles: OWNER,
    });
    out.push({
      id: `drop:${d.id}:consoles`,
      title: `Consoles in ${d.title}`,
      description: 'Which PS5s and Xboxes the drop sells',
      where: 'Launch drop settings',
      group: 'setups',
      icon: 'setups',
      kind: 'flow',
      href: `${base}?qf=consoles`,
      keywords: [...words, 'consoles', 'add console', 'add xbox', 'add ps5', 'seats', 'how many'],
      roles: OWNER,
    });
    out.push({
      id: `drop:${d.id}:details`,
      title: `${d.title} name and dates`,
      description: 'Title, tagline, when it opens, early-access code',
      where: 'Launch drop settings',
      group: 'settings',
      icon: 'calendar',
      kind: 'flow',
      href: `${base}?qf=details`,
      keywords: [...words, 'event booking settings', 'title', 'dates', 'early access', 'code', 'opens'],
      roles: OWNER,
    });
    out.push({
      id: `drop:${d.id}:share`,
      title: `Share ${d.title}`,
      description: 'WhatsApp, Instagram, the walk-in QR poster',
      where: 'Launch drop',
      group: 'action',
      icon: 'share',
      kind: 'go',
      href: `${base}?qf=share`,
      keywords: [...words, 'share', 'link', 'whatsapp', 'instagram', 'poster', 'qr', 'promote'],
      roles: OWNER,
    });
  }
  return out;
}

function dayItems(ctx: QFContext, q: ParsedQuery): QFItem[] {
  if (!q.day) return [];
  const day = q.day.word ?? q.day.iso;
  const status = q.status ? `&status=${q.status}` : '';
  const statusWord: Record<string, string> = {
    pending_payment: 'not paid yet', cancelled: 'cancelled', no_show: 'no-shows', checked_in: 'checked in', active: 'playing', completed: 'finished', confirmed: 'paid',
  };
  const label = q.day.word ? q.day.word[0].toUpperCase() + q.day.word.slice(1) : q.day.label;
  return [
    {
      id: `bookings:day:${day}:${q.status ?? ''}`,
      title: `${q.day.word ? `${label}'s` : `${label}:`} bookings${q.status ? `, ${statusWord[q.status]}` : ''}`,
      description: q.status ? `Only ${statusWord[q.status]}` : 'Everyone booked that day',
      where: 'Bookings',
      group: 'bookings',
      icon: 'calendar',
      kind: 'go',
      href: `/owner/bookings?day=${day}${status}`,
      keywords: ['bookings', 'booking', 'reservations', 'who is coming', 'list', 'schedule', 'customers'],
      roles: BOTH,
      boost: 0.32,
    },
    {
      id: `slots:day:${q.day.iso}`,
      title: `Free slots, ${q.day.label}`,
      description: "What's free and taken that day, hour by hour",
      where: 'Free slots',
      group: 'setups',
      icon: 'slots',
      kind: 'go',
      href: `/owner/availability?date=${q.day.iso}`,
      keywords: ['free', 'availability', 'available', 'slots', 'empty', 'hour by hour'],
      roles: BOTH,
      boost: 0.2,
    },
  ];
}

function bookingItems(ctx: QFContext, q: ParsedQuery): QFItem[] {
  const out: QFItem[] = [];
  if (q.code) {
    out.push({
      id: `booking:code:${q.code}`,
      title: `Find booking ${q.code}`,
      description: 'Look it up across every day',
      where: 'Bookings',
      group: 'bookings',
      icon: 'bookings',
      kind: 'go',
      href: `/owner/bookings?ref=${enc(q.code)}`,
      keywords: [q.code, 'booking', 'code', 'reference'],
      roles: BOTH,
      boost: 0.9,
    });
  }
  for (const b of ctx.bookings) {
    out.push({
      id: `booking:${b.id}`,
      title: b.name,
      description: `Today, ${b.startTime}–${b.endTime} · ${b.reference}`,
      where: 'Today’s bookings',
      group: 'bookings',
      icon: 'user',
      kind: 'go',
      href: `/owner/bookings?day=today&ref=${enc(b.reference)}`,
      keywords: [b.name, b.reference, b.phone ?? '', 'booking', 'customer'],
      roles: BOTH,
      boost: 0.25,
    });
  }
  return out;
}

/** Every item this owner or staff member may see, for this query. */
export function buildItems(ctx: QFContext, q: ParsedQuery): QFItem[] {
  const statics = STATIC.filter((i) => i.roles.includes(ctx.role));
  if (ctx.hostingChallenge && ctx.role === 'owner') statics.push(CHALLENGE_ITEM);
  // With a live drop, "mark walk-in" belongs to the drop's slot manager; keep the
  // seat-split explanation for cafés without one.
  const hasDrop = ctx.drops.some((d) => d.status !== 'cancelled');
  const tuned = statics.map((i) => (i.id === 'walkin-normal' && hasDrop ? { ...i, boost: -0.15 } : i));
  return [...tuned, ...setupItems(ctx, q), ...dropItems(ctx, q), ...dayItems(ctx, q), ...bookingItems(ctx, q)];
}

/** Suggestions for an empty search box. */
export function suggestions(ctx: QFContext): { frequent: string[]; actions: string[] } {
  if (ctx.role === 'staff') {
    return { frequent: ['bookings-today', 'slots', 'scan', 'dashboard'], actions: ['scan-manual', 'broken-staff', 'bookings-unpaid'] };
  }
  const drop = ctx.drops.find((d) => d.status === 'live') ?? ctx.drops.find((d) => d.status === 'draft');
  return {
    frequent: ['bookings-today', 'slots', 'setups', 'hours'],
    actions: drop
      ? [`drop:${drop.id}:walkin`, `drop:${drop.id}:block`, 'broken', 'pause']
      : ['broken', 'offer-new', 'pause', 'setup-add'],
  };
}

export const STATIC_ITEMS = STATIC;
