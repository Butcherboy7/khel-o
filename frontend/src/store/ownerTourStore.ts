import { create } from 'zustand';
import { fullTour, pageLesson, type PlayStep } from '@/lib/ownerTourCopy';
import type { GuidePage } from '@/lib/ownerGuideCopy';

/** The owner Tutorial as it plays. Lives outside the pages because the full
 *  tutorial walks from page to page. */
interface OwnerTourState {
  /** OwnerTour is mounted (owners only), so Tutorial buttons can show. */
  enabled: boolean;
  open: boolean;
  /** 'full' saves done/skipped on the account; a page lesson doesn't. */
  mode: 'full' | 'lesson';
  steps: PlayStep[];
  step: number;
  setEnabled: (enabled: boolean) => void;
  /** The whole tutorial, from the dashboard. */
  start: () => void;
  /** One page's lesson, on that page. */
  startLesson: (page: GuidePage, href: string) => void;
  goTo: (step: number) => void;
  close: () => void;
}

export const useOwnerTourStore = create<OwnerTourState>((set) => ({
  enabled: false,
  open: false,
  mode: 'full',
  steps: [],
  step: 0,
  setEnabled: (enabled) => set({ enabled }),
  start: () => set({ open: true, mode: 'full', steps: fullTour(), step: 0 }),
  startLesson: (page, href) => set({ open: true, mode: 'lesson', steps: pageLesson(page, href), step: 0 }),
  goTo: (step) => set({ step }),
  close: () => set({ open: false }),
}));
