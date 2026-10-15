'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, getErrorMessage } from './api';

interface AuthUser {
  id: string;
  name: string | null;
  surname: string | null;
  username: string | null;
  email: string;
  phone: string | null;
  avatarUrl: string | null;
  role: string;
  status: string;
  emailVerified: boolean;
  twoFactorEnabled: boolean;
  createdAt: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  login: (identifier: string, password: string, rememberMe?: boolean) => Promise<void>;
  register: (input: {
    name: string;
    surname: string;
    username: string;
    email: string;
    password: string;
    passwordConfirmation: string;
    terms: boolean;
  }) => Promise<AuthUser>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  error: string | null;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const refreshUser = useCallback(async () => {
    try {
      const data = await api<{ user: AuthUser }>('/api/auth/me');
      setUser(data.user);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshUser();
  }, [refreshUser]);

  const login = useCallback(
    async (identifier: string, password: string, rememberMe?: boolean) => {
      setError(null);
      try {
        const data = await api<{ user: AuthUser }>('/api/auth/login', {
          method: 'POST',
          body: JSON.stringify({ identifier, password, rememberMe }),
        });
        setUser(data.user);
        router.push('/');
        router.refresh();
      } catch (err) {
        setError(getErrorMessage(err));
        throw err;
      }
    },
    [router],
  );

  const register = useCallback(
    async (input: {
      name: string;
      surname: string;
      username: string;
      email: string;
      password: string;
      passwordConfirmation: string;
      terms: boolean;
    }) => {
      setError(null);
      try {
        const data = await api<{ user: AuthUser }>('/api/auth/register', {
          method: 'POST',
          body: JSON.stringify(input),
        });
        setUser(data.user);
        router.push('/');
        router.refresh();
        return data.user;
      } catch (err) {
        setError(getErrorMessage(err));
        throw err;
      }
    },
    [router],
  );

  const logout = useCallback(async () => {
    try {
      await api('/api/auth/logout', { method: 'POST', body: '{}' });
    } catch {
      // ignore
    }
    setUser(null);
    router.push('/');
    router.refresh();
  }, [router]);

  const value = useMemo(
    () => ({
      user,
      loading,
      login,
      register,
      logout,
      refreshUser,
      error,
      clearError: () => setError(null),
    }),
    [user, loading, login, register, logout, refreshUser, error],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}