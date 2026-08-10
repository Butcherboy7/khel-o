import axios, {
  type AxiosError,
  type AxiosInstance,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from 'axios';
import { ApiError } from './errors';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000';

export const apiClient: AxiosInstance = axios.create({
  baseURL: API_URL,
  headers: { 'Content-Type': 'application/json' },
  timeout: 15_000,
});

// ── Request Interceptor — Token Injection ────────────────────────────────────

apiClient.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    if (typeof window !== 'undefined') {
      const token = localStorage.getItem('accessToken');
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    }
    return config;
  },
  (error: unknown) => Promise.reject(error),
);

// ── Response Interceptor — 401 Refresh Queue + Error Normalisation ───────────

let isRefreshing = false;
let pendingQueue: Array<{
  resolve: (token: string) => void;
  reject: (error: unknown) => void;
}> = [];

function flushQueue(error: unknown, token: string | null) {
  pendingQueue.forEach((p) => (error ? p.reject(error) : p.resolve(token!)));
  pendingQueue = [];
}

function clearAuthAndRedirect() {
  if (typeof window !== 'undefined') {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('user');
    window.location.href = '/login';
  }
}

function normaliseError(err: unknown): ApiError {
  if (err instanceof ApiError) return err;

  const axiosErr = err as AxiosError<{ error?: { code?: string; message?: string }; detail?: any }>;

  if (axiosErr.isAxiosError && axiosErr.response) {
    const data = axiosErr.response.data;
    const code = data?.error?.code;
    let message = data?.error?.message ?? (typeof data?.detail === 'string' ? data?.detail : null);

    if (!message && Array.isArray(data?.detail)) {
      const fieldErrs = data.detail.map((d: any) => {
        const fieldName = Array.isArray(d.loc) ? d.loc[d.loc.length - 1] : 'field';
        return `${fieldName}: ${d.msg}`;
      }).join(' | ');
      message = `Validation Error — ${fieldErrs}`;
    }

    if (!message) {
      message = 'An unexpected error occurred.';
    }

    return new ApiError(message, axiosErr.response.status, code);
  }

  if (axiosErr.isAxiosError && !axiosErr.response) {
    return new ApiError('Network error — please check your connection.', 0, undefined);
  }

  return new ApiError('An unexpected error occurred.', 0, undefined);
}

apiClient.interceptors.response.use(
  (response: AxiosResponse) => response,

  async (error: AxiosError<{ error?: { code?: string; message?: string } }>) => {
    const original = error.config as InternalAxiosRequestConfig & { _retry?: boolean; _role_retry?: boolean };

    const isAuthEndpoint =
      original?.url?.includes('/auth/login') ||
      original?.url?.includes('/auth/register') ||
      original?.url?.includes('/auth/refresh');

    // Handle 403 Forbidden - auto-refetch /auth/me once and retry
    if (error.response?.status === 403 && !original?._role_retry && !isAuthEndpoint && typeof window !== 'undefined') {
      if (original) original._role_retry = true;
      
      try {
        const currentToken = localStorage.getItem('accessToken');
        if (currentToken) {
          const meRes = await axios.get<{ success: boolean; data: { user: any } }>(
            `${API_URL}/api/v1/auth/me`,
            { headers: { Authorization: `Bearer ${currentToken}` } }
          );
          
          if (meRes.data?.data?.user) {
            const freshUser = meRes.data.data.user;
            localStorage.setItem('user', JSON.stringify(freshUser));
            
            if (freshUser.roles) {
              localStorage.setItem('roles', JSON.stringify(freshUser.roles));
              
              const currentActiveRole = localStorage.getItem('activeRole');
              if (currentActiveRole && !freshUser.roles.includes(currentActiveRole)) {
                const newActiveRole = freshUser.roles[0] || 'gamer';
                localStorage.setItem('activeRole', newActiveRole);
                console.warn(`activeRole "${currentActiveRole}" revoked, falling back to "${newActiveRole}"`);
              }
            }
            
            return original ? apiClient(original) : Promise.reject(normaliseError(error));
          }
        }
      } catch {
        // Silently ignore - proceed to reject with original error
      }
    }

    if (error.response?.status === 401 && !original?._retry && !isAuthEndpoint) {
      if (isRefreshing) {
        return new Promise<AxiosResponse>((resolve, reject) => {
          pendingQueue.push({
            resolve: (token) => {
              if (original) {
                original.headers.Authorization = `Bearer ${token}`;
                resolve(apiClient(original));
              }
            },
            reject,
          });
        });
      }

      if (original) original._retry = true;
      isRefreshing = true;

      const refreshToken =
        typeof window !== 'undefined' ? localStorage.getItem('refreshToken') : null;

      if (!refreshToken) {
        clearAuthAndRedirect();
        return Promise.reject(normaliseError(error));
      }

      try {
        const res = await axios.post<{ success: boolean; data: { accessToken: string; refreshToken: string } }>(
          `${API_URL}/api/v1/auth/refresh`,
          { refreshToken },
        );

        const newAccess = res.data.data.accessToken;
        const newRefresh = res.data.data.refreshToken;

        localStorage.setItem('accessToken', newAccess);
        localStorage.setItem('refreshToken', newRefresh);
        apiClient.defaults.headers.common.Authorization = `Bearer ${newAccess}`;

        // Update user object after role upgrade
        try {
          const userRes = await axios.get<{ success: boolean; data: { user: any } }>(
            `${API_URL}/api/v1/auth/me`,
            { headers: { Authorization: `Bearer ${newAccess}` } }
          );
          if (userRes.data?.data?.user) {
            localStorage.setItem('user', JSON.stringify(userRes.data.data.user));
          }
        } catch {
          // Silently ignore user fetch error
        }

        flushQueue(null, newAccess);
        if (original) original.headers.Authorization = `Bearer ${newAccess}`;
        return original ? apiClient(original) : Promise.reject(normaliseError(error));
      } catch (refreshError) {
        flushQueue(refreshError, null);
        clearAuthAndRedirect();
        return Promise.reject(normaliseError(refreshError));
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(normaliseError(error));
  },
);

/**
 * Typed API helper. Calls fn(), extracts res.data.data, returns typed T.
 * All API functions use this wrapper — callers receive unwrapped data directly.
 */
export async function call<T>(
  fn: () => Promise<AxiosResponse<{ success: boolean; data: T }>>,
): Promise<T> {
  const res = await fn();
  return res.data.data;
}

export { API_URL };
