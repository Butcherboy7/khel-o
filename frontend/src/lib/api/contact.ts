import { apiClient, call } from './client';

export interface ContactMessageInput {
  name: string;
  email: string;
  category?: 'general' | 'cafe_partner' | 'booking';
  message: string;
  /** Honeypot field — must stay empty for real submissions. */
  company?: string;
}

export async function submitContactMessage(payload: ContactMessageInput): Promise<{ submitted: boolean }> {
  return call(() => apiClient.post('/api/v1/contact', payload));
}
