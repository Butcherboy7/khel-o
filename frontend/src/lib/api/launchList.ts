import { apiClient, call } from './client';

/** Game-launch lists (GTA 6 first). See backend app/api/v1/launch_list.py. */

export type ReachBy = 'whatsapp' | 'text' | 'call';

export interface LaunchInfo {
  key: string;
  title: string;
  /** ISO date, e.g. "2026-11-19". */
  launchDate: string;
  /** Real number of people on the list. */
  count: number;
}

export interface LaunchJoin {
  name: string;
  phone: string;
  contactMethod: ReachBy;
  email?: string;
  consent: boolean;
  utmSource?: string;
  utmCampaign?: string;
  utmContent?: string;
  formTicket?: string;
  website?: string;
}

export interface LaunchSignupRow {
  id: string;
  name: string;
  phone: string;
  contactMethod: ReachBy;
  email: string | null;
  utmSource: string | null;
  utmCampaign: string | null;
  utmContent: string | null;
  joinedAt: string;
}

export interface AdminLaunchList {
  title: string;
  launchDate: string;
  total: number;
  byMethod: Record<ReachBy, number>;
  items: LaunchSignupRow[];
}

export async function getLaunch(key: string): Promise<LaunchInfo> {
  return call(() => apiClient.get(`/api/v1/launch-list/${key}`));
}

export async function joinLaunch(key: string, body: LaunchJoin): Promise<{ joined: boolean; alreadyJoined: boolean; count: number }> {
  return call(() => apiClient.post(`/api/v1/launch-list/${key}`, body));
}

export async function getAdminLaunchList(key: string): Promise<AdminLaunchList> {
  return call(() => apiClient.get(`/api/v1/admin/launch-list/${key}`));
}

/** Goes through apiClient so the admin's bearer token is attached. */
export async function downloadLaunchListCsv(key: string): Promise<void> {
  const res = await apiClient.get(`/api/v1/admin/launch-list/${key}.csv`, { responseType: 'blob' });
  const disposition = String(res.headers['content-disposition'] ?? '');
  const filename = /filename="([^"]+)"/.exec(disposition)?.[1] ?? `khelo-${key}-launch-list.csv`;
  const href = URL.createObjectURL(res.data as Blob);
  const a = document.createElement('a');
  a.href = href;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(href);
}
