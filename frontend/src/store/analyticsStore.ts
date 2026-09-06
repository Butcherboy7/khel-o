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

interface AnalyticsState {
  sessionId: string;
  attribution: Attribution | null;
  captureAttributionFromUrl: (params: URLSearchParams) => void;
}

export const useAnalyticsStore = create<AnalyticsState>()(
  persist(
    (set, get) => ({
      sessionId: generateSessionId(),
      attribution: null,
      captureAttributionFromUrl: (params) => {
        // First-touch wins — never overwrite attribution already captured.
        if (get().attribution) return;
        const source = params.get('utm_source');
        if (!source) return;
        set({
          attribution: {
            source,
            medium: params.get('utm_medium'),
            campaign: params.get('utm_campaign'),
          },
        });
      },
    }),
    {
      name: 'khelo-analytics-storage',
      storage: createJSONStorage(() => localStorage),
    }
  )
);
