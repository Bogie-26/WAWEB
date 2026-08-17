import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { getToken, setToken, clearToken, api } from './api';

interface AuthState {
  token: string | null;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthState>({
  token: null,
  login: async () => {},
  logout: () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setTokenState] = useState<string | null>(() => getToken());

  const login = useCallback(async (username: string, password: string) => {
    const res = await api<{ token: string }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });
    setToken(res.token);
    setTokenState(res.token);
  }, []);

  const logout = useCallback(() => {
    api('/api/auth/logout', { method: 'POST' }).catch(() => {});
    clearToken();
    setTokenState(null);
  }, []);

  return (
    <AuthContext.Provider value={{ token, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  return useContext(AuthContext);
}