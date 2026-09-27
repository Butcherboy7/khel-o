import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

function generateSessionId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `sess-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

interface Attribution {
  source: string;
  medium: string | null;
  campaign: string | null;
}

/** The latest tagged visit: which campaign and which ad (utm_content)
 *  brought this visitor most recently. Stamped on every analytics event so
 *  an ad's funnel can be followed; signup attribution stays first-touch. */
export interface LastTouch {
  s: string;
  m: string | null;
  c: string | null;
  t: string | null;
  at: number;
}

/** Meta appends fbclid to every ad click, so an ad link whose UTM tags were
 *  lost or never set up is still recognisable as Meta traffic. */
function touchFromUrl(params: URLSearchParams): LastTouch | null {
  const source = params.get('utm_source') || (params.get('fbclid') ? 'meta' : null);
  if (!source) return null;
  const clip = (v: string | null) => (v ? v.slice(0, 100) : null);
  return {
    s: source.slice(0, 100),
    m: clip(params.get('utm_medium')) ?? (params.get('fbclid') ? 'paid_social' : null),
    c: clip(params.get('utm_campaign')),
    t: clip(params.get('utm_content')),
    at: Date.now(),
  };
}

// A campaign keeps credit for a visitor's actions for this long after they
// last arrived through it.
const TOUCH_TTL_MS = 30 * 24 * 60 * 60 * 1000;

interface AnalyticsState {
  sessionId: string;
  attribution: Attribution | null;
  lastTouch: LastTouch | null;
  /** Our own test device (opened once with ?internal=1): events are marked
   *  so campaign and traffic numbers leave them out. */
  internal: boolean;
  setInternal: (on: boolean) => void;
  /** The last touch if still within its window, else null. */
  currentTouch: () => LastTouch | null;
  captureAttributionFromUrl: (params: URLSearchParams) => void;
  captureAttribution: (source: string, medium: string | null, campaign: string | null) => void;
}

export const useAnalyticsStore = create<AnalyticsState>()(
  persist(
    (set, get) => ({
      sessionId: generateSessionId(),
      attribution: null,
      lastTouch: null,
      internal: false,
      setInternal: (on) => set({ internal: on }),
      currentTouch: () => {
        const touch = get().lastTouch;
        return touch && Date.now() - touch.at < TOUCH_TTL_MS ? touch : null;
      },
      captureAttributionFromUrl: (params) => {
        const touch = touchFromUrl(params);
        if (touch) set({ lastTouch: touch });
        // First-touch wins — never overwrite attribution already captured.
        if (get().attribution || !touch) return;
        const source = touch.s;
        set({
          attribution: {
            source,
            medium: touch.m,
            campaign: touch.c,
          },
        });
      },
      // Same first-touch-wins rule, for landing pages (e.g. /100) that carry
      // their attribution in the route itself rather than in query params.
      captureAttribution: (source, medium, campaign) => {
        if (get().attribution) return;
        set({ attribution: { source, medium, campaign } });
      },
    }),
    {
      name: 'khelo-analytics-storage',
      storage: createJSONStorage(() => localStorage),
    }
  )
);
