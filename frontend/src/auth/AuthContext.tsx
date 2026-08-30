import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { authApi } from '../lib/api';
import { tokenStorage } from '../lib/tokenStorage';
import type { AuthUser } from '../types/auth';

interface AuthContextValue {
  user: AuthUser | null;
  isAuthenticated: boolean;
  isBootstrapping: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  hasPermission: (permission: string) => boolean;
  hasAnyPermission: (permissions: string[]) => boolean;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(tokenStorage.getUser());
  const [isBootstrapping, setIsBootstrapping] = useState(true);

  useEffect(() => {
    const bootstrap = async () => {
      const accessToken = tokenStorage.getAccessToken();
      if (!accessToken) {
        setIsBootstrapping(false);
        return;
      }

      try {
        const profile = await authApi.profile();
        if (profile.data) {
          setUser(profile.data);
          const refresh = tokenStorage.getRefreshToken();
          if (refresh) {
            tokenStorage.setSession(accessToken, refresh, profile.data);
          }
        }
      } catch {
        tokenStorage.clear();
        setUser(null);
      } finally {
        setIsBootstrapping(false);
      }
    };

    void bootstrap();
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const response = await authApi.login(email, password);
    if (!response.data) {
      throw new Error('Login failed.');
    }
    tokenStorage.setSession(
      response.data.accessToken,
      response.data.refreshToken,
      response.data.user,
    );
    setUser(response.data.user);
  }, []);

  const logout = useCallback(async () => {
    const refreshToken = tokenStorage.getRefreshToken();
    try {
      if (refreshToken) {
        await authApi.logout(refreshToken);
      }
    } finally {
      tokenStorage.clear();
      setUser(null);
    }
  }, []);

  const hasPermission = useCallback(
    (permission: string) => Boolean(user?.permissions.includes(permission)),
    [user],
  );

  const hasAnyPermission = useCallback(
    (permissions: string[]) =>
      permissions.some((permission) => user?.permissions.includes(permission)),
    [user],
  );

  const value = useMemo(
    () => ({
      user,
      isAuthenticated: Boolean(user),
      isBootstrapping,
      login,
      logout,
      hasPermission,
      hasAnyPermission,
    }),
    [user, isBootstrapping, login, logout, hasPermission, hasAnyPermission],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
