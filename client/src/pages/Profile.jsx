import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { usersApi, ApiError } from '../lib/api.js';
import { formatDate } from '../lib/format.js';
import { useAuth } from '../lib/auth.jsx';
import Avatar from '../components/Avatar.jsx';
import Spinner from '../components/Spinner.jsx';
import Alert from '../components/Alert.jsx';
import SendMessageForm from '../components/SendMessageForm.jsx';
import QrCodeModal from '../components/QrCodeModal.jsx';
import { useToast } from '../components/Toast.jsx';

export default function Profile() {
  const { username } = useParams();
  const { user } = useAuth();
  const toast = useToast();
  const [state, setState] = useState({ status: 'loading', user: null, error: null });
  const [qrOpen, setQrOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setState({ status: 'loading', user: null, error: null });

    usersApi
      .profile(username)
      .then(({ data }) => {
        if (!cancelled) setState({ status: 'ready', user: data.user, error: null });
      })
      .catch((err) => {
        if (cancelled) return;
        setState({
          status: err instanceof ApiError && err.status === 404 ? 'missing' : 'error',
          user: null,
          error: err.message,
        });
      });

    return () => {
      cancelled = true;
    };
  }, [username]);

  const copyUrl = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      toast.success('تم نسخ الرابط بنجاح!');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('تعذر نسخ الرابط');
    }
  };

  if (state.status === 'loading') return <Spinner label="جارٍ تحميل الصفحة العامة…" />;

  if (state.status === 'missing') {
    return (
      <div className="page page--narrow">
        <Alert type="error" title="لا توجد صفحة بهذا الاسم">
          المستخدم <strong>@{username}</strong> غير موجود، أو أن حسابه موقوف.
        </Alert>
        <p className="muted">
          تأكّد من كتابة الاسم صحيحًا، أو <Link to="/">عد إلى الرئيسية</Link>.
        </p>
      </div>
    );
  }

  if (state.status === 'error') {
    return (
      <div className="page page--narrow">
        <Alert type="error">تعذّر تحميل الصفحة: {state.error}</Alert>
      </div>
    );
  }

  const profile = state.user;
  const isSelf = user?.username === profile.username;

  return (
    <div className="page page--profile">
      <header className="profile-card">
        <Avatar src={profile.avatar} name={profile.name} username={profile.username} size={90} />
        <div className="profile-card__meta">
          <div className="profile-card__title-row">
            <h1>{profile.name}</h1>
            {profile.role === 'admin' && <span className="profile-badge--admin">مشرف الموقع 🛡️</span>}
          </div>
          <p className="profile-card__handle">@{profile.username}</p>
          {profile.bio && <p className="profile-card__bio">{profile.bio}</p>}
          <p className="profile-card__since">عضو منذ {formatDate(profile.createdAt, { dateStyle: 'long' })}</p>
        </div>

        <div className="profile-card__share">
          <button
            type="button"
            className={`btn ${copied ? 'btn--ok' : 'btn--ghost'} btn--sm`}
            onClick={copyUrl}
          >
            {copied ? '✓ تم النسخ' : '🔗 نسخ الرابط'}
          </button>
          <button
            type="button"
            className="btn btn--outline btn--sm"
            onClick={() => setQrOpen(true)}
          >
            📱 رمز QR
          </button>
        </div>
      </header>

      {isSelf ? (
        <div className="self-note">
          <Alert type="info" title="هذه صفحتك الشخصية">
            هذا ما يراه زوارك ومتابعوك. انشر رابطك في سيرتك الذاتية (Bio) على إنستجرام وتويتر وتيك توك
            لاستقبال صراحاتهم. يمكنك تعديل بياناتك من <Link to="/settings">الإعدادات</Link>.
          </Alert>
        </div>
      ) : (
        <section className="composer-card">
          <SendMessageForm
            username={profile.username}
            displayName={profile.name}
            policy={profile.policy ?? null}
          />
        </section>
      )}

      {/* QR Code Modal */}
      <QrCodeModal
        open={qrOpen}
        onClose={() => setQrOpen(false)}
        user={profile}
        profileUrl={window.location.href}
      />
    </div>
  );
}
