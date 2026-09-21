import { apiClient, call } from './client';

export interface LocationResult {
  id: number;
  name: string;
  state: string;
  district: string | null;
  pincode: string | null;
}

// GET /api/v1/locations/search
export async function searchLocations(q: string, state?: string): Promise<LocationResult[]> {
  return call<LocationResult[]>(() =>
    apiClient.get('/api/v1/locations/search', { params: { q, state } })
  );
}
