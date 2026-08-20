import { apiClient, call } from './client';
import type { User, RegisterRequest, LoginRequest, AuthTokens } from '@/types';

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

export async function updateMe(body: { fullName?: string; phoneNumber?: string }): Promise<{ user: User }> {
  return call(() => apiClient.patch('/api/v1/auth/me', body));
}

export async function forgotPassword(email: string): Promise<{ message: string }> {
  return call(() => apiClient.post('/api/v1/auth/forgot-password', { email }));
}

export async function resetPassword(token: string, newPassword: string): Promise<{ message: string }> {
  return call(() => apiClient.post('/api/v1/auth/reset-password', { token, newPassword }));
}
