import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { googleApi, clearSession } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { useToast } from '../components/Toast.jsx';
import Spinner from '../components/Spinner.jsx';
import Alert from '../components/Alert.jsx';

/**
 * Landing route for the redirect-mode Google flow.
 *
 * The backend never puts tokens in the URL: the callback 302s here with a
 * one-time `handoff` code (single-use, hashed at rest, 60s TTL) that this
 * page exchanges for the token pair. Failures arrive as `error` +
 * `error_description` and are rendered verbatim from the backend codes.
 */
export default function GoogleCallback() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { adopt, setUser } = useAuth();
  const [state, setState] = useState({ phase: 'working', message: '', detail: '' });
  const ran = useRef(false);

  const error = params.get('error');
  const errorDescription = params.get('error_description');
  const handoff = params.get('handoff');

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    if (error) {
      setState({
        phase: 'error',
        message: errorDescription || 'تعذّر إتمام الدخول بـ Google',
        detail: error,
      });
      return;
    }

    if (!handoff) {
      setState({
        phase: 'error',
        message: 'رابط الدخول غير مكتمل — لا يوجد رمز تسليم.',
        detail: 'MISSING_HANDOFF',
      });
      return;
    }

    (async () => {
      try {
        const { data } = await googleApi.exchange(handoff);

        // Link confirmation: the caller already had a session; keep it.
        if (data.linked) {
          setUser(data.user);
          toast.success(data.alreadyLinked ? 'حساب Google كان مرتبطًا بالفعل' : 'تم ربط Google');
          navigate('/settings', { replace: true });
          return;
        }

        clearSession();
        adopt(data);
        toast.success(data.created ? 'تم إنشاء حسابك بحساب Google' : 'أهلًا بعودتك');
        navigate('/inbox', { replace: true });
      } catch (err) {
        setState({ phase: 'error', message: err.message, detail: err.code });
      }
    })();
  }, [handoff, error, errorDescription, adopt, navigate, setUser, toast]);

  if (state.phase === 'working') {
    return <Spinner label="جارٍ إتمام الدخول بـ Google…" />;
  }

  return (
    <div className="page page--auth">
      <div className="auth-card">
        <header className="auth-card__head">
          <h1>تعذّر الدخول بـ Google</h1>
        </header>
        <Alert type="error" title={state.detail || 'خطأ'}>
          {state.message}
        </Alert>
        <p className="muted auth-card__note">
          يمكنك المحاولة مرة أخرى، أو استخدام البريد وكلمة المرور.
        </p>
        <div className="form-actions">
          <Link className="btn btn--primary" to="/login">
            العودة إلى الدخول
          </Link>
          <button
            type="button"
            className="btn btn--ghost"
            onClick={() => window.location.assign('/login')}
          >
            إعادة محاولة Google
          </button>
        </div>
      </div>
    </div>
  );
}
