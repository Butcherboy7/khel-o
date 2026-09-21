import { apiClient, call } from './client';

export interface LocationResult {
  id: number;
  name: string;
  state: string;
  district: string | null;
  pincode: string | null;
}

// GET /api/v1/locations/search
// query may be '' — the backend treats an empty/omitted q as a state-only
// "popular cities" query (ordered by name) when state is provided, used by
// LocationSearchInput's on-focus prefetch before the owner types anything.
export async function searchLocations(query: string, state?: string): Promise<LocationResult[]> {
  return call<LocationResult[]>(() =>
    apiClient.get('/api/v1/locations/search', { params: { q: query || undefined, state } })
  );
}

// POST /api/v1/locations — get-or-create
export async function createLocation(params: {
  name: string;
  state: string;
  district?: string;
  pincode?: string;
}): Promise<LocationResult> {
  return call<LocationResult>(() => apiClient.post('/api/v1/locations', params));
}
