import { apiClient, call } from './client';

export interface SupportTicket {
  id: string;
  userId: string;
  subject: string;
  description: string;
  category: string;
  status: 'open' | 'in_progress' | 'resolved' | 'closed';
  priority: 'low' | 'normal' | 'high';
  bookingId: string | null;
  cafeId: string | null;
  adminNotes: string | null;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SupportTicketCreateInput {
  subject: string;
  description: string;
  category?: string;
  bookingId?: string;
  cafeId?: string;
}

export async function createSupportTicket(payload: SupportTicketCreateInput): Promise<{ ticket: SupportTicket }> {
  return call(() => apiClient.post('/api/v1/support/tickets', payload));
}

export async function listMySupportTickets(
  params: { page?: number; limit?: number } = {},
): Promise<{ items: SupportTicket[]; total: number }> {
  return call(() => apiClient.get('/api/v1/support/tickets', { params }));
}
