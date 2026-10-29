import { useMemo, useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import { messagesApi, ApiError } from '../lib/api.js';
import { CATEGORIES, categoryOf, IDENTITY_CLUES, identityClueOf } from '../lib/feedback.js';
import { useToast } from './Toast.jsx';
import Alert from './Alert.jsx';
import AudioPlayer from './AudioPlayer.jsx';

const MAX = 2000;

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

const RISKY = ['غبي', 'غبية', 'تافه', 'حقير', 'واطي', 'أناني', 'مغرور', 'كسمك', 'اخرس', 'شكلك وحش'];

const hasRiskyLanguage = (text) => {
  const t = normalize(text);
  return RISKY.some((word) => t.includes(normalize(word)));
};

export default function SendMessageForm({
  username,
  displayName,
  compact = false,
  policy = null,
}) {
  const toast = useToast();
  const [content, setContent] = useState('');
  const [category, setCategory] = useState(null);
  const [identityClue, setIdentityClue] = useState('none');
  const [promptId, setPromptId] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [sent, setSent] = useState(false);
  const [conversationKey, setConversationKey] = useState(null);
  const [copiedKey, setCopiedKey] = useState(false);
  const [nudgeDismissed, setNudgeDismissed] = useState(false);

  // Voice note state
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [audioUrl, setAudioUrl] = useState(null);
  const mediaRecorderRef = useRef(null);
  const timerRef = useRef(null);
  const audioChunksRef = useRef([]);

  const remaining = MAX - content.length;

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

  const showNudge = useMemo(
    () => content.trim().length >= 8 && hasRiskyLanguage(content) && !nudgeDismissed,
    [content, nudgeDismissed],
  );

  const requireCategory = Boolean(policy?.requireCategory) && !category;

  // Voice recording handlers
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];

      let mimeType = 'audio/webm';
      if (typeof MediaRecorder.isTypeSupported === 'function') {
        if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
          mimeType = 'audio/webm;codecs=opus';
        } else if (MediaRecorder.isTypeSupported('audio/ogg;codecs=opus')) {
          mimeType = 'audio/ogg;codecs=opus';
        } else if (MediaRecorder.isTypeSupported('audio/mp4')) {
          mimeType = 'audio/mp4';
        }
      }

      let recorder;
      try {
        recorder = new MediaRecorder(stream, { mimeType, audioBitsPerSecond: 32000 });
      } catch {
        recorder = new MediaRecorder(stream);
      }
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: recorder.mimeType || mimeType });
        const reader = new FileReader();
        reader.onloadend = () => {
          setAudioUrl(reader.result);
        };
        reader.readAsDataURL(blob);
        stream.getTracks().forEach((track) => track.stop());
      };

      recorder.start();
      setIsRecording(true);
      setRecordingSeconds(0);
      timerRef.current = setInterval(() => {
        setRecordingSeconds((sec) => {
          if (sec >= 30) {
            stopRecording();
            return 30;
          }
          return sec + 1;
        });
      }, 1000);
    } catch {
      toast.error('تعذر الوصول إلى الميكروفون. يرجى السماح بالإذن.');
    }
  };

  const stopRecording = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
  };

  const cancelRecording = () => {
    stopRecording();
    setAudioUrl(null);
    setRecordingSeconds(0);
  };

  const submit = async (e) => {
    e.preventDefault();
    const value = content.trim();
    if (!value && !audioUrl) return;

    setBusy(true);
    setError(null);
    try {
      const res = await messagesApi.send(username, {
        content: value || '🎙️ (رسالة صوتية سرية)',
        ...(category ? { category } : {}),
        ...(identityClue !== 'none' ? { identityClue } : {}),
        ...(promptId ? { promptId } : {}),
        ...(audioUrl ? { voiceUrl: audioUrl } : {}),
      });

      const returnedKey = res.data?.conversationKey;
      setConversationKey(returnedKey);
      setSent(true);

      // Save to local sent threads history
      if (returnedKey) {
        try {
          const list = JSON.parse(localStorage.getItem('sarhny_sent_threads') || '[]');
          list.unshift({
            key: returnedKey,
            recipient: username,
            displayName: displayName || username,
            snippet: value ? value.slice(0, 50) : 'رسالة صوتية',
            createdAt: new Date().toISOString(),
          });
          localStorage.setItem('sarhny_sent_threads', JSON.stringify(list.slice(0, 30)));
        } catch {
          /* ignore storage issues */
        }
      }

      setContent('');
      setCategory(null);
      setIdentityClue('none');
      setPromptId(null);
      setAudioUrl(null);
      toast.success('أُرسلت رسالتك من دون اسم بنجاح!');
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

  const copyThreadLink = async () => {
    if (!conversationKey) return;
    const url = `${window.location.origin}/thread/${conversationKey}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopiedKey(true);
      toast.success('تم نسخ رابط المحادثة السرية!');
      setTimeout(() => setCopiedKey(false), 2000);
    } catch {
      toast.error('تعذر النسخ');
    }
  };

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
    const threadUrl = conversationKey ? `/thread/${conversationKey}` : null;
    return (
      <div className="sent-card">
        <div className="sent-card__icon" aria-hidden="true">
          ✓
        </div>
        <h3>تم الإرسال بسرية تامة!</h3>
        <p>
          وصلت رسالتك إلى <strong>{displayName || `@${username}`}</strong> دون كشف هويتك.
        </p>

        {conversationKey && (
          <div className="thread-invite-box">
            <div className="thread-invite-box__badge">💬 ميزة حصرية: الرد الثنائي السري</div>
            <p className="thread-invite-box__desc">
              إذا قام صاحب الحساب بالرد عليك، يمكنك متابعة الرد والتحاور معه وأنت مجهول تمامًا!
            </p>
            <div className="thread-invite-box__actions">
              <Link to={threadUrl} className="btn btn--primary btn--sm">
                💬 فتح صفحة المحادثة
              </Link>
              <button
                type="button"
                className={`btn btn--sm ${copiedKey ? 'btn--ok' : 'btn--outline'}`}
                onClick={copyThreadLink}
              >
                {copiedKey ? '✓ تم نسخ الرابط' : '📋 نسخ رابط المحادثة'}
              </button>
            </div>
            <p className="thread-invite-box__hint">
              تم حفظ الرابط في جهازك أيضًا لسهولة الرجوع إليه في أي وقت.
            </p>
          </div>
        )}

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
          <legend className="field__label">أجب عن سؤال موجه (اختياري)</legend>
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

      {/* Identity Clue Picker */}
      <fieldset className="clue-picker">
        <legend className="field__label">
          <span>🎭 تلميح الهوية (اختياري)</span>
          <span className="clue-picker__sub">يعطي سياقًا للرسالة مع الحفاظ على سريتك التامة</span>
        </legend>
        <div className="clue-picker__list">
          {IDENTITY_CLUES.map((clue) => {
            const isSelected = identityClue === clue.key;
            return (
              <button
                key={clue.key}
                type="button"
                className={`clue-chip ${isSelected ? 'clue-chip--active' : ''}`}
                style={isSelected ? { borderColor: clue.color, color: clue.color } : {}}
                onClick={() => setIdentityClue(clue.key)}
              >
                <span>{clue.icon}</span>
                <span>{clue.label}</span>
              </button>
            );
          })}
        </div>
      </fieldset>

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
          if (nudgeDismissed) setNudgeDismissed(false);
        }}
        placeholder={
          activePrompt ? `${activePrompt.text}…` : 'اكتب بصدق وعناية… لن يعرف من أنت أبدًا.'
        }
        rows={compact ? 4 : 5}
        maxLength={MAX}
      />

      {/* Voice Recording Section */}
      <div className="voice-composer">
        {!audioUrl && !isRecording && (
          <button
            type="button"
            className="btn btn--outline btn--sm btn--voice-record"
            onClick={startRecording}
          >
            🎙️ تسجيل رسالة صوتية مجهولة (حتى 30 ثانية)
          </button>
        )}

        {isRecording && (
          <div className="voice-recording-status">
            <span className="pulse-dot" />
            <span>جارٍ التسجيل… <strong>{recordingSeconds}s / 30s</strong></span>
            <button type="button" className="btn btn--primary btn--sm" onClick={stopRecording}>
              ✓ إنهاء وحفظ
            </button>
            <button type="button" className="btn btn--ghost btn--sm" onClick={cancelRecording}>
              إلغاء
            </button>
          </div>
        )}

        {audioUrl && (
          <div className="voice-preview-card">
            <div style={{ width: '100%' }}>
              <AudioPlayer src={audioUrl} title="معاينة التسجيل الصوتي المجهول" />
            </div>
            <button
              type="button"
              className="btn btn--ghost btn--sm btn--danger-ghost"
              onClick={() => setAudioUrl(null)}
            >
              حذف الصوت
            </button>
          </div>
        )}
      </div>

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
          disabled={busy || (!content.trim() && !audioUrl) || requireCategory}
        >
          {busy ? 'جارٍ الإرسال…' : 'إرسال بسرية تامة ✉️'}
        </button>
      </div>

      {requireCategory && !category && (
        <p className="composer__hint">اختر نوع الملاحظة أولًا — صاحب الصفحة طلب ذلك.</p>
      )}

      {error && <Alert type="error">{error}</Alert>}

      <p className="composer__note">
        🔒 لا يُخزَّن أي معرّف لك مع الرسالة (لا اسم، لا بريد، ولا عنوان IP). تلميح الهوية يختاره
        المرسل بنفسه ولا يُمكّن أحدًا من كشفك.
      </p>
    </form>
  );
}
