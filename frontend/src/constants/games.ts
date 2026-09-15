// Per-platform preset game libraries shown as toggle chips in the onboarding
// wizard's Games step (see PlatformTierConfigurator for the matching
// per-platform resource-tier pattern this mirrors). 'other' has no fixed
// picklist — those venues only get the custom-game text entry.
import type { Platform } from './platforms';

export const PRESET_GAMES_BY_PLATFORM: Record<Exclude<Platform, 'other'>, string[]> = {
  pc: [
    'Valorant',
    'Counter-Strike 2',
    'GTA V Online',
    'EA Sports FC 24',
    'Dota 2',
    'Apex Legends',
    'Fortnite',
    'Call of Duty: Warzone',
    'League of Legends',
    'Overwatch 2',
    'Tekken 8',
    'Rocket League',
  ],
  playstation: [
    'EA Sports FC 24',
    'God of War Ragnarök',
    "Marvel's Spider-Man 2",
    'Gran Turismo 7',
    'Tekken 8',
    'Mortal Kombat 1',
    'NBA 2K24',
    'Call of Duty: Modern Warfare III',
    'Elden Ring',
    'Street Fighter 6',
  ],
  xbox: [
    'EA Sports FC 24',
    'Forza Motorsport',
    'Halo Infinite',
    'Gears 5',
    'Call of Duty: Modern Warfare III',
    'Tekken 8',
    'NBA 2K24',
    'Elden Ring',
    'Sea of Thieves',
    'Street Fighter 6',
  ],
  nintendo: [
    'Mario Kart 8 Deluxe',
    'Super Smash Bros. Ultimate',
    'The Legend of Zelda: Tears of the Kingdom',
    'Splatoon 3',
    'Animal Crossing: New Horizons',
    'Mario Party Superstars',
  ],
};
