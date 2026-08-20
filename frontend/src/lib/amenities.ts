import {
  Wifi,
  Snowflake,
  Keyboard,
  Monitor,
  Armchair,
  Coffee,
  Gamepad2,
  Video,
  Trophy,
  Car,
  Volume2,
  BatteryCharging,
  Moon,
  Users,
  DoorClosed,
  Glasses,
  Headphones,
  GraduationCap,
  Lock,
  ParkingCircle,
  Sparkles,
  Droplets,
  MessageCircle,
  Accessibility,
  type LucideIcon,
} from 'lucide-react';

interface AmenityDisplay {
  icon: LucideIcon;
  label: string;
}

/**
 * Café amenities are stored as either snake_case slugs (seeded/backend data,
 * e.g. "fiber_1gbps", "ps5_pods") or Title Case strings (owner-entered via
 * the AMENITY_OPTIONS picker, e.g. "Air Conditioning"). Both get normalized
 * to the same snake_case key before lookup so either format resolves.
 */
export function normalizeAmenityKey(raw: string): string {
  return raw
    .toLowerCase()
    .trim()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

const AMENITY_MAP: Record<string, AmenityDisplay> = {
  wifi: { icon: Wifi, label: 'Wi-Fi' },
  high_speed_wifi: { icon: Wifi, label: 'High-Speed Wi-Fi' },
  high_speed_wi_fi: { icon: Wifi, label: 'High-Speed Wi-Fi' },
  fiber_1gbps: { icon: Wifi, label: '1Gbps Fiber' },
  fiber_network: { icon: Wifi, label: 'Fiber Network' },
  high_speed_fiber: { icon: Wifi, label: 'High-Speed Fiber' },
  dedicated_gigabit: { icon: Wifi, label: 'Dedicated Gigabit' },
  free_wi_fi: { icon: Wifi, label: 'Wi-Fi' },
  free_water: { icon: Droplets, label: 'Free Water' },

  ac: { icon: Snowflake, label: 'Air Conditioning' },
  air_conditioning: { icon: Snowflake, label: 'Air Conditioning' },
  air_conditioned: { icon: Snowflake, label: 'Air Conditioning' },

  mechanical_keyboards: { icon: Keyboard, label: 'Mechanical Keyboards' },

  high_refresh_monitors: { icon: Monitor, label: 'High-Refresh Monitors' },
  '4k_monitors': { icon: Monitor, label: '4K Monitors' },

  ergonomic_chairs: { icon: Armchair, label: 'Ergonomic Chairs' },

  snack_bar: { icon: Coffee, label: 'Snack Bar' },
  snacks: { icon: Coffee, label: 'Snacks' },
  snacks_and_beverages: { icon: Coffee, label: 'Snacks & Beverages' },
  food_beverages: { icon: Coffee, label: 'Food & Beverages' },
  cafe: { icon: Coffee, label: 'Café' },
  cafe_bar: { icon: Coffee, label: 'Café Bar' },
  gaming_cafeteria: { icon: Coffee, label: 'Gaming Cafeteria' },
  midnight_kitchen: { icon: Coffee, label: 'Midnight Kitchen' },
  cafe_and_snacks: { icon: Coffee, label: 'Café & Snacks' },
  discord_booth: { icon: MessageCircle, label: 'Discord Booth' },

  ps5_pods: { icon: Gamepad2, label: 'PS5 Pods' },
  ps5_zone: { icon: Gamepad2, label: 'PS5 Zone' },
  ps5_consoles: { icon: Gamepad2, label: 'PS5 Consoles' },
  xbox_series_x: { icon: Gamepad2, label: 'Xbox Series X' },
  console_lounge: { icon: Gamepad2, label: 'Console Lounge' },

  streaming_booth: { icon: Video, label: 'Streaming Booth' },
  streamer_pods: { icon: Video, label: 'Streamer Pods' },
  broadcast_studio: { icon: Video, label: 'Broadcast Studio' },
  streaming_setup: { icon: Video, label: 'Streaming Setup' },

  tournament_stage: { icon: Trophy, label: 'Tournament Stage' },
  tournament_area: { icon: Trophy, label: 'Tournament Area' },

  sim_racing: { icon: Car, label: 'Sim Racing' },

  surround_sound: { icon: Volume2, label: 'Surround Sound' },

  valet_parking: { icon: ParkingCircle, label: 'Valet Parking' },
  parking: { icon: ParkingCircle, label: 'Parking' },

  power_backup: { icon: BatteryCharging, label: 'Power Backup' },

  overnight_passes: { icon: Moon, label: 'Overnight Passes' },
  '24_7_open': { icon: Moon, label: '24/7 Open' },

  bootcamp_rooms: { icon: Users, label: 'Bootcamp Rooms' },

  private_booths: { icon: DoorClosed, label: 'Private Booths' },

  vr_headsets: { icon: Glasses, label: 'VR Headsets' },

  noise_cancelling_headsets: { icon: Headphones, label: 'Noise-Cancelling Headsets' },

  coaching_sessions: { icon: GraduationCap, label: 'Coaching Sessions' },

  locker_storage: { icon: Lock, label: 'Locker Storage' },

  restrooms: { icon: Sparkles, label: 'Restrooms' },
  washroom: { icon: Sparkles, label: 'Restrooms' },
  wheelchair_accessible: { icon: Accessibility, label: 'Wheelchair Accessible' },
};

const DEFAULT_DISPLAY: AmenityDisplay = { icon: Sparkles, label: '' };

export function getAmenityDisplay(raw: string): AmenityDisplay {
  const key = normalizeAmenityKey(raw);
  const match = AMENITY_MAP[key];
  if (match) return match;

  // Fallback: title-case the raw slug/string so unmapped amenities still
  // render sensibly instead of silently disappearing.
  const label = raw
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
  return { ...DEFAULT_DISPLAY, label };
}
