// Single source of truth for the cities KHEL-O currently operates in.
// City is intentionally NOT free text (see the (customer)/page.tsx discovery
// filter, onboarding form, and EditCafeModal) — a café's stored `city` must
// exactly match one of these values, or it silently disappears from that
// city's filter while still showing under "All Cities". Add a new city here
// when the platform actually launches there.
export const SUPPORTED_CITIES = ['Bengaluru', 'Delhi', 'Hyderabad', 'Mumbai', 'Pune'];
