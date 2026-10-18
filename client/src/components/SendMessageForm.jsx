import { useMemo, useState } from 'react';
import { messagesApi, ApiError } from '../lib/api.js';
import { CATEGORIES, categoryOf } from '../lib/feedback.js';
import { useToast } from './Toast.jsx';
import Alert from './Alert.jsx';

const MAX = 2000;

/**
 * Arabic normalisation + the same rule families the server uses, so the sender
 * sees the nudge BEFORE sending rather than being told about it afterwards.
 *
 * This is a courtesy preview, not enforcement: the server runs its own screen
 * and is the only authority on whether a note is quarantined. Keeping a copy
 * here costs nothing and lets the sender reconsider while the words are still
 * theirs to change.
 *
 * The full word lists live on the server; only the common cases are mirrored
 * here so the client bundle stays small and nothing sensitive is published.
 */
const INVISIBLE = /[\u200b-\u200f\u202a-\u202e\ufeff]/g;
const DIACTRICS = /[\u0610-\u061a\u064b-\u065f\u0670\u06d6-\u06ed\u0640]/g;

const normalize = (text = '') =>
  String(text)
    .replace(INVISIBLE, '')
    .replace(DIACTRICS, '')
    .replace(/[\u0623\u0625\u0671\u0672\u0673\u0675]/g, '\u0627')
    .replace(/\u0629/g, '\u0647')
    .replace(/\u0649/g, '\u0647')
    .replace(/[\u0624\u0626]/g, '\u0621')
    .toLowerCase();

/** A small shared subset: enough to catch the common cases without bloat. */
const RISKY = ['غبي', 'غبية', 'تافه', 'حقير', 'واطي', 'أناني', 'مغرور', 'كسمك', 'اخرس', 'شكلك وحش'];

const hasRiskyLanguage = (text) => {
  const t = normalize(text);
  return RISKY.some((word) => t.includes(normalize(word)));
};

/**
 * The anonymous composer. Deliberately has NO sender field anywhere:
 * the backend stores only (recipient, content, declared category) plus a
 * salted rate-limit fingerprint, and returns { sent: true } with no message id.
 *
 * The category is the SENDER's declared intent — it is never used to infer
 * anything about them, and it is what lets the recipient's inbox be useful
 * instead of one undifferentiated pile.
 */
export default function SendMessageForm({
  username,
  displayName,
  compact = false,
  /** Reception policy from the public profile, when the server sent one. */
  policy = null,
}) {
  const toast = useToast();
  const [content, setContent] = useState('');
  const [category, setCategory] = useState(null);
  const [promptId, setPromptId] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [sent, setSent] = useState(false);
  /** Set once the sender has seen the nudge, so it does not nag on every key. */
  const [nudgeDismissed, setNudgeDismissed] = useState(false);

  const remaining = MAX - content.length;

  /**
   * The allow-list only constrains when the owner published one. Otherwise the
   * full list is offered — a new user is never silently filtered.
   */
  const visibleCategories = useMemo(() => {
    const allowed = policy?.allowedCategories;
    if (!Array.isArray(allowed) || allowed.length === 0) return CATEGORIES;
    const keys = new Set(allowed.map((c) => c.key));
    return CATEGORIES.filter((c) => keys.has(c.key));
  }, [policy]);

  const prompts = useMemo(
    () => (policy?.prompts ?? []).filter((p) => p.isActive !== false),
    [policy],
  );

  const activePrompt = prompts.find((p) => p.id === promptId) ?? null;

  /** Only warn once the sender has written enough to actually mean something. */
  const showNudge = useMemo(
    () => content.trim().length >= 8 && hasRiskyLanguage(content) && !nudgeDismissed,
    [content, nudgeDismissed],
  );

  const requireCategory = Boolean(policy?.requireCategory) && !category;

  const submit = async (e) => {
    e.preventDefault();
    const value = content.trim();
    if (!value) return;

    setBusy(true);
    setError(null);
    try {
      await messagesApi.send(username, {
        content: value,
        ...(category ? { category } : {}),
        ...(promptId ? { promptId } : {}),
      });
      setSent(true);
      setContent('');
      setCategory(null);
      setPromptId(null);
      toast.success('أُرسلت رسالتك من دون اسم');
    } catch (err) {
      if (err instanceof ApiError && err.status === 429) {
        setError('تم بلوغ حد الإرسال لهذا المستخدم اليوم، حاول غدًا.');
      } else if (err instanceof ApiError && err.status === 404) {
        setError('هذا المستخدم غير موجود أو أغلق صندوق رسائله.');
      } else if (err instanceof ApiError && err.status === 400) {
        setError(err.message);
      } else {
        setError(err.message);
      }
    } finally {
      setBusy(false);
    }
  };

  /** A paused inbox should say so plainly instead of looking like a dead link. */
  if (policy?.isPaused) {
    return (
      <div className="paused-card">
        <div className="paused-card__icon" aria-hidden="true">
          ⏸️
        </div>
        <h3>هذا الصندوق متوقف مؤقتًا</h3>
        <p>
          {policy.pauseReason ||
            'صاحب هذه الصفحة أوقف استقبال الرسائل مؤقتًا. لن تصل رسالتك الآن.'}
        </p>
      </div>
    );
  }

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

      {policy?.policyMessage && <p className="composer__policy">{policy.policyMessage}</p>}

      {prompts.length > 0 && (
        <fieldset className="prompt-picker">
          <legend className="field__label">أجب عن سؤال واحد (اختياري)</legend>
          <div className="prompt-picker__list">
            {prompts.map((p) => (
              <button
                key={p.id}
                type="button"
                className={`toggle-chip${promptId === p.id ? ' toggle-chip--active' : ''}`}
                aria-pressed={promptId === p.id}
                onClick={() => setPromptId(promptId === p.id ? null : p.id)}
              >
                {p.text}
              </button>
            ))}
          </div>
        </fieldset>
      )}

      <fieldset className="category-picker">
        <legend className="field__label">
          ما نوع الملاحظة؟
          {policy?.requireCategory && <span className="req">*</span>}
        </legend>
        <div className="category-picker__grid">
          {visibleCategories.map((c) => {
            const selected = category === c.key;
            return (
              <button
                key={c.key}
                type="button"
                className={`cat-chip${selected ? ' cat-chip--active' : ''}`}
                aria-pressed={selected}
                onClick={() => setCategory(selected ? null : c.key)}
              >
                <span className="cat-chip__icon" aria-hidden="true">
                  {c.icon}
                </span>
                <span className="cat-chip__label">{c.label}</span>
              </button>
            );
          })}
        </div>
        {category && <p className="category-picker__hint">{categoryOf(category).hint}</p>}
      </fieldset>

      <textarea
        id="composer-content"
        className="composer__input"
        value={content}
        onChange={(e) => {
          setContent(e.target.value.slice(0, MAX));
          // A new sentence deserves a fresh chance to warn, not a permanent mute.
          if (nudgeDismissed) setNudgeDismissed(false);
        }}
        placeholder={
          activePrompt ? `${activePrompt.text}…` : 'اكتب بعُنْية… لن يعرف من أنت أبدًا.'
        }
        rows={compact ? 4 : 6}
        maxLength={MAX}
        required
      />

      {showNudge && (
        <div className="nudge" role="status">
          <p className="nudge__title">قد تُقرأ رسالتك على أنها موجّهة للشخص لا للسلوك.</p>
          <p className="nudge__body">
            ركّز على سلوك محدّد يمكن تغييره، وابتعد عن وصف الأشخاص. يمكنك تعديل النص أو إرساله
            كما هو — القرار لك.
          </p>
          <div className="nudge__actions">
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => setNudgeDismissed(true)}>
              سأرسلها كما هي
            </button>
            <button
              type="button"
              className="btn btn--outline btn--sm"
              onClick={() => {
                setNudgeDismissed(true);
                document.getElementById('composer-content')?.focus();
              }}
            >
              سأعيد الصياغة
            </button>
          </div>
        </div>
      )}

      <div className="composer__meta">
        <span className={remaining < 120 ? 'composer__count composer__count--low' : 'composer__count'}>
          {remaining} حرفًا متبقيًا
        </span>
        <button
          type="submit"
          className="btn btn--primary"
          disabled={busy || !content.trim() || requireCategory}
        >
          {busy ? 'جارٍ الإرسال…' : 'إرسال من دون اسم'}
        </button>
      </div>

      {requireCategory && !category && (
        <p className="composer__hint">اختر نوع الملاحظة أولًا — صاحب الصفحة طلب ذلك.</p>
      )}

      {error && <Alert type="error">{error}</Alert>}

      <p className="composer__note">
        لا يُخزَّن أي معرّف لك مع الرسالة — لا الاسم، ولا البريد، ولا عنوان IP. نوع الملاحظة
        الذي تختاره يظهر لصاحب الصفحة، ولا يُستخدم للتعرّف عليك.
      </p>
    </form>
  );
}
