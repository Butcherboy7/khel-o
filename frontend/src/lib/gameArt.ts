/**
 * Poster art for the "Games available" row.
 *
 * Games with licensed artwork (the founder confirmed they hold permission) use it; every other game gets an original
 * generated poster (two colours from its name). To add artwork, put the image in `public/games/<key>.jpg` and add the
 * key here: it replaces the generated poster everywhere.
 */
const steam = (file: string) => `/games/${file}.jpg`;

export const GAME_ART: Record<string, string> = {
  // Artwork already used across the app for the GTA 6 launch.
  gta6: '/drops/gta6-square.jpg',
  // Official store portrait art, used with the founder's licence (see public/games). Several spellings per game
  // because cafés type names themselves.
  counterstrike2: steam('counterstrike2'), cs2: steam('counterstrike2'), counterstrike: steam('counterstrike2'),
  dota2: steam('dota2'),
  gtav: steam('gtav'), gta5: steam('gtav'), gtavonline: steam('gtav'), gta5online: steam('gtav'), grandtheftautov: steam('gtav'),
  apexlegends: steam('apexlegends'), apex: steam('apexlegends'),
  mortalkombat1: steam('mortalkombat1'), mortalkombat: steam('mortalkombat1'), mk1: steam('mortalkombat1'), mortalkombat11: steam('mortalkombat1'),
  tekken8: steam('tekken8'), tekken: steam('tekken8'),
  halflifealyx: steam('halflifealyx'),
  beatsaber: steam('beatsaber'),
  godofwarragnarok: steam('godofwarragnarok'), godofwarragnark: steam('godofwarragnarok'), godofwar: steam('godofwarragnarok'),
  ghostoftsushima: steam('ghostoftsushima'),
  spidermanmilesmorales: steam('spidermanmilesmorales'),
  spiderman2: steam('spiderman2'), marvelsspiderman2: steam('spiderman2'), marvelsspiderman: steam('spiderman2'), spiderman: steam('spiderman2'),
  eafc24: steam('eafc24'), easportsfc24: steam('eafc24'),
  eafc25: steam('eafc25'), easportsfc25: steam('eafc25'), fifa: steam('eafc25'), eafc: steam('eafc25'), easportsfc: steam('eafc25'), fc25: steam('eafc25'),
  forza: steam('forzahorizon5'), forzahorizon5: steam('forzahorizon5'),
  callofduty: steam('callofduty'), callofdutywarzone: steam('callofduty'), callofdutymodernwarfareiii: steam('callofduty'), warzone: steam('callofduty'), cod: steam('callofduty'),
  needforspeed: steam('needforspeedunbound'), nfs: steam('needforspeedunbound'), needforspeedunbound: steam('needforspeedunbound'),
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
