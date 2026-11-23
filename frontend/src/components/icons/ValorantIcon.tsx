import type { SVGProps } from 'react';
import { Swords } from 'lucide-react';

/** The Valorant "V" mark (glyph only), drawn as inline SVG so gamers recognise it at a glance. */
export function ValorantIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}>
      <path d="M2.4 5.4v3.2l9.6 11.6h4.1L2.4 5.4z" />
      <path d="M21.6 5.4v5.5l-4.4 5.7-1.9-2.3 6.3-8.9z" />
    </svg>
  );
}

/** The icon for a challenge: the Valorant mark for Valorant ones, crossed swords for the rest. */
export function ChallengeGlyph({ game, className }: { game?: string | null; className?: string }) {
  return /valorant/i.test(game ?? '') ? <ValorantIcon className={className} /> : <Swords className={className} aria-hidden />;
}
