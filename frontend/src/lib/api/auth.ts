import { apiClient, call } from './client';
import type { User, RegisterRequest, LoginRequest, AuthTokens } from '@/types';

export async function register(body: RegisterRequest): Promise<AuthTokens & { user: User }> {
  return call(() => apiClient.post('/api/v1/auth/register', body));
}

export async function login(body: LoginRequest): Promise<AuthTokens & { user: User }> {
  return call(() => apiClient.post('/api/v1/auth/login', body));
}

export async function getMe(): Promise<{ user: User }> {
  return call(() => apiClient.get('/api/v1/auth/me'));
}
