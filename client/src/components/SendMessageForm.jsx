import { useState } from 'react';
import { messagesApi, ApiError } from '../lib/api.js';
import { useToast } from './Toast.jsx';
import Alert from './Alert.jsx';

const MAX = 2000;

/**
 * The anonymous composer. Deliberately has NO sender field anywhere:
 * the backend stores only (recipient, content) plus a salted rate-limit
 * fingerprint, and returns { sent: true } with no message id.
 */
export default function SendMessageForm({ username, displayName, compact = false }) {
  const toast = useToast();
  const [content, setContent] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [sent, setSent] = useState(false);

  const remaining = MAX - content.length;

  const submit = async (e) => {
    e.preventDefault();
    const value = content.trim();
    if (!value) return;

    setBusy(true);
    setError(null);
    try {
      await messagesApi.send(username, { content: value });
      setSent(true);
      setContent('');
      toast.success('أُرسلت رسالتك من دون اسم');
    } catch (err) {
      if (err instanceof ApiError && err.status === 429) {
        setError('تم بلوغ حد الإرسال لهذا المستخدم اليوم، حاول غدًا.');
      } else if (err instanceof ApiError && err.status === 404) {
        setError('هذا المستخدم غير موجود أو أغلق صندوق رسائله.');
      } else {
        setError(err.message);
      }
    } finally {
      setBusy(false);
    }
  };

  if (sent) {
    return (
      <div className="sent-card">
        <div className="sent-card__icon" aria-hidden="true">
          ✓
        </div>
        <h3>تم الإرسال</h3>
        <p>
          وصلت رسالتك إلى <strong>{displayName || `@${username}`}</strong> من دون إظهار هويتك.
        </p>
        <button type="button" className="btn btn--ghost" onClick={() => setSent(false)}>
          إرسال رسالة أخرى
        </button>
      </div>
    );
  }

  return (
    <form className={`composer${compact ? ' composer--compact' : ''}`} onSubmit={submit}>
      <label className="field__label" htmlFor="composer-content">
        رسالتك إلى {displayName ? <strong>{displayName}</strong> : <strong>@{username}</strong>}
      </label>

      <textarea
        id="composer-content"
        className="composer__input"
        value={content}
        onChange={(e) => setContent(e.target.value.slice(0, MAX))}
        placeholder="اكتب بعُنْية… لن يعرف من أنت أبدًا."
        rows={compact ? 4 : 6}
        maxLength={MAX}
        required
      />

      <div className="composer__meta">
        <span className={remaining < 120 ? 'composer__count composer__count--low' : 'composer__count'}>
          {remaining} حرفًا متبقيًا
        </span>
        <button type="submit" className="btn btn--primary" disabled={busy || !content.trim()}>
          {busy ? 'جارٍ الإرسال…' : 'إرسال من دون اسم'}
        </button>
      </div>

      {error && <Alert type="error">{error}</Alert>}

      <p className="composer__note">
        لا يُخزَّن أي معرّف لك مع الرسالة — لا الاسم، ولا البريد، ولا عنوان IP.
      </p>
    </form>
  );
}
