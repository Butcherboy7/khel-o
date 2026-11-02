import type { Metadata } from 'next';

// Short link khel-o.com/r/adamsden for the Tekken #01 "rate AdamsDen" ask.
// A real page (not a redirect) so WhatsApp's link preview shows its own banner.
const CAFE_PATH = '/cafe/adamsden-gaming-lounge-kukatpally-hosuing-board-colony';
const TARGET = `${CAFE_PATH}?utm_source=whatsapp&utm_medium=review&utm_campaign=tekken-01-reviews#write-review`;

export const metadata: Metadata = {
  title: 'How was AdamsDen? Rate it in 30 seconds',
  description: 'You were there for Tekken #01. Leave a star rating and one line. It helps the next gamer pick a good spot.',
  robots: { index: false, follow: true },
  alternates: { canonical: CAFE_PATH },
};

function Star({ size = 44 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#F5B301" d="M12 2l2.9 6.6 7.1.6-5.4 4.7 1.7 7-6.3-3.8-6.3 3.8 1.7-7L2 9.2l7.1-.6z" />
    </svg>
  );
}

export default function RateAdamsDenPage() {
  return (
    <main className="mx-auto flex min-h-[80vh] max-w-md flex-col items-center justify-center gap-5 px-4 py-10 text-center">
      <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#D0463C]">Tekken Challenge #01 · AdamsDen</p>
      <h1 className="text-4xl font-extrabold leading-tight">How was AdamsDen?</h1>
      <div className="flex gap-1.5">{[0, 1, 2, 3, 4].map((i) => <Star key={i} />)}</div>
      <p className="text-base text-muted-foreground">
        You were there. Give it a star rating and one line. It takes 30 seconds, and it helps the next gamer trust the spot.
      </p>
      <a
        href={TARGET}
        className="w-full rounded-2xl bg-[#D0463C] px-6 py-4 text-lg font-bold text-white shadow-lg active:scale-[0.98]"
      >
        Rate AdamsDen ★
      </a>
      <p className="text-xs text-muted-foreground">You will need a KHEL-O account. Signing up is free.</p>
    </main>
  );
}
