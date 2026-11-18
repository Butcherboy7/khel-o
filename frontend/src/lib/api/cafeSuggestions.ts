import { apiClient, call } from './client';

/** "Suggest a café": anyone can tell us about a café that is not on KHEL-O yet.
 *  See backend app/api/v1/cafe_suggestions.py. */

export type SuggestionStatus = 'new' | 'contacted' | 'listed' | 'no_answer';

export interface SuggestCafeBody {
  cafeName: string;
  city: string;
  mapsUrl?: string;
  cafePhone?: string;
  suggesterName: string;
  suggesterPhone: string;
  source?: string;
  formTicket?: string;
  website?: string;
}

export interface CafeSuggestionRow {
  id: string;
  cafeName: string;
  city: string;
  mapsUrl: string | null;
  cafePhone: string | null;
  note: string | null;
  suggesterName: string;
  suggesterPhone: string;
  status: SuggestionStatus;
  source: string | null;
  createdAt: string;
}

export async function suggestCafe(body: SuggestCafeBody): Promise<{ received: boolean }> {
  return call(() => apiClient.post('/api/v1/cafe-suggestions', body));
}

export async function getAdminSuggestions(): Promise<{ total: number; items: CafeSuggestionRow[] }> {
  return call(() => apiClient.get('/api/v1/admin/cafe-suggestions'));
}

export async function setSuggestionStatus(id: string, status: SuggestionStatus): Promise<CafeSuggestionRow> {
  return call(() => apiClient.patch(`/api/v1/admin/cafe-suggestions/${id}`, { status }));
}
