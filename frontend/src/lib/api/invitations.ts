import { apiClient, call } from './client';

export interface StaffInvitation {
  id: string;
  venueId: string;
  email: string;
  fullName: string;
  phoneNumber?: string;
  role: string;
  status: 'pending' | 'accepted' | 'expired' | 'cancelled';
  token: string;
  inviteUrl: string;
  expiresAt: string;
  createdAt: string;
}

export interface PublicInvitationDetails {
  id: string;
  email: string;
  fullName: string;
  role: string;
  venueId: string;
  venueName: string;
  expiresAt: string;
}

export interface AcceptInvitationResponse {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    email: string;
    fullName: string;
    role: string;
  };
}

export async function createStaffInvitation(body: {
  email: string;
  fullName: string;
  phoneNumber?: string;
}): Promise<{ invitation: StaffInvitation }> {
  return call(() => apiClient.post('/api/v1/owner/staff/invitations', body));
}

export async function listStaffInvitations(): Promise<{ invitations: StaffInvitation[] }> {
  return call(() => apiClient.get('/api/v1/owner/staff/invitations'));
}

export async function cancelStaffInvitation(invitationId: string): Promise<{ message: string }> {
  return call(() => apiClient.delete(`/api/v1/owner/staff/invitations/${invitationId}`));
}

export async function getInvitationByToken(token: string): Promise<{ invitation: PublicInvitationDetails }> {
  return call(() => apiClient.get('/api/v1/auth/invitation', { params: { token } }));
}

export async function acceptInvitation(body: {
  token: string;
  password: string;
}): Promise<AcceptInvitationResponse> {
  return call(() => apiClient.post('/api/v1/auth/accept-invitation', body));
}
