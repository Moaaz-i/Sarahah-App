import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { googleApi, clearSession } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { useToast } from '../components/Toast.jsx';
import Spinner from '../components/Spinner.jsx';
import Alert from '../components/Alert.jsx';

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

  // Multi-signal detection: checks URL param, localStorage flag, window name, opener, or popup dimensions
  const popupParam = params.get('popup') === '1';
  const popupStorage = typeof window !== 'undefined' && localStorage.getItem('sarhny_in_popup_flow') === '1';
  const popupWindow = typeof window !== 'undefined' && Boolean(window.opener || window.name === 'sarhny_google_auth');
  const popupDimensions = typeof window !== 'undefined' && window.innerWidth <= 650 && window.innerHeight <= 750;

  const isPopup = popupParam || popupStorage || popupWindow || popupDimensions;

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    // -------------------------------------------------------------
    // POPUP WINDOW MODE:
    // Transmit data to parent window, close self, and NEVER navigate/load app here.
    // -------------------------------------------------------------
    if (isPopup) {
      localStorage.removeItem('sarhny_in_popup_flow');

      if (error) {
        const errorMsg = errorDescription || error;
        const errPayload = { type: 'sarhny:google:error', error: errorMsg };

        try {
          window.opener?.postMessage(errPayload, '*');
        } catch {}
        try {
          const bc = new BroadcastChannel('sarhny_oauth');
          bc.postMessage(errPayload);
          bc.close();
        } catch {}
        try {
          localStorage.setItem('sarhny:google_oauth_result', JSON.stringify({ error: errorMsg, ts: Date.now() }));
        } catch {}

        window.close();
        setTimeout(() => window.close(), 100);
        return;
      }

      if (handoff) {
        const successPayload = { type: 'sarhny:google:success', handoff };

        try {
          window.opener?.postMessage(successPayload, '*');
        } catch {}
        try {
          const bc = new BroadcastChannel('sarhny_oauth');
          bc.postMessage(successPayload);
          bc.close();
        } catch {}
        try {
          localStorage.setItem('sarhny:google_oauth_result', JSON.stringify({ handoff, ts: Date.now() }));
        } catch {}

        window.close();
        setTimeout(() => window.close(), 100);
        return;
      }
    }

    // -------------------------------------------------------------
    // FULL PAGE FALLBACK MODE (Only if user initiated standard full-page redirect):
    // -------------------------------------------------------------
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

        if (data.user?.email) {
          try {
            const raw = localStorage.getItem('sarhny:google_accounts');
            const list = raw ? JSON.parse(raw) : [];
            const updated = [
              {
                email: data.user.email,
                name: data.user.name || data.user.username || data.user.email.split('@')[0],
                avatar: data.user.avatar || '',
              },
              ...list.filter((a) => a.email !== data.user.email),
            ].slice(0, 5);
            localStorage.setItem('sarhny:google_accounts', JSON.stringify(updated));
          } catch {}
        }

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
  }, [handoff, error, errorDescription, isPopup, adopt, navigate, setUser, toast]);

  // If this is a popup, render ONLY the closer screen. NEVER render App UI or navigate.
  if (isPopup) {
    return (
      <div className="popup-closer-screen">
        <div className="popup-closer-card">
          <div className="popup-closer-spinner" />
          <h3>{error ? 'تم إلغاء المصادقة' : 'تم التحقق بنجاح!'}</h3>
          <p>{error ? (errorDescription || error) : 'تم نقل الجلسة إلى التطبيق الرئيسي. جارٍ إغلاق هذه النافذة…'}</p>
          <button
            type="button"
            className="btn btn--outline btn--sm"
            onClick={() => window.close()}
          >
            إغلاق النافذة
          </button>
        </div>
      </div>
    );
  }

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
