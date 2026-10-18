import { useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../lib/auth.jsx';
import { ApiError } from '../lib/api.js';
import { useToast } from '../components/Toast.jsx';
import Field from '../components/Field.jsx';
import Alert from '../components/Alert.jsx';
import GoogleButton from '../components/GoogleButton.jsx';

export default function Login() {
  const { signIn } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();

  const [form, setForm] = useState({ identifier: '', password: '' });
  const [error, setError] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});
  const [busy, setBusy] = useState(false);

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
      await signIn(form);
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

  return (
    <div className="page page--auth">
      <div className="auth-card">
        <header className="auth-card__head">
          <h1>تسجيل الدخول</h1>
          <p>ادخل ببريدك أو اسم مستخدمك.</p>
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

          <button type="submit" className="btn btn--primary btn--block btn--big" disabled={busy}>
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
      </div>
    </div>
  );
}
