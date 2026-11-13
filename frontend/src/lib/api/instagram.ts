import { apiClient, call } from './client';
import { putToPresignedUrl } from './settings';

/** KHEL-O on Instagram: the reels admin posts, shown on Explore and Community.
 *  See backend app/api/v1/instagram.py. */

export const INSTAGRAM_HANDLE = 'khelo.journey';
export const INSTAGRAM_PROFILE = `https://www.instagram.com/${INSTAGRAM_HANDLE}/`;

export interface InstagramReel {
  id: string;
  url: string;
  coverUrl: string | null;
  title: string;
  tag: string | null;
  createdAt: string | null;
}

export interface AdminInstagramReel extends InstagramReel {
  position: number;
  hidden: boolean;
}

export async function getInstagramReels(): Promise<{ handle: string; reels: InstagramReel[] }> {
  return call(() => apiClient.get('/api/v1/instagram/reels'));
}

export async function adminListReels(): Promise<AdminInstagramReel[]> {
  return call(() => apiClient.get('/api/v1/admin/instagram/reels'));
}

export async function uploadReelCover(file: File): Promise<string> {
  const { uploadUrl, publicUrl } = await call<{ uploadUrl: string; publicUrl: string }>(() =>
    apiClient.post('/api/v1/admin/instagram/reels/presign', { contentType: file.type }),
  );
  await putToPresignedUrl(uploadUrl, file);
  return publicUrl;
}

export async function adminAddReel(body: { url: string; title: string; tag?: string; coverUrl?: string | null }): Promise<AdminInstagramReel> {
  return call(() => apiClient.post('/api/v1/admin/instagram/reels', body));
}

export async function adminEditReel(
  id: string,
  body: { url?: string; title?: string; tag?: string; coverUrl?: string | null; hidden?: boolean },
): Promise<AdminInstagramReel> {
  return call(() => apiClient.patch(`/api/v1/admin/instagram/reels/${id}`, body));
}

export async function adminOrderReels(ids: string[]): Promise<{ ok: boolean }> {
  return call(() => apiClient.put('/api/v1/admin/instagram/reels/order', { ids }));
}

export async function adminDeleteReel(id: string): Promise<{ ok: boolean }> {
  return call(() => apiClient.delete(`/api/v1/admin/instagram/reels/${id}`));
}

/** Same rule as the server: any reel or post link on instagram.com. */
export function looksLikeReelLink(v: string): boolean {
  return /^https?:\/\/(www\.|m\.)?instagram\.com\/([A-Za-z0-9_.]+\/)?(reels?|p|tv)\/[A-Za-z0-9_-]{5,}/i.test(v.trim());
}
