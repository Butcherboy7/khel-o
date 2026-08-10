import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

interface LocationState {
  selectedCity: string;
  lastVisitedCafeId: string | null;
  setSelectedCity: (city: string) => void;
  setLastVisitedCafeId: (cafeId: string | null) => void;
}

export const useLocationStore = create<LocationState>()(
  persist(
    (set) => ({
      selectedCity: 'All Cities',
      lastVisitedCafeId: null,
      setSelectedCity: (city) => set({ selectedCity: city }),
      setLastVisitedCafeId: (cafeId) => set({ lastVisitedCafeId: cafeId }),
    }),
    {
      name: 'khelo-location-storage',
      storage: createJSONStorage(() => sessionStorage),
    }
  )
);
