import { apiClient, call, getApiUrl } from './client';

/** Drops: limited pre-booked launch events (e.g. GTA 6 Launch Drop).
 *  See backend app/api/v1/drops.py and app/services/drop_service.py. */

export type DropState = 'draft' | 'cancelled' | 'soon' | 'early' | 'open';

export interface DropBlock {
  id: string;
  date: string; // YYYY-MM-DD
  startTime: string; // HH:MM
  endTime: string;
  hours: number;
  seatsTotal: number;
  seatsLeft: number;
  pricePerSeat: number;
  balancePerSeat: number;
  started: boolean;
  /** Flexible drops: free seats for each hour of the session, keyed 'HH:MM'. */
  hourFree?: Record<string, number>;
}

export interface DropReservation {
  id: string;
  reference: string;
  status: 'pending_payment' | 'confirmed' | 'checked_in' | 'expired' | 'cancelled' | 'refunded' | 'given_away';
  seats: number;
  hours?: number | null;
  startTime?: string | null;
  endTime?: string | null;
  arriveFrom?: string | null;
  arriveUntil?: string | null;
  givenAwayAt?: string | null;
  blockId: string;
  block: DropBlock | null;
  blockPrice: number;
  depositPaid: number;
  deposit: number;
  balanceDue: number;
  expiresAt: string | null;
  orderId?: string | null;
  checkedInAt: string | null;
  refundedAt: string | null;
  passUrl: string | null;
  qr: string | null;
}

export interface Drop {
  id: string;
  slug: string;
  title: string;
  game: string;
  tagline: string | null;
  coverImageUrl: string | null;
  pricePerHour: number;
  deposit: number;
  /** Fee for 4-5 hours (flexible drops). */
  depositLong: number;
  /** Set on flexible drops: people pick 1..maxHours. */
  maxHours: number | null;
  maxSeatsPerUser: number;
  earlyAccessStartsAt: string;
  publicStartsAt: string;
  hasEarlyAccessCode: boolean;
  state: DropState;
  status: 'draft' | 'live' | 'cancelled';
  cafe: { id: string; name: string; slug: string | null; address: string; city: string; mapsUrl: string };
  blocks: DropBlock[];
  seatsLeft: number;
  seatsTotal: number;
  myReservations: DropReservation[];
  waitlistCount: number;
  needsPhone?: boolean;
}

export interface ReserveResult {
  reservation: DropReservation;
  order: { orderId: string; amount: number; currency: string; keyId: string };
}

export async function getDrop(slug: string): Promise<Drop> {
  return call(() => apiClient.get(`/api/v1/drops/${encodeURIComponent(slug)}`));
}

export async function reserveDrop(
  slug: string,
  body: { blockId: string; seats: number; code?: string; phone?: string; startTime?: string; hours?: number },
): Promise<ReserveResult> {
  return call(() => apiClient.post(`/api/v1/drops/${encodeURIComponent(slug)}/reserve`, body));
}

export async function verifyDropPayment(body: {
  razorpayOrderId: string;
  razorpayPaymentId: string;
  razorpaySignature: string;
}): Promise<{ outcome: string; reservation: DropReservation }> {
  return call(() => apiClient.post('/api/v1/drops/reservations/verify', body));
}

export async function joinDropWaitlist(slug: string, phone: string): Promise<{ count: number; added: boolean }> {
  return call(() => apiClient.post(`/api/v1/drops/${encodeURIComponent(slug)}/waitlist`, { phone }));
}

export interface DropPass extends Partial<Omit<DropReservation, 'status' | 'reference'>> {
  valid: boolean;
  status: string;
  canCheckIn: boolean;
  dropTitle: string;
  reference: string;
  holderName?: string | null;
  holderPhone?: string | null;
}

export async function getDropPass(slug: string, token: string): Promise<DropPass> {
  return call(() => apiClient.get(`/api/v1/drops/${encodeURIComponent(slug)}/pass/${encodeURIComponent(token)}`));
}

// ---------------------------------------------------------------- café side

export interface OwnerReservationRow {
  id: string;
  reference: string;
  name: string;
  phone: string | null;
  seats: number;
  status: DropReservation['status'];
  deposit: number;
  balanceDue: number;
  checkedInAt: string | null;
  paidAt: string | null;
  earlyAccess: boolean;
  checkinToken: string | null;
  hours?: number | null;
  startTime?: string | null;
  endTime?: string | null;
}

export interface OwnerDrop extends Omit<Drop, 'blocks' | 'myReservations'> {
  earlyAccessCode: string | null;
  blocks: (DropBlock & { reservations: OwnerReservationRow[] })[];
  funnel: {
    pageViews: number;
    blockSelected: number;
    paymentStarted: number;
    paymentSuccess: number;
    shareClicked: number;
    shareByChannel: Record<string, number>;
  };
  totals: { paidReservations: number; seatsSold: number; depositsCollected: number; balanceToCollect: number; checkedIn: number };
}

export interface OwnerDropList {
  drops: (Omit<Drop, 'myReservations'> & { paidReservations: number })[];
  cafes: { id: string; name: string }[];
  suggestedPrice: [number, number];
}

export interface NewDrop {
  cafeId: string;
  title: string;
  game: string;
  tagline?: string;
  coverImageUrl?: string;
  pricePerHour: number;
  depositAmount: number;
  maxHours?: number;
  depositAmountLong?: number;
  earlyAccessCode?: string;
  earlyAccessStartsAt: string;
  publicStartsAt: string;
  status: 'draft' | 'live';
  blocks: { date: string; startTime: string; endTime: string; seats: number }[];
}

export async function listOwnerDrops(): Promise<OwnerDropList> {
  return call(() => apiClient.get('/api/v1/owner/drops'));
}

export async function createDrop(body: NewDrop): Promise<Drop> {
  return call(() => apiClient.post('/api/v1/owner/drops', body));
}

export async function updateDrop(id: string, body: Partial<Omit<NewDrop, 'cafeId' | 'blocks'>> & { addBlocks?: NewDrop['blocks'] }): Promise<Drop> {
  return call(() => apiClient.patch(`/api/v1/owner/drops/${id}`, body));
}

export async function getOwnerDrop(id: string): Promise<OwnerDrop> {
  return call(() => apiClient.get(`/api/v1/owner/drops/${id}`));
}

export async function checkInDropPass(token: string): Promise<DropReservation & { outcome: 'checked_in' | 'already'; holderName: string }> {
  return call(() => apiClient.post('/api/v1/owner/drops/check-in', { token }));
}

/** The CSV needs the login token, so it is fetched and saved, not linked. */
export async function downloadDropCsv(id: string, slug: string): Promise<void> {
  const res = await apiClient.get(`/api/v1/owner/drops/${id}/export.csv`, { responseType: 'blob' });
  const url = URL.createObjectURL(res.data as Blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${slug}-reservations.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export { getApiUrl };

// ------------------------------------------------------------ home Drops tab

export interface DropListItem {
  id: string;
  slug: string;
  title: string;
  game: string;
  tagline: string | null;
  coverImageUrl: string | null;
  pricePerHour: number;
  state: DropState;
  cafe: Drop['cafe'];
  seatsLeft: number;
  seatsTotal: number;
  nextStartsAt: string;
  earlyAccessStartsAt: string;
  publicStartsAt: string;
  /** You already hold a seat in this drop. */
  iHold: boolean;
}

export async function listDrops(): Promise<DropListItem[]> {
  return call(() => apiClient.get('/api/v1/drops'));
}

export async function giveAwayReservation(id: string): Promise<DropReservation> {
  return call(() => apiClient.post(`/api/v1/owner/drops/reservations/${encodeURIComponent(id)}/give-away`, {}));
}
