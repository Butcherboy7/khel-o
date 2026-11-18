// Cafés that told us they have pre-ordered GTA 6 (confirmed by KHEL-O).
// Only these get the "Pre-ordered" stamp; a PS5 café that joins later shows
// without it until it's confirmed and added here.
export const PREORDERED_CAFE_IDS = new Set([
  '73484598-b6a8-4118-82b9-7df16d03ed05', // DG Gaming Cafe
  '69a24177-fc5f-4c07-a792-dacf7c2d147b', // Rockstar Gaming Cafe
  '596ebec6-7dd5-480a-bf40-327d7f4c1e7e', // AdamsDen Gaming Lounge (told KHEL-O 2026-10-18)
]);

export const GTA6_RELEASE = { iso: '2026-11-19', label: '19 November 2026' };

// [slug, shown name, the city names a café's address can carry (see constants/cities.ts)]
const CITY_ROWS: [string, string, string[]][] = [
  ['hyderabad', 'Hyderabad', ['Hyderabad']],
  ['bengaluru', 'Bengaluru', ['Bengaluru']],
  ['mumbai', 'Mumbai', ['Mumbai', 'Thane', 'Navi Mumbai']],
  ['delhi', 'Delhi NCR', ['Delhi', 'Gurugram', 'Noida', 'Ghaziabad', 'Faridabad']],
  ['chennai', 'Chennai', ['Chennai']],
  ['pune', 'Pune', ['Pune']],
  ['kolkata', 'Kolkata', ['Kolkata', 'Howrah']],
  ['ahmedabad', 'Ahmedabad', ['Ahmedabad', 'Gandhinagar']],
  ['jaipur', 'Jaipur', ['Jaipur']],
  ['lucknow', 'Lucknow', ['Lucknow']],
  ['chandigarh', 'Chandigarh', ['Chandigarh', 'Mohali']],
  ['surat', 'Surat', ['Surat']],
  ['indore', 'Indore', ['Indore']],
  ['bhopal', 'Bhopal', ['Bhopal']],
  ['nagpur', 'Nagpur', ['Nagpur']],
  ['kochi', 'Kochi', ['Kochi']],
  ['thiruvananthapuram', 'Thiruvananthapuram', ['Thiruvananthapuram']],
  ['coimbatore', 'Coimbatore', ['Coimbatore']],
  ['visakhapatnam', 'Visakhapatnam', ['Visakhapatnam']],
  ['vijayawada', 'Vijayawada', ['Vijayawada', 'Guntur']],
  ['patna', 'Patna', ['Patna']],
  ['bhubaneswar', 'Bhubaneswar', ['Bhubaneswar', 'Cuttack']],
  ['guwahati', 'Guwahati', ['Guwahati']],
  ['ranchi', 'Ranchi', ['Ranchi']],
  ['raipur', 'Raipur', ['Raipur']],
  ['dehradun', 'Dehradun', ['Dehradun']],
  ['vadodara', 'Vadodara', ['Vadodara']],
  ['rajkot', 'Rajkot', ['Rajkot']],
  ['mysuru', 'Mysuru', ['Mysuru']],
  ['mangaluru', 'Mangaluru', ['Mangaluru']],
  ['nashik', 'Nashik', ['Nashik']],
  ['kanpur', 'Kanpur', ['Kanpur']],
  ['agra', 'Agra', ['Agra']],
  ['varanasi', 'Varanasi', ['Varanasi']],
  ['ludhiana', 'Ludhiana', ['Ludhiana']],
  ['amritsar', 'Amritsar', ['Amritsar']],
  ['jodhpur', 'Jodhpur', ['Jodhpur']],
  ['udaipur', 'Udaipur', ['Udaipur']],
  ['goa', 'Goa', ['Panaji', 'Margao', 'Mapusa', 'Vasco da Gama']],
  ['madurai', 'Madurai', ['Madurai']],
  ['jammu', 'Jammu', ['Jammu']],
];

/** The pages under /gta6/<slug>. "india" lists every city KHEL-O has a PS5 café in. */
export const GTA6_PLACES: Record<string, { name: string; cities: string[] }> = {
  ...Object.fromEntries(CITY_ROWS.map(([slug, name, cities]) => [slug, { name, cities }])),
  india: { name: 'India', cities: CITY_ROWS.flatMap(([, , cities]) => cities) },
};

/** Every city page, not the all-India one. */
export const GTA6_CITY_SLUGS = CITY_ROWS.map(([slug]) => slug);

/** The biggest cities, linked from the top of /gta6 and /gta6/near-me. */
export const GTA6_TOP_CITY_SLUGS = ['hyderabad', 'bengaluru', 'mumbai', 'delhi', 'chennai', 'pune', 'kolkata', 'ahmedabad'];
