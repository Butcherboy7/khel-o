// Cafés that told us they have pre-ordered GTA 6 (confirmed by KHEL-O).
// Only these get the "Pre-ordered" stamp; a PS5 café that joins later shows
// without it until it's confirmed and added here.
export const PREORDERED_CAFE_IDS = new Set([
  '73484598-b6a8-4118-82b9-7df16d03ed05', // DG Gaming Cafe
  '69a24177-fc5f-4c07-a792-dacf7c2d147b', // Rockstar Gaming Cafe
  '596ebec6-7dd5-480a-bf40-327d7f4c1e7e', // AdamsDen Gaming Lounge (told KHEL-O 2026-10-18)
]);

export const GTA6_RELEASE = { iso: '2026-11-19', label: '19 November 2026' };

/** The pages under /gta6/<slug>. "india" lists every city KHEL-O has a PS5 café in. */
export const GTA6_PLACES: Record<string, { name: string; cities: string[] }> = {
  hyderabad: { name: 'Hyderabad', cities: ['Hyderabad'] },
  bengaluru: { name: 'Bengaluru', cities: ['Bengaluru'] },
  india: { name: 'India', cities: ['Hyderabad', 'Bengaluru'] },
};
