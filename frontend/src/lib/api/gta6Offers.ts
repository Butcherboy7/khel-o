import { apiClient, call } from './client';

// Confirmed-slot links: the founder has the café's yes, shares a link, the first player to open it and pay gets it.
// See backend app/api/v1/gta6_requests.py (offers).
export interface Gta6Offer {
  id: string;
  token: string;
  status: 'open' | 'held' | 'claimed' | 'lapsed' | 'cancelled' | 'expired';
  cafe: { id: string; name: string; slug: string | null; city: string; area?: string | null } | null;
  tier: { id: string; name: string } | null;
  date: string;
  startTime: string;
  hours: number;
  seats: number;
  game: 'gta6' | 'other';
  price: number | null;
  /** The lengths the café sells inside this window, with the KHEL-O price and what each saves. */
  packages?: { hours: number; price: number; save: number }[] | null;
  expiresAt: string;
  bookingId: string | null;
}

export interface Gta6OfferBody {
  cafeId: string;
  hardwareTierId: string;
  sessionDate: string;
  startTime: string;
  durationHours: number;
  seatsCount?: number;
  game?: 'gta6' | 'other';
  minutesOpen?: number;
}

export const createGta6Offer = (body: Gta6OfferBody): Promise<{ offer: Gta6Offer }> =>
  call(() => apiClient.post('/api/v1/admin/gta6-requests/offers', body));
export const listGta6Offers = (): Promise<{ offers: Gta6Offer[] }> => call(() => apiClient.get('/api/v1/admin/gta6-requests/offers'));
export const cancelGta6Offer = (id: string): Promise<{ offer: Gta6Offer }> =>
  call(() => apiClient.post(`/api/v1/admin/gta6-requests/offers/${id}/cancel`));
export const getGta6Offer = (token: string): Promise<{ offer: Gta6Offer }> => call(() => apiClient.get(`/api/v1/gta6-requests/offers/${token}`));
export const claimGta6Offer = (token: string, pick?: { startTime: string; durationHours: number }): Promise<{ bookingId: string; payBy: string }> =>
  call(() => apiClient.post(`/api/v1/gta6-requests/offers/${token}/claim`, pick ?? {}));

const clock = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return `${h % 12 || 12}${m ? `:${String(m).padStart(2, '0')}` : ''} ${h < 12 ? 'AM' : 'PM'}`;
};

/** "Sunday, 22 Nov, 2 PM to 5 PM" */
export const offerWhen = (o: Pick<Gta6Offer, 'date' | 'startTime' | 'hours'>) => {
  const [h, m] = o.startTime.split(':').map(Number);
  const end = h * 60 + m + Math.round(o.hours * 60);
  const endText = clock(`${String(Math.floor(end / 60) % 24).padStart(2, '0')}:${String(end % 60).padStart(2, '0')}`);
  const d = new Date(`${o.date}T12:00:00+05:30`).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' });
  return `${d}, ${clock(o.startTime)} to ${endText}`;
};

/** The message the founder sends: the café confirmed it, it is free now, and it goes to whoever pays first. */
export function offerMessage(o: Gta6Offer, link: string): string {
  const game = o.game === 'gta6' ? 'GTA 6 ' : '';
  return `Good news! ${o.cafe?.name ?? 'The café'} confirmed this ${game}slot is free for you: ${o.tier?.name ?? 'a console'}, ${offerWhen(o)}.\n\nBook it soon or it won't stay free. First to pay gets it:\n${link}`;
}

export const offerWhatsAppUrl = (phone: string | null | undefined, text: string) => {
  const d = (phone ?? '').replace(/\D/g, '');
  return `https://wa.me/${d ? (d.length === 10 ? `91${d}` : d) : ''}?text=${encodeURIComponent(text)}`;
};
