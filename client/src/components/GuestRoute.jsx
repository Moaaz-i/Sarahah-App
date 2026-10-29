import { Navigate } from 'react-router-dom';
import { useAuth } from '../lib/auth.jsx';
import Spinner from './Spinner.jsx';

/**
 * Prevents authenticated (logged-in) users from opening guest-only routes
 * such as /login, /register, and /forgot-password.
 * Redirects them immediately to their inbox.
 */
export default function GuestRoute({ children }) {
  const { user, booting } = useAuth();

  if (booting) {
    return <Spinner label="جارٍ التحميل…" />;
  }

  if (user) {
    return <Navigate to="/inbox" replace />;
  }

  return children;
}
