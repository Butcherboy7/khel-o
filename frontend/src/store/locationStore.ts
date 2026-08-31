import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

interface LocationState {
  selectedCity: string;
  lastVisitedCafeId: string | null;
  userLat: number | null;
  userLng: number | null;
  /** True only when selectedCity was set from the device's actual GPS
      position (handleDetectLocation), not a manual city pick — lets the UI
      say "Using current location" instead of implying every city label came
      from geolocation. */
  isPreciseLocation: boolean;
  setSelectedCity: (city: string, opts?: { precise?: boolean }) => void;
  setLastVisitedCafeId: (cafeId: string | null) => void;
  setUserCoords: (lat: number, lng: number) => void;
  /** Resets to the "no location chosen" state — the explicit, easy way to
      back out of a city/GPS pick rather than digging through the dropdown. */
  clearLocation: () => void;
}

export const useLocationStore = create<LocationState>()(
  persist(
    (set) => ({
      selectedCity: 'All Cities',
      lastVisitedCafeId: null,
      userLat: null,
      userLng: null,
      isPreciseLocation: false,
      setSelectedCity: (city, opts) =>
        set({ selectedCity: city, isPreciseLocation: opts?.precise ?? false }),
      setLastVisitedCafeId: (cafeId) => set({ lastVisitedCafeId: cafeId }),
      setUserCoords: (lat, lng) => set({ userLat: lat, userLng: lng }),
      clearLocation: () =>
        set({ selectedCity: 'All Cities', userLat: null, userLng: null, isPreciseLocation: false }),
    }),
    {
      // localStorage, not sessionStorage — a detected/selected city should
      // survive closing the app, not just the current tab session, or the
      // user has to re-detect their location every single time they open it.
      name: 'khelo-location-storage',
      storage: createJSONStorage(() => localStorage),
    }
  )
);
