import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Alert from "../components/Alert.jsx";
import Field from "../components/Field.jsx";
import GoogleButton from '../components/GoogleButton.jsx';
import { useToast } from "../components/Toast.jsx";
import { ApiError } from "../lib/api.js";
import { useAuth } from "../lib/auth.jsx";

const RULES = [
  { test: (v) => v.length >= 8, label: '8 أحرف على الأقل' },
  { test: (v) => /[A-Za-z]/.test(v), label: 'حرف واحد على الأقل' },
  { test: (v) => /[0-9]/.test(v), label: 'رقم واحد على الأقل' },
];

export default function Register() {
  const { register } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();

  const [form, setForm] = useState({ name: '', username: '', email: '', password: '' });
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});
  const [busy, setBusy] = useState(false);

  const update = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setError(null);
    setFieldErrors({});

    if (form.password !== confirm) {
      setFieldErrors({ confirm: 'كلمتا المرور غير متطابقتين' });
      return;
    }

    setBusy(true);
    try {
      await register(form);
      toast.success("مرحبًا بك في صارحني");
      navigate('/inbox', { replace: true });
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
          <h1>إنشاء حساب</h1>
          <p>اسم مستخدم، بريد، وكلمة مرور — لا أكثر.</p>
        </header>

        {error && <Alert type="error">{error}</Alert>}

        <form onSubmit={submit} noValidate>
          <Field
            label="الاسم"
            name="name"
            type="text"
            autoComplete="name"
            placeholder="مثال: سارة أحمد"
            value={form.name}
            onChange={update('name')}
            error={fieldErrors.name}
            required
          />
          <Field
            label="اسم المستخدم"
            name="username"
            type="text"
            autoComplete="username"
            placeholder="sara_ahmed"
            hint="حروف إنجليزية وأرقام وشرطة سفلية فقط — يظهر في رابط صفحتك."
            value={form.username}
            onChange={update('username')}
            error={fieldErrors.username}
            required
          />
          <Field
            label="البريد الإلكتروني"
            name="email"
            type="email"
            autoComplete="email"
            value={form.email}
            onChange={update('email')}
            error={fieldErrors.email}
            required
          />
          <Field
            label="كلمة المرور"
            name="password"
            type="password"
            autoComplete="new-password"
            value={form.password}
            onChange={update('password')}
            error={fieldErrors.password}
            required
          />

          <ul className="rules">
            {RULES.map((r) => (
              <li key={r.label} className={r.test(form.password) ? 'rule rule--ok' : 'rule'}>
                <span aria-hidden="true">{r.test(form.password) ? '✓' : '○'}</span>
                {r.label}
              </li>
            ))}
          </ul>

          <Field
            label="تأكيد كلمة المرور"
            name="confirm"
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            error={fieldErrors.confirm}
            required
          />

          <button
            type="submit"
            className="btn btn--primary btn--block btn--big"
            disabled={busy}
          >
            {busy ? 'جارٍ الإنشاء…' : 'إنشاء الحساب'}
          </button>
        </form>

        <div className="divider">
          <span>أو</span>
        </div>

        <GoogleButton label="التسجيل باستخدام Google" />

        <footer className="auth-card__foot">
          <span>
            لديك حساب بالفعل؟ <Link to="/login">سجّل الدخول</Link>
          </span>
        </footer>
      </div>
    </div>
  );
}
