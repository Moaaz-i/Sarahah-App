import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { passwordApi, ApiError } from '../lib/api.js';
import { useToast } from '../components/Toast.jsx';
import Field from '../components/Field.jsx';
import Alert from '../components/Alert.jsx';

/**
 * Two-step password reset:
 *   1. Enter email → backend sends a 6-digit OTP.
 *   2. Enter OTP + new password → password is set, sessions revoked.
 */
export default function ForgotPassword() {
  const toast = useToast();
  const navigate = useNavigate();

  const [step, setStep] = useState(1); // 1 = email, 2 = otp + new password
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');

  const [error, setError] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);

  const startCooldown = () => {
    setResendCooldown(60);
    const iv = setInterval(() => {
      setResendCooldown((s) => {
        if (s <= 1) { clearInterval(iv); return 0; }
        return s - 1;
      });
    }, 1000);
  };

  const sendOtp = async (e) => {
    e?.preventDefault();
    setBusy(true);
    setError(null);
    setFieldErrors({});
    try {
      await passwordApi.forgot(email);
      setStep(2);
      startCooldown();
      toast.success('أُرسل رمز التحقق إلى بريدك');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : err.message);
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    if (resendCooldown > 0) return;
    setBusy(true);
    try {
      await passwordApi.forgot(email);
      startCooldown();
      toast.success('أُرسل رمز جديد');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  const reset = async (e) => {
    e.preventDefault();
    if (newPassword !== confirm) {
      setFieldErrors({ confirm: 'كلمتا المرور غير متطابقتين' });
      return;
    }
    setBusy(true);
    setError(null);
    setFieldErrors({});
    try {
      await passwordApi.reset({ email, otp, newPassword });
      toast.success('تمت إعادة تعيين كلمة المرور');
      navigate('/login', { replace: true });
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
          <h1>استعادة كلمة المرور</h1>
          <p>
            {step === 1
              ? 'أدخل بريدك الإلكتروني وسنرسل لك رمز تحقق.'
              : `أدخل رمز التحقق المرسل إلى ${email}.`}
          </p>
        </header>

        {error && <Alert type="error">{error}</Alert>}

        {step === 1 ? (
          <form onSubmit={sendOtp} noValidate>
            <Field
              label="البريد الإلكتروني"
              name="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              error={fieldErrors.email}
              required
              autoFocus
            />
            <button type="submit" className="btn btn--primary btn--block btn--big" disabled={busy || !email}>
              {busy ? 'جارٍ الإرسال…' : 'إرسال رمز التحقق'}
            </button>
          </form>
        ) : (
          <form onSubmit={reset} noValidate>
            <Field
              label="رمز التحقق (6 أرقام)"
              name="otp"
              type="text"
              inputMode="numeric"
              pattern="\d{6}"
              maxLength={6}
              className="ltr text-center"
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
              error={fieldErrors.otp}
              required
              autoFocus
            />
            <Field
              label="كلمة المرور الجديدة"
              name="newPassword"
              type="password"
              autoComplete="new-password"
              hint="8 أحرف على الأقل، وتحوي حرفًا ورقمًا."
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              error={fieldErrors.newPassword}
              required
            />
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
              disabled={busy || otp.length !== 6 || !newPassword}
            >
              {busy ? 'جارٍ التحقق…' : 'إعادة تعيين كلمة المرور'}
            </button>
          </form>
        )}

        <div className="auth-card__foot" style={{ marginTop: '1rem' }}>
          {step === 2 && (
            <button
              type="button"
              className="linklike"
              onClick={resend}
              disabled={resendCooldown > 0 || busy}
            >
              {resendCooldown > 0 ? `إعادة الإرسال (${resendCooldown}s)` : 'إعادة إرسال الرمز'}
            </button>
          )}
          <span>
            <Link to="/login">العودة لتسجيل الدخول</Link>
          </span>
        </div>
      </div>
    </div>
  );
}
