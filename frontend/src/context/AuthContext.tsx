import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  changePasswordApi,
  loginApi,
  logoutApi,
  refreshSessionApi,
} from '../api/dmsApi';
import { setAccessToken, setOnAuthFailure } from '../api/httpClient';
import type { AuthUser } from '../types/dms';

interface AuthContextValue {
  user: AuthUser | null;
  isInitializing: boolean;
  login: (email: string, password: string) => Promise<AuthUser>;
  logout: () => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<string>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isInitializing, setIsInitializing] = useState<boolean>(true);

  useEffect(() => {
    setOnAuthFailure(() => {
      setAccessToken(null);
      setUser(null);
    });
    return () => {
      setOnAuthFailure(null);
    };
  }, []);

  // Silently restore session from HttpOnly refresh cookie on app mount
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const result = await refreshSessionApi();
        if (!active) return;
        setAccessToken(result.accessToken);
        setUser(result.user);
      } catch {
        if (!active) return;
        setAccessToken(null);
        setUser(null);
      } finally {
        if (active) {
          setIsInitializing(false);
        }
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const result = await loginApi(email, password);
    setAccessToken(result.accessToken);
    setUser(result.user);
    return result.user;
  }, []);

  const logout = useCallback(async () => {
    try {
      await logoutApi();
    } catch {
      // Clear client state regardless of server error
    } finally {
      setAccessToken(null);
      setUser(null);
    }
  }, []);

  const changePassword = useCallback(async (currentPassword: string, newPassword: string) => {
    const result = await changePasswordApi(currentPassword, newPassword);
    if (result.accessToken) {
      setAccessToken(result.accessToken);
    }
    if (result.user) {
      setUser(result.user);
    }
    return result.message;
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isInitializing,
      login,
      logout,
      changePassword,
    }),
    [user, isInitializing, login, logout, changePassword]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used inside AuthProvider');
  }
  return ctx;
}
