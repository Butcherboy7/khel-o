import { apiClient, call } from './client';
import type { User, UserPreferences, RegisterRequest, LoginRequest, AuthTokens } from '@/types';

export async function register(body: RegisterRequest): Promise<AuthTokens & { user: User }> {
  return call(() => apiClient.post('/api/v1/auth/register', body));
}

export async function login(body: LoginRequest): Promise<AuthTokens & { user: User }> {
  return call(() => apiClient.post('/api/v1/auth/login', body));
}

export async function googleAuth(idToken: string): Promise<AuthTokens & { user: User }> {
  return call(() => apiClient.post('/api/v1/auth/google', { idToken }));
}

export async function getMe(): Promise<{ user: User }> {
  return call(() => apiClient.get('/api/v1/auth/me'));
}

export async function updateMe(body: {
  fullName?: string;
  phoneNumber?: string;
  // Changing `email` reassigns the login identity, so the backend requires
  // proof of identity alongside it. No verification mail is sent: the seeded
  // café-owner accounts ship on @khel-o.com addresses that do not exist, so a
  // confirmation link would go nowhere. Password accounts prove it with
  // currentPassword; Google-only accounts (no KHEL-O password) prove it with
  // a fresh googleIdToken instead.
  email?: string;
  currentPassword?: string;
  googleIdToken?: string;
  city?: string;
  preferences?: UserPreferences;
}): Promise<{ user: User }> {
  return call(() => apiClient.patch('/api/v1/auth/me', body));
}

export async function forgotPassword(
  email: string,
  guard: { formTicket?: string; website?: string } = {},
): Promise<{ message: string }> {
  return call(() => apiClient.post('/api/v1/auth/forgot-password', { email, ...guard }));
}

/** A signed "this form appeared at" ticket; see backend app/core/bot_guard.py. */
export async function getFormTicket(): Promise<string> {
  const data = await call<{ ticket: string }>(() => apiClient.get('/api/v1/auth/form-ticket'));
  return data.ticket;
}

export async function resetPassword(token: string, newPassword: string): Promise<{ message: string }> {
  return call(() => apiClient.post('/api/v1/auth/reset-password', { token, newPassword }));
}

export async function changePassword(currentPassword: string, newPassword: string): Promise<{ message: string }> {
  return call(() => apiClient.post('/api/v1/auth/change-password', { currentPassword, newPassword }));
}
