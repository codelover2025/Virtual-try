import { createApiClient, createApiServices } from '@vj/api-client';
import { API_BASE_URL } from './api-base';
import { useAuthStore } from '@/stores/auth-store';

export const apiClient = createApiClient({
  baseUrl: API_BASE_URL,
  getAccessToken: () => useAuthStore.getState().accessToken,
  refreshAccessToken: async () => {
    const { refreshToken, setTokens, clearSession } = useAuthStore.getState();
    if (!refreshToken) return null;
    try {
      const { tokens } = await createApiClient({ baseUrl: API_BASE_URL }).post<{
        tokens: { accessToken: string; refreshToken: string; expiresIn: number };
      }>('/auth/refresh', { refreshToken });
      setTokens(tokens);
      return tokens.accessToken;
    } catch {
      clearSession();
      return null;
    }
  },
});

export const api = createApiServices(apiClient);
