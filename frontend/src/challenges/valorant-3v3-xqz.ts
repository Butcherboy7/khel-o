import type { TeamChallengeConfig } from './types';

/**
 * KHELO Valorant 3v3 Challenge at XQZ Hyderabad (Sat 5 Dec 2026).
 *
 * Everything this challenge's pages SAY lives here: words, photos, sponsors,
 * timeline, rules, FAQ. What the server must ENFORCE (prices, team slots,
 * hold time, the sign-up close time) lives on the challenge row
 * (backend/scripts/seed_valorant_xqz.py) and comes back from the API; the
 * page always shows the server's prices and counts.
 *
 * Words: "Challenge", never "tournament". Never "ticket". Money words are "rewards" (never "prize",
 * "cash" or "win ₹"): payment partners read the site. Very simple English.
 * No Riot or Valorant logo anywhere.
 *
 * TODO before going live: XQZ Instagram, support WhatsApp number, the two
 * sponsors (name, logo, link), free play hours for the top teams.
 */
export const valorant3v3Xqz: TeamChallengeConfig = {
  slug: 'valorant-3v3-xqz',
  title: 'Khelo Valorant 3v3 Challenge',
  titleTop: 'Valorant',
  titleBottom: '3v3 Challenge',
  subtitle: 'Form your team of 3. Play at XQZ. Exciting rewards worth ₹5,000.',
  game: 'Valorant',
  mode: 'Skirmish 3v3',
  prizeTotal: 5000,

  venue: {
    name: 'XQZ Gaming Cafe',
    shortName: 'XQZ',
    city: 'Hyderabad',
    address: 'Third Floor, Sri Thirumala Platinum, Janardana Hills, Lumbini Avenue, Gachibowli, Hyderabad, Telangana 500032',
    logo: '/challenges/valorant-3v3-xqz/xqz-logo.png',
    googleMapsUrl: 'https://www.google.com/maps/search/?api=1&query=XQZ+Hyderabad+Sri+Thirumala+Platinum+Gachibowli',
    instagramHandle: null, // TODO: XQZ's Instagram username
    bookingSlug: 'xqz-hyderabad',
  },

  links: {
    kheloInstagramHandle: 'khelo.journey',
    communityInvite: 'https://chat.whatsapp.com/FWVq1Iv7EgaDlyspNkS3ps',
    supportWhatsApp: null, // TODO: '91XXXXXXXXXX'
  },

  // Rewards come from XQZ and Team Khelo (a partnership). No sponsor logos yet; the page names them in text.
  sponsors: [],

  dates: {
    registrationCloses: '2026-12-03T21:00:00+05:30',
    soloRefundBy: '2026-12-04T10:00:00+05:30',
    bracketDraw: '2026-12-04T19:00:00+05:30',
    reportingTime: '2026-12-05T11:00:00+05:30',
    checkInCloses: '2026-12-05T11:45:00+05:30',
    firstMatch: '2026-12-05T12:00:00+05:30',
  },

  prizes: [
    { place: 1, label: 'Top team', cash: 3000 },
    { place: 2, label: 'Second team', cash: 2000 },
  ],
  prizeExtra: 'Semi-finalists also get Khelo coupons.',
  // The split below is for the admin screens only. The public pages say "rewards worth" the total.
  // (Payment partners read the site, so no cash words in public.)
  sponsorLine: 'Rewards from XQZ and Team Khelo.',

  media: {
    heroVideo: '/challenges/valorant-3v3-xqz/bg/hero-mobile.mp4',
    heroPoster: '/challenges/valorant-3v3-xqz/bg/hero-mobile-poster.webp',
    photos: [
      { src: '/challenges/valorant-3v3-xqz/bg/xqz-hall-1920.webp', srcSmall: '/challenges/valorant-3v3-xqz/bg/xqz-hall-1080.webp', alt: 'The PC hall at XQZ: rows of gaming chairs under blue lights' },
      { src: '/challenges/valorant-3v3-xqz/bg/xqz-play-1080.webp', srcSmall: '/challenges/valorant-3v3-xqz/bg/xqz-play-1080.webp', alt: 'A player in a Valorant game on an XQZ PC' },
      { src: '/challenges/valorant-3v3-xqz/bg/xqz-lounge-1920.webp', srcSmall: '/challenges/valorant-3v3-xqz/bg/xqz-lounge-1080.webp', alt: 'Friends on the sofas in the XQZ console lounge' },
    ],
  },

  skirmish: [
    { icon: 'crosshair', text: 'No Spike. Only gunfights.' },
    { icon: 'users', text: 'Your 3 vs their 3.' },
    { icon: 'timer', text: 'First team to win 10 rounds wins. About 10 minutes per game.' },
  ],

  howItWorks: [
    { icon: 'card', text: 'Sign up on Khelo and pay.' },
    { icon: 'whatsapp', text: 'Join the Khelo community and follow us on Instagram.' },
    { icon: 'instagram', text: 'Friday, 4 Dec: we draw the bracket live on Instagram. You get your match time.' },
    { icon: 'pin', text: 'Saturday, 5 Dec: come to XQZ by 11:00 AM and check in.' },
    { icon: 'trophy', text: 'Play at your match time. Win and go to the next round.' },
  ],

  timeline: [
    { time: '11:00 AM', text: 'Report and check in' },
    { time: '11:45 AM', text: 'Check-in closes' },
    { time: '12:00 PM', text: 'First matches start' },
    { time: '1:20 PM', text: 'Quarterfinals' },
    { time: '2:00 PM', text: 'Semifinals (best of 3)' },
    { time: '2:50 PM', text: 'Final (best of 3)' },
    { time: '3:35 PM', text: 'Rewards and photos' },
  ],

  instagramReasons: [
    'Bracket draw goes live here on Friday, 4 Dec',
    'Your match time is posted here first',
    'Live scores on match day',
    'Best plays become reels. You get tagged',
    'Top teams announced here',
  ],

  lateRule: 'Matches start on time. If your team is not ready 5 minutes after your match time, you lose the match.',

  rules: [
    { group: 'Teams', items: [
      'Each team has 3 players. You can add 1 substitute when you sign up.',
      'The players who play must be the ones who signed up. We check names at check-in.',
      'A team can change players only by using its registered substitute.',
    ] },
    { group: 'Accounts', items: [
      'Use your own Riot account. All ranks are allowed.',
      'Keep your phone with you. Riot may send a login code to your email.',
      'Log in before your match time. Login problems do not stop the clock.',
    ] },
    { group: 'Match format', items: [
      'Mode: Skirmish, 3v3. First team to win 10 rounds wins the game.',
      'Round of 16 and quarterfinals: 1 game.',
      'Semifinals and final: best of 3 games. First to win 2 games wins.',
      '1-game matches: coin toss. The team that wins the toss picks the map.',
      'Best of 3: the team that wins the coin toss picks the first map. The team that lost game 1 picks the second map. The last map is game 3.',
    ] },
    { group: 'Time', items: [
      'Report at XQZ by 11:00 AM. Check-in closes at 11:45 AM.',
      'Your match starts at the time in the bracket. If your team is not seated 5 minutes after that time, you lose the match.',
      'If only 2 players are there, you can play 2 vs 3 or use your substitute. You cannot wait.',
    ] },
    { group: 'During the game', items: [
      'Each team gets 1 pause per game, up to 5 minutes, only for a PC or internet problem.',
      'If a player disconnects in the first 2 rounds, the game restarts. After that, the game continues. If they cannot come back in 5 minutes, the team plays 2 vs 3.',
      'If the power or internet goes off for everyone, the game is played again from 0-0.',
      'No cheats, scripts, macros or changing cafe PC settings. You will be removed with no refund.',
      'No abuse of players or staff. You will be removed with no refund.',
      "The admin's decision is final.",
    ] },
    { group: 'Rewards', items: [
      'Before rewards are given, we check the players match the sign-up names.',
      'Rewards go to the team captain on the same day. The team shares them.',
    ] },
  ],

  faq: [
    { q: "I don't have a team.", a: 'Sign up as solo. We will find you teammates.' },
    { q: 'Can I use my own account?', a: 'Yes, you must. Bring your phone, Riot may send a login code to your email.' },
    { q: 'What rank do I need?', a: 'All ranks can join. You may play against much stronger players.' },
    { q: 'What if my team is late?', a: 'You lose that match. Matches do not wait.' },
    { q: 'Can I get a refund?', a: 'No refund after 3 December. Full refund if the challenge is cancelled, or if you signed up solo and we could not find you a team.' },
    { q: 'What if fewer teams join?', a: 'We need at least 8 teams. If fewer join, the challenge is cancelled and everyone gets a full refund.' },
  ],

  agreeLine: 'I joined the Khelo community, I follow Khelo and XQZ on Instagram, I read the rules (if my team is late, we lose the match), I know there is no refund after 3 December (except if the challenge is cancelled or I am a solo player without a team), and I am OK with my photos and videos from the challenge being posted on Instagram.',

  // {link} is replaced with the captain's invite link.
  shareText: 'I signed us up for the Khelo Valorant 3v3 Challenge at XQZ on 5 Dec. Tap this link, log in, and fill your details: {link}',
  storyLine: "I'm playing the Khelo Valorant 3v3 Challenge",

  disclaimer: 'This challenge is not made, run or supported by Riot Games.',
};
