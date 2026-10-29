import { useEffect } from "react";
import { BrowserRouter, Route, Routes, useLocation } from "react-router-dom";
import AppShell from "./components/AppShell.jsx";
import ProtectedRoute from "./components/ProtectedRoute.jsx";
import GuestRoute from "./components/GuestRoute.jsx";
import Spinner from "./components/Spinner.jsx";
import { ToastProvider } from "./components/Toast.jsx";
import { AuthProvider, useAuth } from "./lib/auth.jsx";

import Admin from "./pages/Admin.jsx";
import ForgotPassword from "./pages/ForgotPassword.jsx";
import GoogleCallback from "./pages/GoogleCallback.jsx";
import Home from "./pages/Home.jsx";
import Inbox from "./pages/Inbox.jsx";
import Login from "./pages/Login.jsx";
import Mirror from "./pages/Mirror.jsx";
import NotFound from "./pages/NotFound.jsx";
import Profile from "./pages/Profile.jsx";
import Register from "./pages/Register.jsx";
import Settings from "./pages/Settings.jsx";
import Thread from "./pages/Thread.jsx";

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
      <Spinner label="جارٍ تحميل صارحني…" />
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
              {/* Standalone OAuth callback: never renders AppShell or loads app inside popups */}
              <Route path="auth/google/callback" element={<GoogleCallback />} />

              <Route element={<AppShell />}>
                <Route index element={<Home />} />
                <Route path="u/:username" element={<Profile />} />
                <Route path="thread/:conversationKey" element={<Thread />} />
                <Route
                  path="login"
                  element={
                    <GuestRoute>
                      <Login />
                    </GuestRoute>
                  }
                />
                <Route
                  path="register"
                  element={
                    <GuestRoute>
                      <Register />
                    </GuestRoute>
                  }
                />
                <Route
                  path="forgot-password"
                  element={
                    <GuestRoute>
                      <ForgotPassword />
                    </GuestRoute>
                  }
                />
                <Route
                  path="inbox"
                  element={
                    <ProtectedRoute>
                      <Inbox />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="mirror"
                  element={
                    <ProtectedRoute>
                      <Mirror />
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
