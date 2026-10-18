// Same screen as cafes/[city]/loading.tsx, one level up: Next 14 only puts a
// loading screen in a link's prefetch when the first URL segment that differs
// from the current page has one (from home that is `cafes/`). Without it a tap
// on a city link waited for the server before anything moved.
export { default } from './[city]/loading';
