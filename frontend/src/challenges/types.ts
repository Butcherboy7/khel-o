/** A curated team challenge: the words and media its pages show. Prices,
 *  slots and counts come from the API (the server enforces them). */
export type TeamIcon = 'crosshair' | 'users' | 'timer' | 'card' | 'whatsapp' | 'instagram' | 'pin' | 'trophy';

export interface TeamChallengeConfig {
  slug: string;
  title: string;
  /** The two lines of the big hero title. */
  titleTop: string;
  titleBottom: string;
  subtitle: string;
  game: string;
  mode: string;
  prizeTotal: number;
  venue: {
    name: string;
    shortName: string;
    city: string;
    address: string;
    googleMapsUrl: string;
    /** The café's own logo (white on transparent), shown beside KHEL-O in the header. */
    logo: string;
    instagramHandle: string | null;
    /** The café's KHEL-O page, for practice bookings. */
    bookingSlug: string | null;
  };
  links: {
    kheloInstagramHandle: string;
    communityInvite: string;
    /** Digits with country code, e.g. 919876543210. */
    supportWhatsApp: string | null;
    /** Shown with WhatsApp: a number to call and an email for any problem. */
    supportPhone?: string | null;
    supportEmail?: string | null;
  };
  sponsors: { name: string; logo: string; url: string | null }[];
  dates: {
    registrationCloses: string;
    soloRefundBy: string;
    bracketDraw: string;
    reportingTime: string;
    checkInCloses: string;
    firstMatch: string;
  };
  prizes: { place: number; label: string; cash: number }[];
  prizeExtra: string;
  /** The line under the rewards: who gives them. */
  sponsorLine: string;
  media: {
    heroVideo: string;
    heroPoster: string;
    photos: { src: string; srcSmall: string; alt: string }[];
  };
  /** What the cafe provides, so nobody brings their own setup. */
  provided: { headline: string; line: string; specs: { label: string; value: string }[]; extras: string };
  skirmish: { icon: TeamIcon; text: string }[];
  howItWorks: { icon: TeamIcon; text: string }[];
  timeline: { time: string; text: string }[];
  instagramReasons: string[];
  lateRule: string;
  rules: { group: string; items: string[] }[];
  faq: { q: string; a: string }[];
  /** The one checkbox before paying. */
  agreeLine: string;
  /** Invite message; {link} becomes the captain's link. Plain text so the config can pass from server to client. */
  shareText: string;
  storyLine: string;
  disclaimer: string;
}
