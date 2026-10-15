import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { usersApi, googleApi, ApiError } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { useToast } from '../components/Toast.jsx';
import Field from '../components/Field.jsx';
import Alert from '../components/Alert.jsx';
import Avatar from '../components/Avatar.jsx';
import Modal from '../components/Modal.jsx';

/** Public avatar URLs the backend will happily store (it never fetches them). */
const PRESETS = Array.from({ length: 8 }, (_, i) => `https://i.pravatar.cc/200?img=${i + 1}`);

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
              {PRESETS.map((url) => (
                <button
                  key={url}
                  type="button"
                  className={`preset${profile.avatar === url ? ' preset--active' : ''}`}
                  onClick={() => setProfile((p) => ({ ...p, avatar: url }))}
                  aria-label="اختيار صورة جاهزة"
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
