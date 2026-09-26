import { apiClient, call } from './client';

export type SeoFacetType = 'activity' | 'gpu' | 'game' | 'price';

export interface SeoLink {
  path: string;
  label: string;
  type: SeoFacetType;
  count?: number;
}

export interface SeoPage {
  city: { slug: string; name: string; path: string; cafeCount: number };
  facet: { type: SeoFacetType; slug: string; label: string; heading: string } | null;
  cafeIds: string[];
  /** False = render for users but keep out of search (thin or duplicate). */
  index: boolean;
  canonical: string;
  stats: {
    cafeCount: number;
    minPrice: number | null;
    maxPrice: number | null;
    games: string[];
    gpus: string[];
    openLate: number;
  };
  related: SeoLink[];
}

export interface SeoIndexEntry {
  path: string;
  title: string;
  type: 'city' | SeoFacetType;
  city: string;
  cafeCount: number;
}

export interface CafeLinks {
  city: { name: string; path: string };
  facets: SeoLink[];
  nearby: { id: string; name: string; path: string; km: number; minPrice: number | null }[];
}

export async function getSeoPage(city: string, facet?: string): Promise<SeoPage> {
  return call(() => apiClient.get('/api/v1/seo/page', { params: { city, facet } }));
}

export async function getSeoPages(): Promise<SeoIndexEntry[]> {
  return call(() => apiClient.get('/api/v1/seo/pages'));
}

export async function getCafeLinks(cafeId: string): Promise<CafeLinks> {
  return call(() => apiClient.get(`/api/v1/seo/cafe-links/${cafeId}`));
}

export const FACET_GROUP_LABELS: Record<SeoFacetType, string> = {
  activity: 'By platform & activity',
  game: 'By game',
  gpu: 'By graphics card',
  price: 'By price',
};
