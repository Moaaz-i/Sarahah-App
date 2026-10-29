import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  authApi,
  clearSession,
  hasSession,
  refreshSession,
  setSession,
} from './api.js';

const AuthContext = createContext(null);

/**
 * Holds the current user and keeps it fresh across reloads.
 *
 * Boot sequence:
 *   no refresh token  -> signed out, no network call
 *   access token alive-> signed in from cache, then revalidate with /auth/me
 *   access expired     -> rotate once, then /auth/me
 *   rotation failed    -> clear the session and stay signed out
 */
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [booting, setBooting] = useState(true);

  const loadMe = useCallback(async () => {
    const { data } = await authApi.me();
    setUser(data.user);
    return data.user;
  }, []);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (!hasSession()) {
        if (!cancelled) setBooting(false);
        return;
      }
      try {
        await refreshSession();
        await loadMe();
      } catch {
        clearSession();
        if (!cancelled) setUser(null);
      } finally {
        if (!cancelled) setBooting(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [loadMe]);

  useEffect(() => {
    const handleLogoutBroadcast = () => {
      setUser(null);
    };

    const handleStorageChange = () => {
      if (!hasSession()) {
        setUser(null);
      }
    };

    // When user switches or focuses on the other browser, instantly verify with the server
    const handleWindowFocus = () => {
      if (hasSession()) {
        loadMe().catch(() => {
          clearSession();
          setUser(null);
        });
      }
    };

    // Heartbeat check every 10 seconds while visible to detect multi-device logout
    const heartbeat = setInterval(() => {
      if (document.visibilityState === 'visible' && hasSession()) {
        loadMe().catch(() => {
          clearSession();
          setUser(null);
        });
      }
    }, 10000);

    window.addEventListener('sarhny:auth:logout', handleLogoutBroadcast);
    window.addEventListener('storage', handleStorageChange);
    window.addEventListener('focus', handleWindowFocus);

    return () => {
      window.removeEventListener('sarhny:auth:logout', handleLogoutBroadcast);
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('focus', handleWindowFocus);
      clearInterval(heartbeat);
    };
  }, [loadMe]);

  const adopt = useCallback((data) => {
    setSession(data);
    setUser(data.user);
    return data.user;
  }, []);

  const signIn = useCallback(
    async (credentials) => adopt((await authApi.login(credentials)).data),
    [adopt],
  );

  const register = useCallback(
    async (body) => adopt((await authApi.register(body)).data),
    [adopt],
  );

  const signOut = useCallback(async (allDevices = false) => {
    try {
      if (allDevices) {
        await authApi.logoutAll();
      } else {
        await authApi.logout();
      }
    } catch {
      /* even if the server call fails we drop the local session */
    }
    clearSession();
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({
      user,
      setUser,
      booting,
      signedIn: Boolean(user),
      isAdmin: user?.role === 'admin',
      signIn,
      register,
      signOut,
      adopt,
      reload: loadMe,
    }),
    [user, booting, signIn, register, signOut, adopt, loadMe],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
