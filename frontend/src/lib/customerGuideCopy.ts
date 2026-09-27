// All customer-facing guidance copy. Hints are one quiet line each, shown to
// first-timers only; ⓘ texts explain jargon and are always available.

export const CUSTOMER_HINTS = {
  explore: 'Tap a café to see its prices, setups and free time slots.',
  cafe: 'Pick a setup below, then tap Book now. No need to call the café.',
  booking: 'Choose a time and pay online. Your booking is confirmed instantly.',
  pass: "You're booked! Show this QR at the café desk when you arrive and you're in.",
} as const;

export type CustomerHintId = keyof typeof CUSTOMER_HINTS;

export const CUSTOMER_INFO = {
  platformFee:
    "A small fee that keeps KHEL-O running: secure online payment and instant confirmation. The café's own price is unchanged.",
  coop:
    'Co-op = friends share one console, with a controller each. Cheaper per head, but only for games you play together on one screen (FC, Tekken, It Takes Two).',
  coopNotice:
    "Co-op means one console, one screen. Pick a game you can play together, like FC, Tekken or It Takes Two. GTA story mode won't work.",
  minTime: 'The shortest session this café allows for this setup.',
} as const;

/** A hint stops appearing after this many sightings. */
export const HINT_VIEWS = 3;
