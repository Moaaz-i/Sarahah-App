import { BrowserRouter, Route, Routes, useLocation } from 'react-router-dom';
import { useEffect } from 'react';
import { AuthProvider, useAuth } from './lib/auth.jsx';
import { ToastProvider } from './components/Toast.jsx';
import AppShell from './components/AppShell.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import Spinner from './components/Spinner.jsx';

import Home from './pages/Home.jsx';
import Profile from './pages/Profile.jsx';
import Login from './pages/Login.jsx';
import Register from './pages/Register.jsx';
import Inbox from './pages/Inbox.jsx';
import Settings from './pages/Settings.jsx';
import Admin from './pages/Admin.jsx';
import GoogleCallback from './pages/GoogleCallback.jsx';
import NotFound from './pages/NotFound.jsx';

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

function Splash() {
  return (
    <div className="splash">
      <Spinner label="جارٍ تحميل صريحني…" />
    </div>
  );
}

/**
 * Blocks rendering until the stored session has been revalidated.
 * Without this, a protected route would briefly render its "redirect to
 * /login" branch before the refresh round-trip finishes.
 */
function BootGate({ children }) {
  const { booting } = useAuth();
  if (booting) return <Splash />;
  return children;
}

export default function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <AuthProvider>
          <ScrollToTop />
          <BootGate>
            <Routes>
              <Route element={<AppShell />}>
                <Route index element={<Home />} />
                <Route path="u/:username" element={<Profile />} />
                <Route path="login" element={<Login />} />
                <Route path="register" element={<Register />} />
                <Route path="auth/google/callback" element={<GoogleCallback />} />
                <Route
                  path="inbox"
                  element={
                    <ProtectedRoute>
                      <Inbox />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="settings"
                  element={
                    <ProtectedRoute>
                      <Settings />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="admin"
                  element={
                    <ProtectedRoute adminOnly>
                      <Admin />
                    </ProtectedRoute>
                  }
                />
                <Route path="*" element={<NotFound />} />
              </Route>
            </Routes>
          </BootGate>
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  );
}
