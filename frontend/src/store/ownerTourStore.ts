import { create } from 'zustand';

/** Which step of the owner app tour is on screen. Lives outside the pages
 *  because the tour walks from page to page. */
interface OwnerTourState {
  open: boolean;
  step: number;
  start: () => void;
  goTo: (step: number) => void;
  close: () => void;
}

export const useOwnerTourStore = create<OwnerTourState>((set) => ({
  open: false,
  step: 0,
  start: () => set({ open: true, step: 0 }),
  goTo: (step) => set({ step }),
  close: () => set({ open: false }),
}));
