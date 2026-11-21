/**
 * Everything admin can jump to, with the everyday words people use for it.
 * Pages come from the sidebar groups; actions are the jobs admin does most.
 * Pure data + a scorer, so it is unit-tested without React.
 */
import { normalize, tokenMatch, tokens } from '@/lib/quickFind/text';

export interface AdminFindItem {
  id: string;
  title: string;
  description: string;
  area: string;
  href: string;
  kind: 'page' | 'action';
  keywords: string[];
}

export const ADMIN_FIND_ITEMS: AdminFindItem[] = [
  // Home
  { id: 'overview', title: 'Overview', description: 'Today across KHEL-O: bookings, money, what needs you', area: 'Home', href: '/admin', kind: 'page', keywords: ['dashboard', 'home', 'summary', 'today', 'stats', 'kpi'] },
  { id: 'applications', title: 'Café applications', description: 'New cafés waiting to be checked and approved', area: 'Home', href: '/admin/verification-queue', kind: 'page', keywords: ['verify', 'verification', 'approve', 'pending', 'onboarding', 'queue', 'new cafes', 'kyc'] },
  { id: 'health', title: 'Marketplace health', description: 'Cafés with no bookings, stale prices, problems', area: 'Home', href: '/admin/marketplace-health', kind: 'page', keywords: ['health', 'problems', 'issues', 'inactive', 'stale'] },
  { id: 'support', title: 'Support tickets', description: 'Questions and complaints from players and owners', area: 'Home', href: '/admin/support', kind: 'page', keywords: ['help', 'complaint', 'tickets', 'issue', 'contact', 'messages'] },
  // Cafés
  { id: 'cafes', title: 'All cafés', description: 'Every listed café: edit, suspend, see the owner', area: 'Cafés', href: '/admin/cafes', kind: 'page', keywords: ['venues', 'listings', 'stores', 'shops', 'owners', 'suspend', 'edit cafe'] },
  { id: 'booking-soon', title: 'Booking soon cafés', description: 'Listed cafés not taking online bookings yet', area: 'Cafés', href: '/admin/booking-soon', kind: 'page', keywords: ['lead', 'leads', 'coming soon', 'not live', 'pitch'] },
  { id: 'demand', title: 'Demand (notify me)', description: 'Players waiting for a café to go live, and owner intros', area: 'Cafés', href: '/admin/leads', kind: 'page', keywords: ['notify', 'waitlist', 'demand', 'leads', 'owner intro', 'know the owner', 'votes'] },
  { id: 'setups', title: 'Setups across cafés', description: 'Every PC, PS5 and table, with prices', area: 'Cafés', href: '/admin/inventory/setups', kind: 'page', keywords: ['consoles', 'ps5', 'xbox', 'pc', 'inventory', 'machines', 'tiers', 'prices'] },
  { id: 'reviews', title: 'Reviews', description: 'What players wrote about cafés', area: 'Cafés', href: '/admin/reviews', kind: 'page', keywords: ['ratings', 'stars', 'feedback', 'comments'] },
  // Money
  { id: 'bookings', title: 'Bookings', description: 'Every booking: search, cancel, refund', area: 'Money', href: '/admin/bookings', kind: 'page', keywords: ['reservations', 'orders', 'sessions', 'cancel', 'refund', 'booking ref'] },
  { id: 'payments', title: 'Payments', description: 'Razorpay payments, failures and refunds', area: 'Money', href: '/admin/payments', kind: 'page', keywords: ['razorpay', 'transactions', 'upi', 'failed payment', 'captured', 'refunds'] },
  { id: 'payables', title: 'Café payables', description: 'What we owe each café and what is paid', area: 'Money', href: '/admin/cafe-payouts', kind: 'page', keywords: ['payouts', 'settlements', 'owe', 'pending pay', 'who owes', 'pay cafe', 'transfer', 'statement'] },
  // Growth
  { id: 'drops', title: 'Launch drops', description: 'GTA 6 and other pre-sold launch seats', area: 'Growth', href: '/admin/drops', kind: 'page', keywords: ['gta', 'gta6', 'launch', 'presale', 'event', 'drop seats'] },
  { id: 'offers', title: 'Offers and links', description: 'Offer codes, campaigns and short links', area: 'Growth', href: '/admin/promotions', kind: 'page', keywords: ['promo', 'coupon', 'discount', 'campaign', 'short link', 'code', 'deal'] },
  { id: 'challenges', title: 'Challenges', description: 'Tournaments: entries, brackets, rewards', area: 'Growth', href: '/admin/challenges', kind: 'page', keywords: ['tournament', 'tekken', 'bracket', 'entries', 'competition'] },
  { id: 'gta6-list', title: 'GTA 6 list', description: 'Everyone who joined the GTA 6 launch list, with numbers', area: 'Growth', href: '/admin/launch-list', kind: 'page', keywords: ['gta', 'gta6', 'launch list', 'waitlist', 'signups', 'phone numbers', 'export', 'csv'] },
  { id: 'gta6-requests', title: 'GTA 6 slot requests', description: 'Players asking for a GTA 6 time: confirm or suggest', area: 'Growth', href: '/admin/gta6-requests', kind: 'page', keywords: ['gta', 'gta6', 'request', 'ask for slot', 'confirm', 'slot link'] },
  { id: 'suggestions', title: 'Café suggestions', description: 'Cafés players told us to add', area: 'Growth', href: '/admin/cafe-suggestions', kind: 'page', keywords: ['suggest', 'add cafe', 'missing cafe', 'new city'] },
  { id: 'community', title: 'Community', description: 'Members, polls, photos and WhatsApp joins', area: 'Growth', href: '/admin/community', kind: 'page', keywords: ['whatsapp', 'group', 'members', 'polls', 'photos', 'join'] },
  { id: 'emails', title: 'Community emails', description: 'Write and schedule emails to the community', area: 'Growth', href: '/admin/community-email', kind: 'page', keywords: ['email', 'newsletter', 'broadcast', 'mail', 'send'] },
  { id: 'instagram', title: 'Instagram reels', description: 'Reels on the site and how they do', area: 'Growth', href: '/admin/instagram', kind: 'page', keywords: ['ig', 'reels', 'insta', 'social', 'videos'] },
  // Insights
  { id: 'referrals', title: 'Referrals', description: 'Welcome credit, community code, friend rewards: settings and who brought whom', area: 'Growth', href: '/admin/referrals', kind: 'page', keywords: ['referral', 'invite', 'friends', 'community code', 'welcome offer', 'credit', 'reward', 'squad', 'discount', 'first booking'] },
  { id: 'conversion', title: 'Conversion', description: 'Why people don’t book: funnels, sources, pages, searches', area: 'Insights', href: '/admin/analytics/conversion', kind: 'page', keywords: ['funnel', 'drop off', 'dropoff', 'leak', 'bounce', 'why not booking', 'conversion rate', 'searches', 'time on page', 'where people leave', 'sources', 'referrer'] },
  { id: 'traffic', title: 'Traffic', description: 'Visitors, page views, signups and bookings over time', area: 'Insights', href: '/admin/analytics/traffic', kind: 'page', keywords: ['visitors', 'views', 'users', 'growth', 'daily', 'weekly', 'monthly'] },
  { id: 'campaigns', title: 'Campaigns', description: 'Ads and links: clicks, signups and bookings', area: 'Insights', href: '/admin/analytics/ads', kind: 'page', keywords: ['ads', 'meta', 'facebook', 'instagram ads', 'utm', 'roi', 'spend'] },
  { id: 'revenue', title: 'Revenue', description: 'Money in and our share, by café and period', area: 'Insights', href: '/admin/analytics/revenue', kind: 'page', keywords: ['gmv', 'income', 'earnings', 'commission', 'fees', 'money'] },
  { id: 'areas', title: 'Areas', description: 'Where players are, by neighbourhood', area: 'Insights', href: '/admin/analytics/geography', kind: 'page', keywords: ['map', 'location', 'city', 'geography', 'neighbourhood', 'locality'] },
  { id: 'shares', title: 'Shares', description: 'Links people shared and who opened them', area: 'Insights', href: '/admin/analytics/shares', kind: 'page', keywords: ['share', 'referral', 'friends', 'invite', 'viral'] },
  // Team
  { id: 'users', title: 'Users', description: 'Every account, with phone numbers', area: 'Team', href: '/admin/users', kind: 'page', keywords: ['people', 'players', 'customers', 'accounts', 'gamers', 'phone numbers', 'contacts', 'members'] },
  { id: 'staff', title: 'Staff', description: 'Café staff logins and invites', area: 'Team', href: '/admin/staff', kind: 'page', keywords: ['team', 'employees', 'invite', 'logins'] },
  { id: 'audit', title: 'Audit log', description: 'Every admin action, who did it and when', area: 'Team', href: '/admin/audit-log', kind: 'page', keywords: ['history', 'log', 'who changed', 'actions'] },
  { id: 'settings', title: 'Settings', description: 'Platform settings and switches', area: 'Team', href: '/admin/settings', kind: 'page', keywords: ['config', 'switches', 'fees', 'platform'] },
  // Actions
  { id: 'act-approve', title: 'Approve a new café', description: 'Open the applications waiting for you', area: 'Do', href: '/admin/verification-queue', kind: 'action', keywords: ['approve', 'verify', 'accept cafe', 'review application'] },
  { id: 'act-pay-cafe', title: 'Mark a café paid', description: 'Record a payout you sent to a café', area: 'Do', href: '/admin/cafe-payouts', kind: 'action', keywords: ['pay', 'paid', 'payout', 'settle', 'transfer done'] },
  { id: 'act-refund', title: 'Refund or cancel a booking', description: 'Find the booking, then Cancel or Refund', area: 'Do', href: '/admin/bookings', kind: 'action', keywords: ['refund', 'cancel', 'money back', 'reverse'] },
  { id: 'act-new-challenge', title: 'New challenge', description: 'Set up a tournament at a café', area: 'Do', href: '/admin/challenges/new', kind: 'action', keywords: ['create tournament', 'new tournament', 'host', 'tekken'] },
  { id: 'act-email', title: 'Send a community email', description: 'Write one email to the community list', area: 'Do', href: '/admin/community-email', kind: 'action', keywords: ['email', 'send', 'broadcast', 'announce'] },
  { id: 'act-link', title: 'Make a tracked link', description: 'A khel-o.com/c/ link for an ad, reel or poster', area: 'Do', href: '/admin/promotions', kind: 'action', keywords: ['short link', 'utm', 'qr link', 'campaign link', 'tracking link'] },
  { id: 'act-export', title: 'Export the GTA 6 list', description: 'Download the launch list as a spreadsheet', area: 'Do', href: '/admin/launch-list', kind: 'action', keywords: ['export', 'download', 'csv', 'excel', 'numbers'] },
  { id: 'act-gta6-confirm', title: 'Confirm a GTA 6 request', description: 'Say yes or suggest another time', area: 'Do', href: '/admin/gta6-requests', kind: 'action', keywords: ['confirm', 'accept', 'gta request', 'reply'] },
];

/** Best matches for what was typed: every typed word must hit the title, area or a keyword. */
export function findAdminItems(query: string, items: AdminFindItem[] = ADMIN_FIND_ITEMS, limit = 6): AdminFindItem[] {
  const typed = tokens(query);
  if (typed.length === 0) return [];
  const scored: { item: AdminFindItem; score: number }[] = [];
  for (const item of items) {
    const titleWords = normalize(item.title).split(' ');
    const words = [...titleWords, ...normalize(`${item.area} ${item.keywords.join(' ')} ${item.description}`).split(' ')];
    let total = 0;
    let ok = true;
    for (const t of typed) {
      let best = 0;
      for (const w of words) best = Math.max(best, tokenMatch(t, w) * (titleWords.includes(w) ? 1.25 : 1));
      if (best === 0) {
        ok = false;
        break;
      }
      total += best;
    }
    if (!ok) continue;
    // Whole phrase in a keyword ("who owes") beats scattered words.
    const phrase = normalize(query);
    if (item.keywords.some((k) => normalize(k) === phrase) || normalize(item.title) === phrase) total += 1;
    if (item.kind === 'page') total += 0.05;
    scored.push({ item, score: total / typed.length });
  }
  return scored.sort((a, b) => b.score - a.score).slice(0, limit).map((s) => s.item);
}
