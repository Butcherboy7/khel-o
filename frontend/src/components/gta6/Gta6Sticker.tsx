/**
 * "GTA 6 ready" ribbon that wraps the bottom-left corner of a photo, with a slow light pass across it.
 * White on the deep magenta-to-orange band keeps the text above 4.5:1. The motion stops for reduced-motion users.
 * Put it inside a `relative overflow-hidden` photo frame; it never catches taps.
 *
 * Geometry: the corner is an S x S square. The band's centre sits on the cut line that is `d` long on each side, so
 * the text runs along a chord of d * 1.41, which is longer than the text.
 */
const SIZES = {
  sm: { s: 108, d: 66, w: 140, h: 17, font: 9.5 },
  lg: { s: 150, d: 92, w: 200, h: 23, font: 12.5 },
} as const;

export function Gta6Sticker({ size = 'sm' }: { size?: 'sm' | 'lg' }) {
  const { s, d, w, h, font } = SIZES[size];
  const cx = d / 2;
  const cy = s - d / 2;
  return (
    <span className="pointer-events-none absolute bottom-0 left-0 z-10 overflow-hidden" style={{ width: s, height: s }} aria-hidden="true">
      <span
        className="absolute flex items-center justify-center overflow-hidden bg-gradient-to-r from-[#9d174d] via-[#be185d] to-[#c2410c] font-extrabold uppercase tracking-[0.08em] text-white shadow-[0_2px_10px_rgba(0,0,0,0.45)]"
        style={{ left: cx - w / 2, top: cy - h / 2, width: w, height: h, fontSize: font, transform: 'rotate(45deg)' }}
      >
        <span className="relative z-10 whitespace-nowrap [text-shadow:0_1px_2px_rgba(0,0,0,0.5)]">GTA 6 ready</span>
        <span className="absolute inset-y-0 left-0 w-1/3 -skew-x-12 bg-gradient-to-r from-transparent via-white/45 to-transparent animate-gta-sheen motion-reduce:hidden" />
      </span>
    </span>
  );
}
