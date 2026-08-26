// Mirrors backend/app/constants.py's PLATFORM_MODELS exactly — keep both
// lists in sync if either changes. Fixed list, no admin-editable source,
// same decision as SUPPORTED_CITIES (constants/cities.ts).
export type Platform = 'pc' | 'playstation' | 'xbox' | 'nintendo' | 'other';

export const PLATFORMS: { value: Platform; label: string }[] = [
  { value: 'pc', label: 'PC Gaming' },
  { value: 'playstation', label: 'PlayStation' },
  { value: 'xbox', label: 'Xbox' },
  { value: 'nintendo', label: 'Nintendo' },
  { value: 'other', label: 'Other' },
];

export const PLATFORM_MODELS: Record<Exclude<Platform, 'other'>, string[]> = {
  pc: ['RTX 4090', 'RTX 4070', 'RTX 3060', 'Budget', 'Custom'],
  playstation: ['PS5 Pro', 'PS5', 'PS4 Pro', 'PS4', 'Custom'],
  xbox: ['Series X', 'Series S', 'One X', 'One S', 'Custom'],
  nintendo: ['Switch OLED', 'Switch', 'Switch Lite', 'Custom'],
};
