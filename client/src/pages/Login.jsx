import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../lib/auth.jsx';
import { ApiError } from '../lib/api.js';
import { useToast } from '../components/Toast.jsx';
import Field from '../components/Field.jsx';
import Alert from '../components/Alert.jsx';
import GoogleButton from '../components/GoogleButton.jsx';

import Logo from '../components/Logo.jsx';

export default function Login() {
  const { user, signIn } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();

  useEffect(() => {
    if (user) {
      navigate('/inbox', { replace: true });
    }
  }, [user, navigate]);

  const [form, setForm] = useState({ identifier: '', password: '' });
  const [twoFactorData, setTwoFactorData] = useState(null);
  const [twoFactorCode, setTwoFactorCode] = useState('');
  const [error, setError] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});
  const [busy, setBusy] = useState(false);

  if (user) return null;

  const oauthError = params.get('error');
  const oauthMessage = params.get('error_description');
  const created = params.get('created') === '1';

  const update = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setFieldErrors({});
    try {
      const res = await signIn(form);
      if (res?.requiresTwoFactor) {
        setTwoFactorData(res);
        toast.info(res.message || 'أدخل رمز التحقق بخطوتين للمتابعة');
        return;
      }
      toast.success('أهلًا بعودتك');
      navigate(location.state?.from || '/inbox', { replace: true });
    } catch (err) {
      if (err instanceof ApiError) {
        setFieldErrors(err.fieldErrors || {});
        setError(err.message);
      } else {
        setError(err.message);
      }
    } finally {
      setBusy(false);
    }
  };

  const submitTwoFactor = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await confirmLogin({
        userId: twoFactorData?.userId,
        loginTicket: twoFactorData?.loginTicket,
        code: twoFactorCode.trim(),
      });
      toast.success('تم التحقق وتسجيل الدخول بنجاح');
      navigate(location.state?.from || '/inbox', { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : err.message);
    } finally {
      setBusy(false);
    }
  };

  const cancelTwoFactor = () => {
    setTwoFactorData(null);
    setTwoFactorCode('');
    setError(null);
  };

  return (
    <div className="page page--auth">
      <div className="auth-card">
        <header className="auth-card__head">
          <div className="auth-card__logo">
            <Logo size={46} showText={false} />
          </div>
          <h1>{twoFactorData ? 'التحقق بخطوتين' : 'تسجيل الدخول'}</h1>
          <p>
            {twoFactorData
              ? `أدخل رمز التحقق المرسل إلى ${twoFactorData.emailMasked || 'بريدك الإلكتروني'}`
              : 'ادخل ببريدك أو اسم مستخدمك.'}
          </p>
        </header>

        {created && (
          <Alert type="success" title="تم إنشاء حسابك">
            تم التسجيل بحساب Google بنجاح.
          </Alert>
        )}

        {oauthError && (
          <Alert type="error" title="تعذّر الدخول بـ Google">
            <code>{oauthError}</code>
            {oauthMessage && <div className="auth-card__oauth-msg">{oauthMessage}</div>}
            <div>
              <button
                type="button"
                className="linklike"
                onClick={() => (window.location.href = '/login')}
              >
                إعادة المحاولة
              </button>
            </div>
          </Alert>
        )}

        {error && <Alert type="error">{error}</Alert>}

        {twoFactorData ? (
          <form onSubmit={submitTwoFactor} noValidate>
            <Alert type="info">
              لحماية حسابك، تم تفعيل التحقق بخطوتين. أرسلنا رمزًا مكونًا من 6 أرقام إلى بريدك.
            </Alert>

            <Field
              label="رمز التحقق (6 أرقام)"
              name="twoFactorCode"
              type="text"
              inputMode="numeric"
              maxLength={6}
              className="ltr text-center"
              value={twoFactorCode}
              onChange={(e) => setTwoFactorCode(e.target.value.replace(/\D/g, ''))}
              placeholder="123456"
              required
              autoFocus
            />

            <button
              type="submit"
              className="btn btn--primary btn--block btn--big"
              disabled={busy || twoFactorCode.length !== 6}
            >
              {busy ? 'جارٍ التحقق…' : 'تأكيد الدخول'}
            </button>

            <button
              type="button"
              className="btn btn--ghost btn--block mt-3"
              onClick={cancelTwoFactor}
              disabled={busy}
            >
              العودة لتسجيل الدخول
            </button>
          </form>
        ) : (
          <>
            <form onSubmit={submit} noValidate>
              <Field
                label="البريد أو اسم المستخدم"
                name="identifier"
                type="text"
                autoComplete="username"
                value={form.identifier}
                onChange={update('identifier')}
                error={fieldErrors.identifier}
                required
              />
              <Field
                label="كلمة المرور"
                name="password"
                type="password"
                autoComplete="current-password"
                value={form.password}
                onChange={update('password')}
                error={fieldErrors.password}
                required
              />

              <button
                type="submit"
                className="btn btn--primary btn--block btn--big"
                disabled={busy}
              >
                {busy ? 'جارٍ الدخول…' : 'دخول'}
              </button>
            </form>

            <div className="divider">
              <span>أو</span>
            </div>

            <GoogleButton emailHint={form.identifier.includes('@') ? form.identifier : ''} />

            <footer className="auth-card__foot">
              <span>
                <Link to="/forgot-password">نسيت كلمة المرور؟</Link>
              </span>
              <span>
                ليس لديك حساب؟ <Link to="/register">أنشئ واحدًا</Link>
              </span>
            </footer>
          </>
        )}
      </div>
    </div>
  );
}
