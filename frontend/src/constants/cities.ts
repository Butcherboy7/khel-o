// Cities KHEL-O accepts a café's address in, grouped by state so onboarding
// and profile editing can ask "which state, then which city" instead of one
// flat list. City is intentionally NOT free text (see the (customer)/page.tsx
// discovery filter, onboarding form, and EditCafeModal) — a café's stored
// `city` must exactly match one of these values, or it silently disappears
// from that city's filter while still showing under "All Cities". Keys must
// match INDIAN_STATES in ./states.ts exactly.
export const CITIES_BY_STATE: Record<string, string[]> = {
  'Andhra Pradesh': ['Visakhapatnam', 'Vijayawada', 'Guntur', 'Nellore', 'Tirupati', 'Kakinada', 'Rajahmundry', 'Kurnool'],
  'Arunachal Pradesh': ['Itanagar', 'Naharlagun', 'Pasighat'],
  'Assam': ['Guwahati', 'Silchar', 'Dibrugarh', 'Jorhat', 'Tezpur'],
  'Bihar': ['Patna', 'Gaya', 'Bhagalpur', 'Muzaffarpur', 'Darbhanga'],
  'Chhattisgarh': ['Raipur', 'Bhilai', 'Bilaspur', 'Durg', 'Korba'],
  'Goa': ['Panaji', 'Margao', 'Vasco da Gama', 'Mapusa'],
  'Gujarat': ['Ahmedabad', 'Surat', 'Vadodara', 'Rajkot', 'Bhavnagar', 'Jamnagar', 'Gandhinagar'],
  'Haryana': ['Gurugram', 'Faridabad', 'Panipat', 'Ambala', 'Karnal', 'Hisar'],
  'Himachal Pradesh': ['Shimla', 'Manali', 'Dharamshala', 'Solan'],
  'Jharkhand': ['Ranchi', 'Jamshedpur', 'Dhanbad', 'Bokaro'],
  'Karnataka': ['Bengaluru', 'Mysuru', 'Mangaluru', 'Hubballi', 'Belagavi', 'Kalaburagi'],
  'Kerala': ['Kochi', 'Thiruvananthapuram', 'Kozhikode', 'Thrissur', 'Kollam'],
  'Madhya Pradesh': ['Bhopal', 'Indore', 'Jabalpur', 'Gwalior', 'Ujjain'],
  'Maharashtra': ['Mumbai', 'Pune', 'Nagpur', 'Nashik', 'Aurangabad', 'Thane', 'Navi Mumbai', 'Kolhapur'],
  'Manipur': ['Imphal'],
  'Meghalaya': ['Shillong'],
  'Mizoram': ['Aizawl'],
  'Nagaland': ['Kohima', 'Dimapur'],
  'Odisha': ['Bhubaneswar', 'Cuttack', 'Rourkela', 'Puri'],
  'Punjab': ['Ludhiana', 'Amritsar', 'Jalandhar', 'Patiala', 'Mohali'],
  'Rajasthan': ['Jaipur', 'Jodhpur', 'Udaipur', 'Kota', 'Ajmer', 'Bikaner'],
  'Sikkim': ['Gangtok'],
  'Tamil Nadu': ['Chennai', 'Coimbatore', 'Madurai', 'Tiruchirappalli', 'Salem', 'Tirunelveli'],
  'Telangana': ['Hyderabad', 'Warangal', 'Nizamabad', 'Karimnagar'],
  'Tripura': ['Agartala'],
  'Uttar Pradesh': ['Lucknow', 'Kanpur', 'Noida', 'Ghaziabad', 'Agra', 'Varanasi', 'Meerut', 'Prayagraj'],
  'Uttarakhand': ['Dehradun', 'Haridwar', 'Rishikesh', 'Nainital', 'Haldwani'],
  'West Bengal': ['Kolkata', 'Howrah', 'Durgapur', 'Siliguri', 'Asansol'],
  'Delhi': ['Delhi'],
  'Jammu and Kashmir': ['Srinagar', 'Jammu'],
  'Ladakh': ['Leh', 'Kargil'],
  'Puducherry': ['Puducherry'],
  'Andaman and Nicobar Islands': ['Port Blair'],
  'Chandigarh': ['Chandigarh'],
  'Dadra and Nagar Haveli and Daman and Diu': ['Daman', 'Silvassa'],
  'Lakshadweep': ['Kavaratti'],
};

export const SUPPORTED_CITIES = Array.from(new Set(Object.values(CITIES_BY_STATE).flat())).sort();

// URL-safe form of a city name for /cafes/[city] routes, e.g. "Navi Mumbai" ->
// "navi-mumbai". One-way; use citySlugToName to resolve a slug back to the
// canonical stored city value.
export function citySlug(city: string): string {
  return city.toLowerCase().replace(/\s+/g, '-');
}

// Resolves a /cafes/[city] slug back to the exact city string stored on a
// café (city is not free text — see the comment on CITIES_BY_STATE), or null
// if the slug doesn't match any supported city.
export function citySlugToName(slug: string): string | null {
  const match = SUPPORTED_CITIES.find((city) => citySlug(city) === slug.toLowerCase());
  return match ?? null;
}
