'use client';

import { queryKeys } from '@vj/api-client';
import { ApiError } from '@vj/api-client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from '@vj/ui';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth-store';

export function useAuth() {
  const queryClient = useQueryClient();
  const { user, accessToken, setSession, clearSession } = useAuthStore();

  const meQuery = useQuery({
    queryKey: queryKeys.auth.me,
    queryFn: () => api.auth.me(),
    enabled: Boolean(accessToken),
    retry: false,
  });

  const loginMutation = useMutation({
    mutationFn: (body: { email: string; password: string }) => api.auth.login(body),
    onSuccess: ({ user: u, tokens }) => {
      setSession(u, tokens);
      queryClient.setQueryData(queryKeys.auth.me, u);
      toast.success('Welcome back');
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : 'Login failed');
    },
  });

  const registerMutation = useMutation({
    mutationFn: (body: { email: string; password: string; fullName: string }) => api.auth.register(body),
    onSuccess: ({ user: u, tokens }) => {
      setSession(u, tokens);
      queryClient.setQueryData(queryKeys.auth.me, u);
      toast.success('Account created');
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : 'Registration failed');
    },
  });

  const logout = async () => {
    const refresh = useAuthStore.getState().refreshToken;
    clearSession();
    queryClient.removeQueries({ queryKey: queryKeys.auth.me });
    if (refresh) {
      try {
        await api.auth.logout(refresh);
      } catch {
        /* ignore */
      }
    }
  };

  return {
    user: meQuery.data ?? user,
    isAuthenticated: Boolean(accessToken),
    isLoading: meQuery.isLoading,
    login: loginMutation.mutateAsync,
    register: registerMutation.mutateAsync,
    logout,
    loginPending: loginMutation.isPending,
    registerPending: registerMutation.isPending,
  };
}
