// The owner console picker: one entry per console model the café can pick. `model` is the exact string saved on the
// setup and must be in PLATFORM_MODELS (constants/platforms.ts, mirrored in backend/app/constants.py).
import type { Platform } from './platforms';

export type ConsolePlatform = Extract<Platform, 'playstation' | 'xbox' | 'nintendo'>;

export interface ConsoleModel {
  model: string;
  /** Photo in public/consoles/<key>.webp (credits in public/consoles/CREDITS.md). Missing photo -> platform icon. */
  key: string;
  hasPhoto: boolean;
  /** One plain line under the name. */
  blurb: string;
  /** "How do I tell?" tip in the info bubble. */
  tip: string;
  /** Customers see a "Plays GTA 6" tag on this setup (mirrors backend tier_runs_gta6). */
  playsGta6?: boolean;
}

export const CONSOLE_MODELS: Record<ConsolePlatform, ConsoleModel[]> = {
  playstation: [
    { model: 'PS5 Pro', key: 'ps5pro', hasPhoto: true, playsGta6: true, blurb: 'The newest, fastest PS5.',
      tip: 'Glossy black band in the middle and three thin lines on the side panels. Most come without a disc drive.' },
    { model: 'PS5 Slim', key: 'ps5slim', hasPhoto: false, playsGta6: true, blurb: 'The smaller PS5 sold since 2023.',
      tip: 'Smaller than the first PS5. Its white cover is split in two: the top half is shiny, the bottom half is matte. Same speed as the original.' },
    { model: 'PS5', key: 'ps5', hasPhoto: true, playsGta6: true, blurb: 'The original, bigger PS5 from 2020.',
      tip: 'Tall, with one-piece white covers that flare out like wings. Same speed as the Slim.' },
    { model: 'PS4 Pro', key: 'ps4pro', hasPhoto: true, blurb: 'The fastest PS4.',
      tip: 'Three stacked layers, like a sandwich. Plays PS4 games only, not PS5 games like GTA 6.' },
    { model: 'PS4 Slim', key: 'ps4slim', hasPhoto: true, blurb: 'The smaller PS4 with rounded edges.',
      tip: 'Thin, matte and rounded at the corners. Plays PS4 games only.' },
    { model: 'PS4', key: 'ps4', hasPhoto: true, blurb: 'The original PS4 from 2013.',
      tip: 'Slanted shape with a glossy half on top. Plays PS4 games only.' },
  ],
  xbox: [
    { model: 'Series X', key: 'seriesx', hasPhoto: true, playsGta6: true, blurb: "Xbox's fastest. A tall black tower.",
      tip: 'Black box that stands upright, with a green-tinted grille on top. Has a disc drive.' },
    { model: 'Series S', key: 'seriess', hasPhoto: true, playsGta6: true, blurb: 'The small white Xbox.',
      tip: 'Small and white with a round black vent. Digital only, no disc drive.' },
    { model: 'One X', key: 'onex', hasPhoto: true, blurb: 'The faster older Xbox (2017).',
      tip: 'Flat black box. Plays Xbox One games, not new Series-only games.' },
    { model: 'One S', key: 'ones', hasPhoto: true, blurb: 'The slim white older Xbox.',
      tip: 'Flat white box with dotted vents. Plays Xbox One games.' },
  ],
  nintendo: [
    { model: 'Switch 2', key: 'switch2', hasPhoto: true, blurb: 'The newest Switch (2025).',
      tip: 'Bigger screen, and the Joy-Cons snap on with magnets instead of sliding on rails.' },
    { model: 'Switch OLED', key: 'switcholed', hasPhoto: true, blurb: 'Switch with the bigger, brighter screen.',
      tip: '7-inch OLED screen, usually a white dock, and a wide stand on the back.' },
    { model: 'Switch', key: 'switch', hasPhoto: true, blurb: 'The original Switch.',
      tip: 'Detachable Joy-Cons, plugs into a TV with its dock.' },
    { model: 'Switch Lite', key: 'switchlite', hasPhoto: true, blurb: 'Handheld only.',
      tip: 'One piece, the controllers do not come off and it cannot connect to a TV. Not great for couch multiplayer.' },
  ],
};

export const isConsolePlatform = (p: Platform): p is ConsolePlatform =>
  p === 'playstation' || p === 'xbox' || p === 'nintendo';
