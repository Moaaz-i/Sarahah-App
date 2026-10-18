import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { usersApi, ApiError } from '../lib/api.js';
import { formatDate } from '../lib/format.js';
import { useAuth } from '../lib/auth.jsx';
import Avatar from '../components/Avatar.jsx';
import Spinner from '../components/Spinner.jsx';
import Alert from '../components/Alert.jsx';
import SendMessageForm from '../components/SendMessageForm.jsx';

export default function Profile() {
  const { username } = useParams();
  const { user } = useAuth();
  const [state, setState] = useState({ status: 'loading', user: null, error: null });

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
        <Avatar src={profile.avatar} name={profile.name} username={profile.username} size={84} />
        <div className="profile-card__meta">
          <h1>{profile.name}</h1>
          <p className="profile-card__handle">@{profile.username}</p>
          {profile.bio && <p className="profile-card__bio">{profile.bio}</p>}
          <p className="profile-card__since">عضو منذ {formatDate(profile.createdAt, { dateStyle: 'long' })}</p>
        </div>
        <div className="profile-card__share">
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            onClick={() => {
              navigator.clipboard?.writeText(window.location.href);
            }}
          >
            نسخ الرابط
          </button>
        </div>
      </header>

      {isSelf ? (
        <div className="self-note">
          <Alert type="info" title="هذه صفحتك">
            هذا بالضبط ما يراه الآخرون عند فتح رابطك. يمكنك تعديل الاسم والنبذة والصورة من{' '}
            <Link to="/settings">الإعدادات</Link>.
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
    </div>
  );
}
