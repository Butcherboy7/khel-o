/* The sunset behind the /gta6 headline: sky, a striped sun sitting on the
   horizon, two drifting cloud bars, ripples on the water and palm
   silhouettes. Our own drawing in CSS + SVG: no game art, logo or font.
   Motion lives in globals.css (.gta6-*) and only runs when motion is allowed. */

function Palm({ className, mirror = false }: { className: string; mirror?: boolean }) {
  return (
    <svg viewBox="0 0 160 240" className={`gta6-palm ${className}`} fill="currentColor" aria-hidden="true">
      <g transform={mirror ? 'translate(160 0) scale(-1 1)' : undefined}>
        <path d="M70 240C74 190 84 130 88 66h8c-2 64-10 124-12 174z" />
        <g className="gta6-fronds">
          <path d="M92 62C70 40 36 38 6 72c30-18 60-16 86-6z" />
          <path d="M92 62c24-22 56-20 66 18-20-24-44-24-66-14z" />
          <path d="M92 62C80 30 56 14 30 12c26 14 44 30 60 52z" />
          <path d="M92 62c12-34 38-46 60-40-24 8-44 22-58 42z" />
          <path d="M92 64c-18 2-42 20-52 48 18-24 34-36 52-44z" />
          <path d="M92 64c20 4 40 24 46 52-16-24-30-38-46-48z" />
          <circle cx="88" cy="70" r="4" />
          <circle cx="96" cy="70" r="4" />
          <circle cx="92" cy="76" r="4" />
        </g>
      </g>
    </svg>
  );
}

const RIPPLES = [
  { top: 7, w: 0.95, delay: 0 },
  { top: 16, w: 0.78, delay: 0.5 },
  { top: 27, w: 0.6, delay: 1 },
  { top: 40, w: 0.44, delay: 1.5 },
  { top: 55, w: 0.3, delay: 2 },
];

export function Gta6Scene() {
  return (
    <div aria-hidden="true" className="gta6-scene pointer-events-none absolute inset-x-0 top-0 h-[260px] overflow-hidden md:h-[460px]">
      <div className="gta6-sky" />
      <div className="gta6-twinkle" />
      <div className="gta6-sun-wrap">
        <div className="gta6-sun-glow" />
        <div className="gta6-sun" />
        <div className="gta6-cloud left-[-34%] top-[30%] w-[78%]" />
        <div className="gta6-cloud left-[46%] top-[44%] w-[92%] [animation-delay:-6s]" />
      </div>
      <div className="gta6-water" />
      <div className="gta6-reflect">
        {RIPPLES.map((r) => (
          <span
            key={r.top}
            className="gta6-ripple"
            style={{ top: r.top, width: `calc(var(--sun) * ${r.w})`, animationDelay: `${r.delay}s` }}
          />
        ))}
      </div>
      <Palm className="left-[-34px] h-[180px] w-[120px] md:left-[1%] md:h-[300px] md:w-[200px]" />
      <Palm
        mirror
        className="right-[-26px] h-[150px] w-[100px] [animation-delay:-3s] md:left-[44%] md:right-auto md:h-[230px] md:w-[154px]"
      />
      <div className="gta6-fade" />
    </div>
  );
}
