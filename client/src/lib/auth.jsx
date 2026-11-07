import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  authApi,
  clearSession,
  hasSession,
  hasUsableAccess,
  refreshSession,
  setSession,
} from './api.js';

const AuthContext = createContext(null);
const USER_KEY = 'sarhny_user';

const getCachedUser = () => {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

/**
 * Holds the current user and keeps it fresh across reloads.
 * Instant boot via cached localStorage session, background revalidation.
 */
export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => getCachedUser());
  const [booting, setBooting] = useState(() => {
    if (!hasSession()) return false;
    if (getCachedUser() && hasUsableAccess()) return false;
    return true;
  });

  const updateUserData = useCallback((newUser) => {
    setUser(newUser);
    if (newUser) {
      localStorage.setItem(USER_KEY, JSON.stringify(newUser));
    } else {
      localStorage.removeItem(USER_KEY);
    }
  }, []);

  const loadMe = useCallback(async () => {
    const { data } = await authApi.me();
    updateUserData(data.user);
    return data.user;
  }, [updateUserData]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (!hasSession()) {
        if (!cancelled) setBooting(false);
        return;
      }
      try {
        if (!hasUsableAccess()) {
          await refreshSession();
        }
        await loadMe();
      } catch (err) {
        if (err?.status === 401) {
          clearSession();
          localStorage.removeItem(USER_KEY);
          if (!cancelled) setUser(null);
        }
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

    // When user switches or focuses back on the tab, verify with the server
    const handleWindowFocus = () => {
      if (hasSession()) {
        loadMe().catch((err) => {
          if (err?.status === 401) {
            clearSession();
            localStorage.removeItem(USER_KEY);
            setUser(null);
          }
        });
      }
    };

    // Heartbeat check every 60 seconds while visible to detect multi-device logout
    const heartbeat = setInterval(() => {
      if (document.visibilityState === 'visible' && hasSession()) {
        loadMe().catch((err) => {
          if (err?.status === 401) {
            clearSession();
            localStorage.removeItem(USER_KEY);
            setUser(null);
          }
        });
      }
    }, 60000);

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
    if (data?.user) {
      localStorage.setItem(USER_KEY, JSON.stringify(data.user));
    }
    return data.user;
  }, []);

  const signIn = useCallback(
    async (credentials) => {
      const { data } = await authApi.login(credentials);
      if (data?.requiresTwoFactor) {
        return data;
      }
      return adopt(data);
    },
    [adopt],
  );

  const confirmLogin = useCallback(
    async (params) => {
      const { data } = await authApi.loginConfirm(params);
      return adopt(data);
    },
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
    localStorage.removeItem(USER_KEY);
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({
      user,
      setUser: updateUserData,
      booting,
      signedIn: Boolean(user),
      isAdmin: user?.role === 'admin',
      signIn,
      confirmLogin,
      register,
      signOut,
      adopt,
      reload: loadMe,
    }),
    [user, updateUserData, booting, signIn, confirmLogin, register, signOut, adopt, loadMe],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
