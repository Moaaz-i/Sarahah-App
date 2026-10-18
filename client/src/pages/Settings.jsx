import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { usersApi, googleApi, confirmEmailApi, ApiError } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { useToast } from '../components/Toast.jsx';
import Field from '../components/Field.jsx';
import Alert from '../components/Alert.jsx';
import Avatar from '../components/Avatar.jsx';
import Modal from '../components/Modal.jsx';

/**
 * Public avatar URLs the backend will happily store (it never fetches them).
 * All are self-contained SVG data URIs — beautiful nature scenery, no people,
 * and they always render even offline.
 */
const NATURE = (id, label, svg) => ({ id, label, url: `data:image/svg+xml;utf8,${encodeURIComponent(svg)}` });

const PRESETS = [
  NATURE('sunset', 'غروب بحري', `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><defs><linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#ff6b35"/><stop offset="45%" stop-color="#f7c948"/><stop offset="100%" stop-color="#2d5016"/></linearGradient></defs><rect width="200" height="200" fill="url(#s)"/><circle cx="100" cy="110" r="45" fill="#fff3b0" opacity="0.95"/><rect y="140" width="200" height="60" fill="#1a3a1a"/><ellipse cx="40" cy="150" rx="30" ry="12" fill="#2d5016"/><ellipse cx="160" cy="148" rx="35" ry="14" fill="#2d5016"/></svg>`),
  NATURE('mountains', 'جبال زرقاء', `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><defs><linearGradient id="m" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#74b9ff"/><stop offset="100%" stop-color="#a29bfe"/></linearGradient></defs><rect width="200" height="200" fill="url(#m)"/><circle cx="155" cy="50" r="22" fill="#ffeaa7"/><polygon points="0,200 60,90 120,200" fill="#0984e3"/><polygon points="70,200 140,70 200,200" fill="#6c5ce7"/><polygon points="120,200 175,110 200,200" fill="#4834d4"/><rect y="180" width="200" height="20" fill="#2d3436"/></svg>`),
  NATURE('forest', 'غابة ضبابية', `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><defs><linearGradient id="f" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#dfe6e9"/><stop offset="100%" stop-color="#b2bec3"/></linearGradient></defs><rect width="200" height="200" fill="url(#f)"/><rect x="20" y="60" width="8" height="140" fill="#2d3436"/><polygon points="24,40 8,100 40,100" fill="#00b894"/><polygon points="24,70 5,130 43,130" fill="#00a381"/><rect x="60" y="50" width="10" height="150" fill="#2d3436"/><polygon points="65,25 47,95 83,95" fill="#00b894"/><polygon points="65,60 42,130 88,130" fill="#00a381"/><rect x="110" y="65" width="7" height="135" fill="#2d3436"/><polygon points="113,45 98,100 128,100" fill="#00b894"/><polygon points="113,72 95,135 131,135" fill="#00a381"/><rect x="150" y="45" width="11" height="155" fill="#2d3436"/><polygon points="155,20 136,90 174,90" fill="#00b894"/><polygon points="155,55 132,130 178,130" fill="#00a381"/></svg>`),
  NATURE('ocean', 'أمواج المحيط', `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><defs><linearGradient id="o" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#81ecec"/><stop offset="100%" stop-color="#0984e3"/></linearGradient></defs><rect width="200" height="200" fill="url(#o)"/><circle cx="100" cy="45" r="28" fill="#fdcb6e"/><path d="M0,120 Q25,100 50,120 T100,120 T150,120 T200,120 L200,200 L0,200 Z" fill="#0984e3" opacity="0.9"/><path d="M0,140 Q25,120 50,140 T100,140 T150,140 T200,140 L200,200 L0,200 Z" fill="#74b9ff" opacity="0.8"/><path d="M0,160 Q25,140 50,160 T100,160 T150,160 T200,160 L200,200 L0,200 Z" fill="#a29bfe" opacity="0.6"/></svg>`),
  NATURE('aurora', 'شفق قطبي', `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><defs><linearGradient id="a" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#0c0c1d"/><stop offset="100%" stop-color="#1a1a3e"/></linearGradient></defs><rect width="200" height="200" fill="url(#a)"/><circle cx="50" cy="30" r="1.5" fill="#fff"/><circle cx="120" cy="20" r="1" fill="#fff"/><circle cx="170" cy="50" r="1.5" fill="#fff"/><circle cx="80" cy="60" r="1" fill="#fff"/><circle cx="30" cy="80" r="1" fill="#fff"/><path d="M20,150 Q60,40 100,120 Q140,40 180,150" stroke="#00ff88" stroke-width="6" fill="none" opacity="0.7"/><path d="M30,160 Q70,60 110,130 Q150,60 190,160" stroke="#00ccff" stroke-width="4" fill="none" opacity="0.5"/><polygon points="0,200 40,130 80,200" fill="#16213e"/><polygon points="60,200 120,110 180,200" fill="#1a1a3e"/><polygon points="140,200 190,140 200,200" fill="#16213e"/></svg>`),
  NATURE('flowers', 'حقل أزهار', `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect width="200" height="200" fill="#74b9ff"/><circle cx="155" cy="40" r="25" fill="#fdcb6e"/><rect y="120" width="200" height="80" fill="#55a630"/><circle cx="40" cy="145" r="12" fill="#e17055"/><circle cx="40" cy="145" r="5" fill="#fdcb6e"/><circle cx="90" cy="155" r="14" fill="#e84393"/><circle cx="90" cy="155" r="6" fill="#fdcb6e"/><circle cx="145" cy="142" r="11" fill="#a29bfe"/><circle cx="145" cy="142" r="4" fill="#fdcb6e"/><circle cx="175" cy="160" r="10" fill="#e17055"/><circle cx="175" cy="160" r="4" fill="#fdcb6e"/><rect x="38" y="145" width="4" height="55" fill="#2d6a1e"/><rect x="87" y="155" width="4" height="45" fill="#2d6a1e"/><rect x="143" y="142" width="4" height="58" fill="#2d6a1e"/><rect x="173" y="160" width="4" height="40" fill="#2d6a1e"/></svg>`),
  NATURE('desert', 'صحراء عند الغروب', `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><defs><linearGradient id="d" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#e17055"/><stop offset="50%" stop-color="#fdcb6e"/><stop offset="100%" stop-color="#e17055"/></linearGradient></defs><rect width="200" height="200" fill="url(#d)"/><circle cx="100" cy="80" r="35" fill="#fff3b0"/><ellipse cx="50" cy="160" rx="70" ry="25" fill="#d4a017"/><ellipse cx="160" cy="170" rx="80" ry="30" fill="#c68a00"/><ellipse cx="100" cy="185" rx="120" ry="20" fill="#b8860b"/><path d="M60,155 L65,110 L70,155" fill="#2d5016" stroke="#2d5016" stroke-width="3"/><path d="M65,130 L55,118" stroke="#2d5016" stroke-width="3"/><path d="M65,125 L75,115" stroke="#2d5016" stroke-width="3"/></svg>`),
  NATURE('starry', 'سماء مرصّعة', `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><defs><linearGradient id="st" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#0a0a23"/><stop offset="100%" stop-color="#1e3a5f"/></linearGradient></defs><rect width="200" height="200" fill="url(#st)"/><circle cx="30" cy="30" r="1.5" fill="#fff"/><circle cx="70" cy="15" r="1" fill="#fff"/><circle cx="110" cy="40" r="2" fill="#fff"/><circle cx="150" cy="20" r="1" fill="#fff"/><circle cx="180" cy="55" r="1.5" fill="#fff"/><circle cx="20" cy="70" r="1" fill="#fff"/><circle cx="60" cy="55" r="1.5" fill="#fff"/><circle cx="130" cy="70" r="1" fill="#fff"/><circle cx="170" cy="85" r="1.5" fill="#fff"/><circle cx="45" cy="95" r="1" fill="#fff"/><circle cx="90" cy="35" r="2.5" fill="#ffeaa7"/><circle cx="90" cy="35" r="8" fill="#ffeaa7" opacity="0.2"/><polygon points="0,200 50,130 100,200" fill="#0d1b2a"/><polygon points="70,200 130,110 190,200" fill="#1b2838"/><polygon points="150,200 195,140 200,200" fill="#0d1b2a"/></svg>`),
];

function Section({ title, description, children }) {
  return (
    <section className="section-card">
      <header className="section-card__head">
        <h2>{title}</h2>
        {description && <p className="muted">{description}</p>}
      </header>
      {children}
    </section>
  );
}

export default function Settings() {
  const { user, setUser, reload, signOut } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();

  /* ---------------------------------------------------------- profile form */
  const [profile, setProfile] = useState({
    name: user?.name || '',
    bio: user?.bio || '',
    avatar: user?.avatar || '',
  });
  const [profileErr, setProfileErr] = useState({});
  const [profileMsg, setProfileMsg] = useState(null);
  const [profileBusy, setProfileBusy] = useState(false);

  /* ------------------------------------------------------------- password */
  const [pw, setPw] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [pwErr, setPwErr] = useState({});
  const [pwMsg, setPwMsg] = useState(null);
  const [pwBusy, setPwBusy] = useState(false);

  /* ---------------------------------------------------------------- google */
  const [links, setLinks] = useState(null);
  const [linksErr, setLinksErr] = useState(null);
  const [linkBusy, setLinkBusy] = useState(false);

  /* ------------------------------------------------------------ danger zone */
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletePw, setDeletePw] = useState('');
  const [deleteMsg, setDeleteMsg] = useState(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  /* ------------------------------------------------------- email confirm */
  const [confirmStep, setConfirmStep] = useState(1);
  const [confirmOtp, setConfirmOtp] = useState('');
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [confirmMsg, setConfirmMsg] = useState(null);
  const [confirmCooldown, setConfirmCooldown] = useState(0);

  const startConfirmCooldown = () => {
    setConfirmCooldown(60);
    const iv = setInterval(() => {
      setConfirmCooldown((s) => {
        if (s <= 1) { clearInterval(iv); return 0; }
        return s - 1;
      });
    }, 1000);
  };

  const sendConfirmOtp = async () => {
    setConfirmBusy(true);
    setConfirmMsg(null);
    try {
      await confirmEmailApi.send();
      setConfirmStep(2);
      startConfirmCooldown();
      setConfirmMsg({ type: 'success', text: 'أُرسل رمز التحقق إلى بريدك الإلكتروني.' });
    } catch (err) {
      setConfirmMsg({ type: 'error', text: err.message });
    } finally {
      setConfirmBusy(false);
    }
  };

  const verifyConfirmOtp = async (e) => {
    e.preventDefault();
    setConfirmBusy(true);
    setConfirmMsg(null);
    try {
      await confirmEmailApi.verify(confirmOtp);
      setConfirmMsg({ type: 'success', text: 'تم تأكيد بريدك الإلكتروني بنجاح!' });
      setConfirmStep(1);
      setConfirmOtp('');
      const fresh = await reload();
      if (fresh) setUser(fresh);
    } catch (err) {
      setConfirmMsg({ type: 'error', text: err.message });
    } finally {
      setConfirmBusy(false);
    }
  };

  useEffect(() => {
    setProfile({ name: user?.name || '', bio: user?.bio || '', avatar: user?.avatar || '' });
  }, [user]);

  useEffect(() => {
    let cancelled = false;
    googleApi
      .links()
      .then(({ data }) => !cancelled && setLinks(data))
      .catch((err) => !cancelled && setLinksErr(err.message));
    return () => {
      cancelled = true;
    };
  }, []);

  const saveProfile = async (e) => {
    e.preventDefault();
    setProfileBusy(true);
    setProfileErr({});
    setProfileMsg(null);
    try {
      const { data } = await usersApi.updateMe({
        name: profile.name,
        bio: profile.bio,
        avatar: profile.avatar,
      });
      setUser(data.user);
      setProfileMsg({ type: 'success', text: 'تم حفظ الملف العام.' });
      toast.success('تم تحديث الملف');
    } catch (err) {
      if (err instanceof ApiError) {
        setProfileErr(err.fieldErrors || {});
        setProfileMsg({ type: 'error', text: err.message });
      } else {
        setProfileMsg({ type: 'error', text: err.message });
      }
    } finally {
      setProfileBusy(false);
    }
  };

  const savePassword = async (e) => {
    e.preventDefault();
    setPwBusy(true);
    setPwErr({});
    setPwMsg(null);
    if (pw.newPassword !== pw.confirm) {
      setPwErr({ confirm: 'كلمتا المرور غير متطابقتين' });
      setPwBusy(false);
      return;
    }
    try {
      await usersApi.changePassword({
        // Omitted rather than sent empty: the API treats "" as a provided-but-
        // invalid password (400), and Google-only accounts have no current
        // password to send at all.
        ...(pw.currentPassword ? { currentPassword: pw.currentPassword } : {}),
        newPassword: pw.newPassword,
      });
      setPw({ currentPassword: '', newPassword: '', confirm: '' });
      setPwMsg({ type: 'success', text: 'تم تغيير كلمة المرور وإبطال بقية الجلسات.' });
      toast.success('تم تغيير كلمة المرور');
    } catch (err) {
      setPwMsg({
        type: 'error',
        text: err instanceof ApiError ? err.message : err.message,
      });
      if (err instanceof ApiError && err.fieldErrors) setPwErr(err.fieldErrors);
    } finally {
      setPwBusy(false);
    }
  };

  const startLink = async () => {
    setLinkBusy(true);
    try {
      const { data } = await googleApi.startLink();
      window.location.assign(data.authorizationUrl);
    } catch (err) {
      setLinksErr(err.message);
      toast.error(err.message);
      setLinkBusy(false);
    }
  };

  const unlink = async () => {
    setLinkBusy(true);
    try {
      await googleApi.unlink();
      setLinks((l) => ({ ...l, links: (l?.links || []).filter((x) => x.provider !== 'google') }));
      toast.success('تم فك ارتباط حساب Google');
      const fresh = await reload();
      if (fresh) setUser(fresh);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLinkBusy(false);
    }
  };

  const doDelete = async (e) => {
    e.preventDefault();
    setDeleteBusy(true);
    setDeleteMsg(null);
    try {
      await usersApi.deleteAccount(deletePw);
      await signOut();
      toast.success('تم حذف الحساب');
      navigate('/', { replace: true });
    } catch (err) {
      setDeleteMsg(err instanceof ApiError ? err.message : err.message);
    } finally {
      setDeleteBusy(false);
    }
  };

  const hasGoogle = Boolean(links?.links?.some((l) => l.provider === 'google'));
  const canUnlink = links?.hasPassword;
  // True only for accounts that never had a password (Google-only). Derived
  // from GET /auth/google/links, which reports it from the stored hash —
  // the user payload never carries a password field to inspect.
  const noPassword = links?.hasPassword === false;

  return (
    <div className="page page--settings">
      <header className="page__head">
        <div>
          <h1>الإعدادات</h1>
          <p className="muted">
            أنت داخل الحساب <strong>@{user?.username}</strong> — {user?.email}
          </p>
        </div>
      </header>

      <Section
        title="الملف العام"
        description="هذا ما يراه كل من يفتح رابط صفحتك."
      >
        <div className="settings-profile">
          <div className="settings-profile__preview">
            <Avatar src={profile.avatar} name={profile.name} username={user?.username} size={96} />
            <p className="muted">معاينة فورية</p>
          </div>

          <form className="settings-profile__form" onSubmit={saveProfile}>
            {profileMsg && (
              <Alert type={profileMsg.type === 'error' ? 'error' : 'success'}>
                {profileMsg.text}
              </Alert>
            )}

            <Field
              label="الاسم"
              name="name"
              value={profile.name}
              onChange={(e) => setProfile((p) => ({ ...p, name: e.target.value }))}
              error={profileErr.name}
              required
            />
            <Field
              as="textarea"
              label="النبذة"
              name="bio"
              rows={3}
              maxLength={300}
              hint={`${profile.bio.length}/300`}
              value={profile.bio}
              onChange={(e) => setProfile((p) => ({ ...p, bio: e.target.value }))}
              error={profileErr.bio}
            />

            <Field
              label="رابط الصورة"
              name="avatar"
              type="url"
              placeholder="https://…"
              hint="يُخزَّن الرابط كما هو — الخادم لا ينزّل الصورة ولا يتحقق منها. الرابط المعطوب يُعرض كحرفاً أولى."
              value={profile.avatar}
              onChange={(e) => setProfile((p) => ({ ...p, avatar: e.target.value }))}
              error={profileErr.avatar}
            />

            <div className="preset-row">
              {PRESETS.map(({ url, label }) => (
                <button
                  key={label}
                  type="button"
                  title={label}
                  className={`preset${profile.avatar === url ? ' preset--active' : ''}`}
                  onClick={() => setProfile((p) => ({ ...p, avatar: url }))}
                  aria-label={`اختيار صورة: ${label}`}
                >
                  <Avatar src={url} name={profile.name} size={44} />
                </button>
              ))}
              <button
                type="button"
                className="preset preset--clear"
                onClick={() => setProfile((p) => ({ ...p, avatar: '' }))}
              >
                بدون
              </button>
            </div>

            <div className="form-actions">
              <button type="submit" className="btn btn--primary" disabled={profileBusy}>
                {profileBusy ? 'جارٍ الحفظ…' : 'حفظ الملف'}
              </button>
              <Link className="btn btn--ghost" to={`/u/${user?.username}`}>
                معاينة صفحتي
              </Link>
            </div>
          </form>
        </div>
      </Section>

      <Section
        title="تأكيد البريد الإلكتروني"
        description="أكّد بريدك الإلكتروني لتأمين حسابك واستعادة كلمة المرور."
      >
        {user?.isVerified ? (
          <div className="row-between">
            <div>
              <p>
                <strong>بريدك الإلكتروني مُؤكَّد ✅</strong>
              </p>
              <p className="muted">{user?.email}</p>
            </div>
          </div>
        ) : (
          <>
            {confirmMsg && (
              <Alert type={confirmMsg.type === 'error' ? 'error' : 'success'}>
                {confirmMsg.text}
              </Alert>
            )}
            {confirmStep === 1 ? (
              <div className="row-between">
                <div>
                  <p>
                    <strong>بريدك غير مُؤكَّد بعد</strong>
                  </p>
                  <p className="muted">
                    سنرسل رمز تحقق من 6 أرقام إلى {user?.email}
                  </p>
                </div>
                <button
                  type="button"
                  className="btn btn--primary"
                  onClick={sendConfirmOtp}
                  disabled={confirmBusy}
                >
                  {confirmBusy ? 'جارٍ الإرسال…' : 'إرسال رمز التحقق'}
                </button>
              </div>
            ) : (
              <form onSubmit={verifyConfirmOtp} className="form-narrow">
                <Field
                  label="رمز التحقق (6 أرقام)"
                  name="confirmOtp"
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  className="ltr text-center"
                  value={confirmOtp}
                  onChange={(e) => setConfirmOtp(e.target.value.replace(/\D/g, ''))}
                  required
                  autoFocus
                />
                <div className="form-actions">
                  <button
                    type="submit"
                    className="btn btn--primary"
                    disabled={confirmBusy || confirmOtp.length !== 6}
                  >
                    {confirmBusy ? 'جارٍ التحقق…' : 'تأكيد'}
                  </button>
                  <button
                    type="button"
                    className="btn btn--ghost"
                    onClick={sendConfirmOtp}
                    disabled={confirmBusy || confirmCooldown > 0}
                  >
                    {confirmCooldown > 0 ? `إعادة الإرسال (${confirmCooldown}s)` : 'إعادة الإرسال'}
                  </button>
                </div>
              </form>
            )}
          </>
        )}
      </Section>

      <Section
        title="Google"
        description="اربط حساب Google للاعتاد على الدخول بضغطة واحدة."
      >
        {linksErr && <Alert type="error">{linksErr}</Alert>}

        {!links ? (
          <p className="muted">جارٍ التحقق…</p>
        ) : hasGoogle ? (
          <div className="row-between">
            <div>
              <p>
                <strong>Google</strong> مرتبط بهذا الحساب.
              </p>
              <p className="muted">
                {canUnlink
                  ? 'يمكنك فك الاربط في أي وقت.'
                  : 'لا يمكن فك الاربط: هذا هو وسيلة الدخول الوحيدة، وإزالتها ستُقفل حسابك.'}
              </p>
            </div>
            <div className="btn-row">
              <button
                type="button"
                className="btn btn--outline"
                onClick={unlink}
                disabled={linkBusy || !canUnlink}
              >
                فك الارتباط
              </button>
            </div>
          </div>
        ) : (
          <div className="row-between">
            <div>
              <p>لم يُربط أي حساب Google بعد.</p>
              <p className="muted">يتطلب ذلك أن تكون مسجّل الدخول بالفعل.</p>
            </div>
            <button type="button" className="btn btn--google" onClick={startLink} disabled={linkBusy}>
              {linkBusy ? 'جارٍ التحويل…' : 'ربط حساب Google'}
            </button>
          </div>
        )}
      </Section>

      <Section title="كلمة المرور" description="التغيير يُبطِل كل الجلسات الأخرى فورًا.">
        <form className="form-narrow" onSubmit={savePassword}>
          {pwMsg && <Alert type={pwMsg.type === 'error' ? 'error' : 'success'}>{pwMsg.text}</Alert>}
          {noPassword && (
            <Alert type="info" title="أنت تستخدم حساب Google">
              لم تُضِف كلمة مرور لهذه الحساب بعد، لذلك لا نطلب منك كلمة مرور حالية. اضبط
              واحدة الآن وستتمكن لاحمًا من الدخول بها مباشرة.
            </Alert>
          )}
          {!noPassword && (
            <Field
              label="كلمة المرور الحالية"
              name="currentPassword"
              type="password"
              autoComplete="current-password"
              value={pw.currentPassword}
              onChange={(e) => setPw((p) => ({ ...p, currentPassword: e.target.value }))}
              error={pwErr.currentPassword}
              required
            />
          )}
          <Field
            label="كلمة المرور الجديدة"
            name="newPassword"
            type="password"
            autoComplete="new-password"
            hint="8 أحرف على الأقل، وتحوي حرفًا ورقمًا."
            value={pw.newPassword}
            onChange={(e) => setPw((p) => ({ ...p, newPassword: e.target.value }))}
            error={pwErr.newPassword}
            required
          />
          <Field
            label="تأكيد كلمة المرور الجديدة"
            name="confirm"
            type="password"
            autoComplete="new-password"
            value={pw.confirm}
            onChange={(e) => setPw((p) => ({ ...p, confirm: e.target.value }))}
            error={pwErr.confirm}
            required
          />
          <button type="submit" className="btn btn--primary" disabled={pwBusy}>
            {pwBusy ? 'جارٍ الحفظ…' : 'تغيير كلمة المرور'}
          </button>
        </form>
      </Section>

      <Section title="منطقة الخطر" description="لا يمكن التراجع عن هذه الخطوة.">
        <div className="row-between">
          <div>
            <p>
              <strong>حذف الحساب</strong>
            </p>
            <p className="muted">
              يُعالَج كحذف ناعم: تُبطَل الجلسات فورًا، ثم تُمسح البيانات نهائيًا بعد 30 يومًا.
            </p>
          </div>
          <button type="button" className="btn btn--danger" onClick={() => setDeleteOpen(true)}>
            حذف حسابي
          </button>
        </div>
      </Section>

      <Modal
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title="تأكيد حذف الحساب"
        footer={
          <>
            <button type="button" className="btn btn--ghost" onClick={() => setDeleteOpen(false)}>
              إلغاء
            </button>
            <button
              type="submit"
              form="delete-form"
              className="btn btn--danger"
              disabled={deleteBusy || (!noPassword && !deletePw)}
            >
              {deleteBusy ? 'جارٍ الحذف…' : 'حذف نهائي'}
            </button>
          </>
        }
      >
        <form id="delete-form" onSubmit={doDelete}>
          {deleteMsg && <Alert type="error">{deleteMsg}</Alert>}
          <p>
            لن تتمكن من استعادة حسابك.
            {noPassword
              ? ' حسابك يدخل بـ Google ولا يملك كلمة مرور، لذلك يكفي تأكيدك من هذه النافذة.'
              : ' أدخل كلمة المرور للتأكيد.'}
          </p>
          {!noPassword && (
            <Field
              label="كلمة المرور"
              name="deletePassword"
              type="password"
              autoComplete="current-password"
              value={deletePw}
              onChange={(e) => setDeletePw(e.target.value)}
              required
              autoFocus
            />
          )}
        </form>
      </Modal>
    </div>
  );
}
