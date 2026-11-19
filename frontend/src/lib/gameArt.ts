/**
 * Poster art for the "Games available" row.
 *
 * Official game covers are third-party copyright, so they are not bundled. Each game gets an original generated
 * poster (two colours from its name). To use real artwork once it is licensed or cleared, put the image in
 * `public/games/<key>.jpg` and add the key here: it replaces the generated poster everywhere.
 */
export const GAME_ART: Record<string, string> = {
  // Artwork already used across the app for the GTA 6 launch (credited on those pages).
  gta6: '/drops/gta6-square.jpg',
};

/** "GTA V Online" -> "gtavonline", "Counter-Strike 2" -> "counterstrike2". */
export function gameArtKey(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '');
}

export function gameArtFor(name: string): string | null {
  return GAME_ART[gameArtKey(name)] ?? null;
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Two dark colours for a poster, the same every time for the same game. Lightness stays low so white text on top
 * always clears 4.5:1.
 */
export function posterColors(name: string): { from: string; to: string } {
  const h = hash(gameArtKey(name)) % 360;
  return { from: `hsl(${h} 58% 30%)`, to: `hsl(${(h + 48) % 360} 62% 13%)` };
}
