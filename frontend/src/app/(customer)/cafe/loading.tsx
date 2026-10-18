// Same screen as cafe/[id]/loading.tsx, one level up, and it has to be here:
// Next 14 prefetches a link from the first URL segment that differs from the
// current page, and leaves the loading screen out of the prefetch when that
// segment has no loading file. From home that segment is `cafe/`, so without
// this file a tap on a café card waited for the server before anything moved.
export { default } from './[id]/loading';
