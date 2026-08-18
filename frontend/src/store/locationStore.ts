import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

interface LocationState {
  selectedCity: string;
  lastVisitedCafeId: string | null;
  userLat: number | null;
  userLng: number | null;
  setSelectedCity: (city: string) => void;
  setLastVisitedCafeId: (cafeId: string | null) => void;
  setUserCoords: (lat: number, lng: number) => void;
}

export const useLocationStore = create<LocationState>()(
  persist(
    (set) => ({
      selectedCity: 'All Cities',
      lastVisitedCafeId: null,
      userLat: null,
      userLng: null,
      setSelectedCity: (city) => set({ selectedCity: city }),
      setLastVisitedCafeId: (cafeId) => set({ lastVisitedCafeId: cafeId }),
      setUserCoords: (lat, lng) => set({ userLat: lat, userLng: lng }),
    }),
    {
      name: 'khelo-location-storage',
      storage: createJSONStorage(() => sessionStorage),
    }
  )
);
