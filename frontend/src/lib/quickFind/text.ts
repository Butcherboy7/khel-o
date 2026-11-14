/**
 * Quick Find text helpers: normalising what an owner types, folding everyday
 * words onto the few concepts the portal is built from, and forgiving typos.
 * Pure functions, no React, so the search can be unit-tested end to end.
 */

/** Lower-case, strip punctuation, split letters from digits ("ps52" stays, "ps5-2" → "ps5 2"). */
export function normalize(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[’'`]s\b/g, '')
    .replace(/[’'`]/g, '')
    .replace(/[^a-z0-9₹]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Words that carry no meaning in a search ("how do I change the price" → change, price). */
const STOP = new Set([
  'a', 'an', 'the', 'my', 'our', 'me', 'i', 'we', 'us', 'to', 'for', 'of', 'in', 'on', 'at', 'is', 'are', 'do',
  'does', 'how', 'can', 'where', 'what', 'please', 'want', 'need', 'and', 'with', 'it', 'this', 'that', 'some',
  'when', 'which', 'who', 'there', 'any', 'all', 'from', 'by', 'be', 'get', 'see', 'show', 'find', 'view', 'look',
  'kya', 'kaise', 'hai', 'ka', 'ki', 'ke', 'ko', 'mera', 'mere', 'apna', 'set', 'up', 'should', 'would', 'go',
]);

export function tokens(input: string): string[] {
  return normalize(input)
    .split(' ')
    .filter((t) => t && !STOP.has(t));
}

/**
 * Everyday words → one concept each. Both the query and every item's keywords
 * are folded through this, so "open time", "when do we open" and "business
 * hours" all meet at `hours`. Keep entries lower-case, single words.
 */
const CONCEPTS: Record<string, string[]> = {
  hours: ['hours', 'hour', 'timing', 'timings', 'time', 'times', 'schedule', 'opening', 'open', 'opens', 'closing', 'close', 'closes', 'shut', 'business'],
  booking: ['booking', 'bookings', 'booked', 'reservation', 'reservations', 'reserve', 'reserved', 'appointment', 'session', 'sessions', 'slot', 'slots'],
  setup: ['setup', 'setups', 'console', 'consoles', 'machine', 'machines', 'rig', 'rigs', 'station', 'stations', 'system', 'systems', 'device', 'devices', 'equipment', 'inventory', 'hardware', 'tier', 'tiers', 'seat', 'seats'],
  playstation: ['ps5', 'ps4', 'playstation', 'ps', 'sony', 'pro'],
  xbox: ['xbox', 'series', 'microsoft'],
  pc: ['pc', 'pcs', 'computer', 'computers', 'desktop', 'gpu', 'rtx'],
  price: ['price', 'prices', 'pricing', 'rate', 'rates', 'cost', 'costs', 'charge', 'charges', 'fee', 'fees', 'tariff', 'money', 'rupees', 'rs', '₹', 'paisa', 'amount'],
  offer: ['offer', 'offers', 'discount', 'discounts', 'deal', 'deals', 'coupon', 'coupons', 'promo', 'promotion', 'happy', 'sale', 'cashback'],
  drop: ['drop', 'drops', 'launch', 'event', 'events', 'gta', 'gta6', 'presale', 'preorder'],
  broken: ['broken', 'repair', 'repairs', 'maintenance', 'fix', 'fixed', 'faulty', 'damaged', 'dead', 'outoforder', 'service', 'kharab'],
  block: ['block', 'blocked', 'hold', 'reserve', 'lock', 'unavailable', 'private', 'cleaning'],
  walkin: ['walkin', 'walk', 'cash', 'offline', 'counter', 'phone', 'sell', 'sold', 'sale'],
  pause: ['pause', 'paused', 'stop', 'stopped', 'disable', 'holiday', 'leave', 'break', 'vacation', 'closed', 'band'],
  emergency: ['emergency', 'urgent', 'power', 'outage', 'flood', 'fire', 'shutdown'],
  staff: ['staff', 'team', 'employee', 'employees', 'worker', 'workers', 'manager', 'cashier', 'login', 'logins', 'invite', 'helper'],
  payout: ['payout', 'payouts', 'paid', 'payment', 'payments', 'earning', 'earnings', 'settlement', 'bank', 'upi', 'transfer', 'income', 'revenue', 'takings'],
  scan: ['scan', 'scanner', 'qr', 'pass', 'checkin', 'check', 'arrive', 'arrived', 'arrival', 'arrivals', 'verify'],
  review: ['review', 'reviews', 'rating', 'ratings', 'feedback', 'stars', 'comments'],
  insight: ['insight', 'insights', 'analytics', 'stats', 'statistics', 'report', 'reports', 'trends', 'busy', 'peak', 'numbers', 'graph'],
  alert: ['alert', 'alerts', 'notification', 'notifications', 'notify', 'updates', 'bell', 'messages'],
  profile: ['profile', 'details', 'name', 'address', 'location', 'map', 'contact', 'number', 'description', 'listing', 'about'],
  photo: ['photo', 'photos', 'picture', 'pictures', 'image', 'images', 'pic', 'pics', 'gallery', 'cover'],
  help: ['help', 'support', 'contact', 'problem', 'issue', 'question', 'tutorial', 'guide', 'learn', 'call'],
  length: ['minimum', 'min', 'shortest', 'least', 'maximum', 'max', 'longest', 'duration', 'length', 'long'],
  cancel: ['cancel', 'cancelled', 'canceled', 'cancellation', 'refund', 'refunds', 'refunded', 'void'],
  unpaid: ['unpaid', 'pending', 'notpaid', 'due', 'owed'],
  noshow: ['noshow', 'absent', 'missed'],
  add: ['add', 'new', 'create', 'more', 'another', 'register', 'list'],
  edit: ['edit', 'change', 'update', 'modify', 'adjust', 'manage', 'increase', 'decrease', 'raise', 'lower', 'reduce', 'set'],
  today: ['today', 'aaj', 'tonight', 'now'],
  tomorrow: ['tomorrow', 'tmrw', 'tmr', 'kal'],
  upcoming: ['upcoming', 'future', 'next', 'coming', 'later', 'ahead'],
  past: ['past', 'old', 'previous', 'history', 'earlier', 'yesterday', 'completed', 'finished', 'done'],
  amenity: ['amenity', 'amenities', 'facilities', 'wifi', 'ac', 'parking', 'snacks', 'food', 'drinks', 'washroom'],
  game: ['game', 'games', 'titles', 'library', 'fifa', 'fc', 'valorant', 'cod', 'tekken'],
  challenge: ['challenge', 'challenges', 'tournament', 'tournaments', 'bracket', 'competition', 'match', 'matches'],
  share: ['share', 'link', 'whatsapp', 'instagram', 'post', 'promote', 'advertise'],
  cabin: ['cabin', 'cabins', 'room', 'rooms', 'private'],
  coop: ['coop', 'co', 'share', 'sharing', 'friends', 'players', 'player', 'multiplayer', 'together'],
  turnoff: ['off', 'hide', 'remove', 'delete', 'deactivate', 'disable'],
  security: ['password', 'email', 'security', 'account', 'signin', 'login'],
};

const WORD_TO_CONCEPT = new Map<string, string[]>();
for (const [concept, words] of Object.entries(CONCEPTS)) {
  for (const w of words) {
    const list = WORD_TO_CONCEPT.get(w) ?? [];
    list.push(concept);
    WORD_TO_CONCEPT.set(w, list);
  }
}

/** The concepts one word belongs to (a word can sit in two, e.g. "share"). */
export function conceptsOf(word: string): string[] {
  return WORD_TO_CONCEPT.get(word) ?? [];
}

/** Optimal-string-alignment distance, capped: returns cap+1 as soon as it is exceeded. */
export function editDistance(a: string, b: string, cap = 2): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > cap) return cap + 1;
  const prev2: number[] = new Array(b.length + 1).fill(0);
  let prev: number[] = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur: number[] = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, prev2[j - 2] + 1);
      cur[j] = v;
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > cap) return cap + 1;
    for (let j = 0; j <= b.length; j++) prev2[j] = prev[j];
    prev = cur;
  }
  return prev[b.length];
}

/**
 * How well one typed token matches one candidate word, 0..1.
 * Exact 1, prefix (≥2 typed letters) 0.85, one typo 0.7 (words ≥4), two typos 0.5 (words ≥8).
 * Digits must match exactly: "ps5 2" must never find "PS5 1".
 */
export function tokenMatch(typed: string, word: string): number {
  if (typed === word) return 1;
  if (/\d/.test(typed) || /\d/.test(word)) {
    return word.startsWith(typed) && !/\d$/.test(typed) ? 0.8 : typed === word ? 1 : 0;
  }
  if (typed.length >= 2 && word.startsWith(typed)) return 0.85 - Math.min(0.2, (word.length - typed.length) * 0.02);
  if (typed.length >= 4) {
    const d = editDistance(typed, word, 2);
    if (d === 1) return 0.7;
    if (d === 2 && typed.length >= 8) return 0.5;
  }
  return 0;
}
