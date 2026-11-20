/**
 * "GTA 6 ready to play" ribbon that wraps the bottom-left corner of a photo, with a slow light pass across it.
 * White on the deep magenta-to-orange band keeps the text above 4.5:1. The motion stops for reduced-motion users.
 * Put it inside a `relative overflow-hidden` photo frame; it never catches taps.
 */
export function Gta6Sticker({ size = 'sm' }: { size?: 'sm' | 'lg' }) {
  const big = size === 'lg';
  const box = big ? 'h-[120px] w-[120px]' : 'h-[88px] w-[88px]';
  const band = big
    ? 'left-[-52px] top-[62px] w-[200px] py-[5px] text-[12px]'
    : 'left-[-40px] top-[46px] w-[150px] py-[3px] text-[9.5px]';
  return (
    <span className={`pointer-events-none absolute bottom-0 left-0 z-10 overflow-hidden ${box}`} aria-hidden="true">
      <span
        className={`absolute rotate-45 overflow-hidden bg-gradient-to-r from-[#9d174d] via-[#be185d] to-[#c2410c] text-center font-extrabold uppercase leading-tight tracking-[0.08em] text-white shadow-[0_2px_10px_rgba(0,0,0,0.45)] ${band}`}
      >
        <span className="relative z-10 block [text-shadow:0_1px_2px_rgba(0,0,0,0.5)]">GTA 6 · Ready to play</span>
        <span className="absolute inset-y-0 left-0 w-1/3 -skew-x-12 bg-gradient-to-r from-transparent via-white/45 to-transparent animate-gta-sheen motion-reduce:hidden" />
      </span>
    </span>
  );
}
