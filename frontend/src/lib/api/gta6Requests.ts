import { apiClient, call } from './client';

/** GTA 6 launch: ask for a slot, the founder checks it with the café, Allow holds the seat.
 *  See backend app/api/v1/gta6_requests.py. */

export type Gta6RequestState = 'requested' | 'approved' | 'booked' | 'declined' | 'expired' | 'cancelled';

export interface Gta6Request {
  id: string;
  reference: string;
  status: Gta6RequestState;
  cafe: { id: string; name: string; slug: string | null; city: string } | null;
  tier: { id: string; name: string } | null;
  date: string;
  startTime: string;
  hours: number;
  seats: number;
  /** "gta6": asked to play GTA 6 (GTA 6 price). "other": another game on the same console. */
  game: 'gta6' | 'other';
  consoleLabel: string | null;
  note: string | null;
  suggestion: string | null;
  bookingId: string | null;
  /** While approved: pay by this time or the hold lapses. */
  payBy: string | null;
  createdAt: string;
  /** An unanswered request lapses at this time. */
  answerBy: string;
  /** Admin only. */
  player?: { name: string; phone: string | null; email: string };
  cafePhone?: string | null;
}

export interface Gta6Config {
  enabled: boolean;
  whatsapp: string | null;
  until: string | null;
}

export interface Gta6Settings {
  on: boolean;
  until: string | null;
  whatsapp: string | null;
  effective: boolean;
}

export interface Gta6RequestBody {
  cafeId: string;
  hardwareTierId: string;
  sessionDate: string;
  startTime: string;
  durationHours: number;
  seatsCount: number;
  phone?: string;
  game?: 'gta6' | 'other';
  /** The console the player picked, e.g. "PS5 Pro 2". */
  consoleLabel?: string;
}

export const getGta6Config = (): Promise<Gta6Config> => call(() => apiClient.get('/api/v1/gta6-requests/config'));

export async function createGta6Request(body: Gta6RequestBody): Promise<Gta6Request> {
  const r = await call<{ request: Gta6Request }>(() => apiClient.post('/api/v1/gta6-requests', body));
  return r.request;
}

export async function getGta6Request(id: string): Promise<Gta6Request> {
  const r = await call<{ request: Gta6Request }>(() => apiClient.get(`/api/v1/gta6-requests/${encodeURIComponent(id)}`));
  return r.request;
}

export const listAdminGta6Requests = (state: 'waiting' | 'allowed' | 'declined' | 'all'): Promise<{ items: Gta6Request[]; waiting: number }> =>
  call(() => apiClient.get('/api/v1/admin/gta6-requests', { params: { state } }));

const decide = async (id: string, action: string, body: Record<string, unknown> = {}): Promise<Gta6Request> =>
  (await call<{ request: Gta6Request }>(() => apiClient.post(`/api/v1/admin/gta6-requests/${encodeURIComponent(id)}/${action}`, body))).request;

export const allowGta6Request = (id: string) => decide(id, 'allow');
export const declineGta6Request = (id: string, note?: string) => decide(id, 'decline', { note });
export const suggestGta6Request = (id: string, suggestion: string, note?: string) => decide(id, 'suggest', { suggestion, note });

export const getGta6Settings = (): Promise<Gta6Settings> => call(() => apiClient.get('/api/v1/admin/gta6-requests/settings'));
export const putGta6Settings = (body: Partial<Pick<Gta6Settings, 'on' | 'until' | 'whatsapp'>>): Promise<Gta6Settings> =>
  call(() => apiClient.put('/api/v1/admin/gta6-requests/settings', body));

/** wa.me link to the founder, pre-filled with the slot and the reference. */
export function founderWhatsAppUrl(whatsapp: string, r: Pick<Gta6Request, 'reference' | 'cafe' | 'tier' | 'date' | 'startTime' | 'hours'> & Partial<Pick<Gta6Request, 'game' | 'consoleLabel'>>): string {
  const day = new Date(`${r.date}T12:00:00+05:30`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' });
  const what = r.game === 'other' ? 'book' : 'play GTA 6 on';
  const text =
    `Hi KHEL-O, I want to ${what} ${r.consoleLabel ?? r.tier?.name ?? 'a console'} at ${r.cafe?.name ?? 'a café'}, ${day}, ${r.startTime} for ${r.hours} hr. ` +
    `Request ${r.reference}. Can you ask the café if this slot is free so I can book?`;
  return `https://wa.me/${whatsapp.replace(/\D/g, '')}?text=${encodeURIComponent(text)}`;
}

/** tel: link to the founder: calling is usually faster than chat. Null when the number is missing or too short. */
export function founderCallUrl(phone: string | null | undefined): string | null {
  const digits = (phone ?? '').replace(/\D/g, '');
  return digits.length >= 10 ? `tel:+${digits}` : null;
}
