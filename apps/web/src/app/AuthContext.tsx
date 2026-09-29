import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api } from './api';
import type { User } from './types';

interface AuthValue {
  user: User | null;
  loading: boolean;
  login: (identifier: string, password: string, rememberMe: boolean) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get<{ user: User }>('/auth/me').then(({ user: current }) => setUser(current))
      .catch(() => setUser(null)).finally(() => setLoading(false));
  }, []);

  const value = useMemo<AuthValue>(() => ({
    user,
    loading,
    login: async (identifier, password, rememberMe) => {
      const result = await api.post<{ user: User }>('/auth/login', { identifier, password, rememberMe });
      setUser(result.user);
    },
    logout: async () => {
      await api.post('/auth/logout');
      setUser(null);
    },
  }), [user, loading]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used within AuthProvider');
  return value;
}
