import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { messagesApi, ApiError } from '../lib/api.js';
import { categoryOf, identityClueOf } from '../lib/feedback.js';
import { relativeTime } from '../lib/format.js';
import Avatar from '../components/Avatar.jsx';
import Spinner from '../components/Spinner.jsx';
import Alert from '../components/Alert.jsx';
import { useToast } from '../components/Toast.jsx';
import { getSocket, joinThreadRoom, leaveThreadRoom } from '../lib/socket.js';
import AudioPlayer from '../components/AudioPlayer.jsx';

export default function Thread() {
  const { conversationKey } = useParams();
  const toast = useToast();
  const [thread, setThread] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [replyText, setReplyText] = useState('');
  const [sending, setSending] = useState(false);
  const [copied, setCopied] = useState(false);

  const fetchThread = async () => {
    try {
      const res = await messagesApi.getThread(conversationKey);
      setThread(res.data.thread);
      setError(null);
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 404
          ? 'المحادثة غير موجودة أو انتهت صلاحيتها.'
          : err.message,
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchThread();

    if (!conversationKey) return;

    const socket = getSocket();
    joinThreadRoom(conversationKey);

    const handleNewReply = (newReply) => {
      setThread((prev) => {
        if (!prev) return prev;
        const replies = prev.replies || [];
        // Avoid duplicate append if already present
        const isDuplicate = replies.some(
          (r) =>
            r.content === newReply.content &&
            r.authorType === newReply.authorType &&
            Math.abs(new Date(r.createdAt) - new Date(newReply.createdAt)) < 3000,
        );
        if (isDuplicate) return prev;
        return {
          ...prev,
          replies: [...replies, newReply],
        };
      });

      toast.info(
        newReply.authorType === 'recipient'
          ? 'رد جديد من المستلم وصل للتو! 💬'
          : 'رد جديد من الطرف المجهول وصل للتو! 🔒',
      );
    };

    socket.on('new_reply', handleNewReply);

    return () => {
      leaveThreadRoom(conversationKey);
      socket.off('new_reply', handleNewReply);
    };
  }, [conversationKey]);

  const handleSendReply = async (e) => {
    e.preventDefault();
    const val = replyText.trim();
    if (!val) return;

    setSending(true);
    try {
      const res = await messagesApi.replyThread(conversationKey, { content: val });
      setThread(res.data.thread);
      setReplyText('');
      toast.success('تم إرسال ردك في المحادثة السرية!');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSending(false);
    }
  };

  const copyUrl = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      toast.success('تم نسخ رابط المحادثة السرية!');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('تعذر النسخ');
    }
  };

  if (loading) return <Spinner label="جارٍ تحميل المحادثة السرية…" />;

  if (error) {
    return (
      <div className="page page--narrow">
        <Alert type="error" title="تعذر فتح المحادثة">
          {error}
        </Alert>
        <p className="muted">
          <Link to="/">العودة إلى الصفحة الرئيسية</Link>
        </p>
      </div>
    );
  }

  const clue = identityClueOf(thread.identityClue);
  const category = categoryOf(thread.category);

  return (
    <div className="page page--thread">
      <header className="thread-header">
        <div className="thread-header__user">
          <Avatar
            src={thread.recipient?.avatar}
            name={thread.recipient?.name}
            username={thread.recipient?.username}
            size={56}
          />
          <div>
            <h2>محادثة صراحة مع {thread.recipient?.name || `@${thread.recipient?.username}`}</h2>
            <p className="muted">@{thread.recipient?.username} · تواصل مجهول ثنائي الاتجاه 🔒</p>
          </div>
        </div>

        <button
          type="button"
          className={`btn btn--sm ${copied ? 'btn--ok' : 'btn--outline'}`}
          onClick={copyUrl}
        >
          {copied ? '✓ نُسخ الرابط' : '🔗 حفظ رابط المحادثة'}
        </button>
      </header>

      {/* Main Message Card */}
      <div className="thread-original-card">
        <div className="thread-original-card__meta">
          <span className="thread-clue-badge" style={{ borderColor: clue.color, color: clue.color }}>
            {clue.icon} {clue.label}
          </span>
          <span className="msg__category">
            {category.icon} {category.label}
          </span>
          <time className="msg__time">{relativeTime(thread.createdAt)}</time>
        </div>

        <div className="thread-original-card__body">
          <p>{thread.content}</p>
          {thread.voiceUrl && (
            <div style={{ marginTop: '1rem' }}>
              <AudioPlayer src={thread.voiceUrl} title="رسالة صوتية مجهولة" />
            </div>
          )}
        </div>
      </div>

      {/* Replies Stream */}
      <section className="thread-chat-stream">
        <h3 className="thread-chat-stream__title">
          <span>💬 سجل الردود والمحادثة</span>
          <span className="thread-chat-count">{thread.replies?.length || 0}</span>
        </h3>

        {(!thread.replies || thread.replies.length === 0) ? (
          <div className="thread-empty-state">
            <span className="thread-empty-icon">⏳</span>
            <p>لم يقم صاحب الحساب بالرد بعد. احتفظ بهذا الرابط للرجوع إليه وتفقد رده في أي وقت!</p>
          </div>
        ) : (
          <div className="thread-bubbles">
            {thread.replies.map((r, idx) => {
              const isOwner = r.authorType === 'recipient';
              return (
                <div
                  key={idx}
                  className={`thread-bubble ${isOwner ? 'thread-bubble--owner' : 'thread-bubble--sender'}`}
                >
                  <div className="thread-bubble__meta">
                    <span className="thread-bubble__author">
                      {isOwner ? `👑 ${thread.recipient?.name || 'صاحب الصفحة'}` : '🎭 ردك المجهول'}
                    </span>
                    <time className="thread-bubble__time">{relativeTime(r.createdAt)}</time>
                  </div>
                  <p className="thread-bubble__text">{r.content}</p>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Reply Box for Anonymous Sender */}
      <form className="thread-reply-composer" onSubmit={handleSendReply}>
        <label className="field__label" htmlFor="thread-reply-input">
          أرسل ردًا إضافيًا لصاحب الصفحة (مجهول تمامًا)
        </label>
        <textarea
          id="thread-reply-input"
          className="composer__input"
          rows={3}
          value={replyText}
          onChange={(e) => setReplyText(e.target.value.slice(0, 1000))}
          placeholder="اكتب ردك هنا… يظل اسمك وهويتك مخفية تمامًا 🔒"
          maxLength={1000}
          required
        />
        <div className="composer__meta">
          <span className="composer__count">{1000 - replyText.length} حرفًا متبقيًا</span>
          <button
            type="submit"
            className="btn btn--primary"
            disabled={sending || !replyText.trim()}
          >
            {sending ? 'جارٍ الإرسال…' : 'إرسال الرد 💬'}
          </button>
        </div>
      </form>
    </div>
  );
}
