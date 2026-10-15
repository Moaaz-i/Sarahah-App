import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../lib/auth.jsx';
import Spinner from './Spinner.jsx';

/** Gate a route behind an authenticated session (optionally an admin). */
export default function ProtectedRoute({ children, adminOnly = false }) {
  const { user, booting } = useAuth();
  const location = useLocation();

  if (booting) return <Spinner label="جارٍ استعادة الجلسة…" />;

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  if (adminOnly && user.role !== 'admin') {
    return <Navigate to="/inbox" replace />;
  }
  return children;
}
