import { useCallback, useEffect, useMemo, useState } from 'react';
import { messagesApi, ApiError } from '../lib/api.js';
import { categoryOf, harmMeta, identityClueOf, sentimentOf } from '../lib/feedback.js';
import { relativeTime } from '../lib/format.js';
import { useAuth } from '../lib/auth.jsx';
import { useToast } from '../components/Toast.jsx';
import Spinner from '../components/Spinner.jsx';
import Alert from '../components/Alert.jsx';
import EmptyState from '../components/EmptyState.jsx';
import ReportModal from '../components/ReportModal.jsx';
import GoalModal from '../components/GoalModal.jsx';
import StoryCardModal from '../components/StoryCardModal.jsx';
import AudioPlayer from '../components/AudioPlayer.jsx';

const TABS = [
  { key: 'inbox', label: '📥 كل الوارد', filter: { isArchived: false } },
  { key: 'unread', label: '✨ غير مقروءة', filter: { isRead: false, isArchived: false } },
  { key: 'goals', label: '🎯 أهداف مرتبطة', filter: { isArchived: false } },
  { key: 'archived', label: '📦 المؤرشفة', filter: { isArchived: true } },
];

/**
 * Why a message was held, in the owner's own words.
 */
const HarmNotice = ({ message }) => {
  const meta = harmMeta(message.harmLabel);
  if (!meta) return null;

  return (
    <div className="harm-notice">
      <span className="harm-notice__icon" aria-hidden="true">
        {meta.icon}
      </span>
      <span className="harm-notice__label">{meta.label}</span>
    </div>
  );
};

function MessageItem({ message, onChanged, onReport, onGoal, onStory, showCategory = true }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  // Reply drawer state
  const [replyOpen, setReplyOpen] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [isPublicReply, setIsPublicReply] = useState(true);
  const [sendingReply, setSendingReply] = useState(false);

  const act = async (fn, successMsg) => {
    setBusy(true);
    try {
      await fn();
      onChanged();
      if (successMsg) toast.success(successMsg);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  const copyText = async () => {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      toast.success('تم نسخ نص الرسالة!');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('تعذر النسخ');
    }
  };

  const submitReply = async (e) => {
    e.preventDefault();
    const val = replyText.trim();
    if (!val) return;

    setSendingReply(true);
    try {
      await messagesApi.reply(message._id, { content: val, isPublic: isPublicReply });
      toast.success('تم إرسال ردك إلى المحادثة وحفظه بنجاح!');
      setReplyText('');
      setReplyOpen(false);
      onChanged();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSendingReply(false);
    }
  };

  const category = categoryOf(message.category);
  const clue = identityClueOf(message.identityClue);
  const sentiment = sentimentOf(message.sentiment);

  return (
    <article className={`msg${message.isRead ? ' msg--read' : ' msg--unread'}`}>
      <div className="msg__head">
        <span className={`msg__badge${message.isRead ? '' : ' msg__badge--new'}`}>
          {message.isRead ? 'مقروءة' : 'جديدة'}
        </span>

        {/* Identity Clue Badge */}
        {message.identityClue && message.identityClue !== 'none' && (
          <span
            className="msg__clue-badge"
            style={{ borderColor: clue.color, color: clue.color }}
            title="تلميح هوية من صاحب الرسالة"
          >
            {clue.icon} {clue.label}
          </span>
        )}

        {/* Sentiment Badge */}
        {message.sentiment && message.sentiment !== 'neutral' && (
          <span
            className="msg__sentiment-badge"
            style={{ color: sentiment.color }}
            title="تحليل مشاعر الملاحظة"
          >
            {sentiment.icon} {sentiment.label}
          </span>
        )}

        {showCategory && (
          <span className="msg__category">
            <span aria-hidden="true">{category.icon}</span> {category.label}
          </span>
        )}

        <time className="msg__time" dateTime={message.createdAt}>
          {relativeTime(message.createdAt)}
        </time>

        {message.isArchived && <span className="msg__tag">مؤرشفة</span>}
        {message.goal && <span className="msg__tag msg__tag--goal">🎯 مرتبطة بهدف</span>}
        {message.publicReply && <span className="msg__tag msg__tag--replied">💬 تم الرد</span>}
      </div>

      <HarmNotice message={message} />

      <p className={`msg__body${expanded ? '' : ' msg__body--clamp'}`}>{message.content}</p>

      {/* Voice Memo Player */}
      {message.voiceUrl && (
        <div className="msg__voice-box">
          <AudioPlayer src={message.voiceUrl} title="رسالة صوتية مجهولة" />
        </div>
      )}

      {message.content.length > 220 && (
        <button type="button" className="linklike" onClick={() => setExpanded((v) => !v)}>
          {expanded ? 'طيّ النص' : 'عرض الكل'}
        </button>
      )}

      {/* Conversation Thread History */}
      {message.replies && message.replies.length > 0 && (
        <div className="msg__thread-preview">
          <div className="msg__thread-preview-title">
            <span>💬 محادثة الرسالة ({message.replies.length})</span>
          </div>
          <div className="msg__thread-bubbles">
            {message.replies.map((r, idx) => (
              <div
                key={idx}
                className={`msg__thread-bubble ${
                  r.authorType === 'recipient' ? 'msg__thread-bubble--me' : 'msg__thread-bubble--sender'
                }`}
              >
                <div className="msg__thread-bubble-meta">
                  <span>{r.authorType === 'recipient' ? '👑 ردك' : '🎭 المرسل المجهول'}</span>
                  <time>{relativeTime(r.createdAt)}</time>
                </div>
                <p>{r.content}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Reply Composer Drawer */}
      {replyOpen && (
        <form className="msg__reply-drawer" onSubmit={submitReply}>
          <label className="field__label">
            الرد على هذه الرسالة (سيظهر للمرسل المجهول في محادثته):
          </label>
          <textarea
            className="composer__input"
            rows={2}
            value={replyText}
            onChange={(e) => setReplyText(e.target.value.slice(0, 1000))}
            placeholder="اكتب ردك هنا… يمكنك أيضًا اعتماده لبطاقة الستوري"
            maxLength={1000}
            required
          />
          <div className="msg__reply-drawer-footer">
            <label className="msg__reply-checkbox">
              <input
                type="checkbox"
                checked={isPublicReply}
                onChange={(e) => setIsPublicReply(e.target.checked)}
              />
              <span>تثبيت كرد عام في بطاقة الستوري 📸</span>
            </label>
            <div className="msg__reply-drawer-actions">
              <button
                type="button"
                className="btn btn--ghost btn--sm"
                onClick={() => setReplyOpen(false)}
              >
                إلغاء
              </button>
              <button
                type="submit"
                className="btn btn--primary btn--sm"
                disabled={sendingReply || !replyText.trim()}
              >
                {sendingReply ? 'جارٍ الإرسال…' : 'إرسال الرد 💬'}
              </button>
            </div>
          </div>
        </form>
      )}

      <div className="msg__actions">
        {/* Quick Copy */}
        <button
          type="button"
          className={`btn btn--ghost btn--sm ${copied ? 'btn--ok' : ''}`}
          onClick={copyText}
          title="نسخ نص الرسالة"
        >
          {copied ? '✓ نُسخ' : '📋 نسخ'}
        </button>

        {/* Reply Toggle */}
        <button
          type="button"
          className={`btn btn--ghost btn--sm ${replyOpen ? 'btn--active' : ''}`}
          onClick={() => setReplyOpen((v) => !v)}
          title="الرد على المرسل أو فتح محادثة"
        >
          💬 {message.replies?.length ? 'المحادثة والرد' : 'الرد على الرسالة'}
        </button>

        {/* Story Card Share */}
        <button
          type="button"
          className="btn btn--ghost btn--sm btn--story"
          onClick={() => onStory(message)}
          title="مشاركة كبطاقة ستوري جميلة مع ردك"
        >
          📸 بطاقة ستوري
        </button>

        {!message.isRead && (
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            disabled={busy}
            onClick={() => act(() => messagesApi.markRead(message._id), 'تم تعليمها كمقروءة')}
          >
            تعليم كمقروءة
          </button>
        )}

        {!message.goal && (
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            disabled={busy}
            onClick={() => onGoal(message)}
          >
            حوّلها إلى هدف
          </button>
        )}

        <button
          type="button"
          className="btn btn--ghost btn--sm"
          disabled={busy}
          onClick={() =>
            act(
              () => messagesApi.archive(message._id, !message.isArchived),
              message.isArchived ? 'أُخرجت من الأرشيف' : 'تمت الأرشفة',
            )
          }
        >
          {message.isArchived ? 'إلغاء الأرشفة' : 'أرشفة'}
        </button>

        <button
          type="button"
          className="btn btn--ghost btn--sm btn--danger-ghost"
          disabled={busy}
          onClick={() => {
            if (window.confirm('حذف هذه الرسالة نهائيًا من عرضك؟')) {
              act(() => messagesApi.remove(message._id), 'تم الحذف');
            }
          }}
        >
          حذف
        </button>

        <button
          type="button"
          className="btn btn--ghost btn--sm btn--danger-ghost"
          disabled={busy}
          onClick={() => onReport(message._id)}
        >
          إبلاغ
        </button>
      </div>
    </article>
  );
}

/**
 * The "held for you" section.
 */
function QuarantineSection({ onChanged, onReport, onGoal, onStory }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await messagesApi.inbox({ quarantined: true, limit: 50 });
      setItems(data.messages);
    } catch {
      // Handled by empty state
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const release = async (id) => {
    setBusy(true);
    try {
      await messagesApi.release(id);
      await load();
      onChanged();
      toast.success('أُدرجت الرسالة في واردك');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  if (loading || items.length === 0) return null;

  return (
    <section className="quarantine">
      <button
        type="button"
        className="quarantine__toggle"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span>
          <span aria-hidden="true">🛡️</span> رسائل محفوظة لك:{' '}
          <strong>{items.length}</strong>
        </span>
        <span className="quarantine__caret" aria-hidden="true">
          {open ? '▲' : '▼'}
        </span>
      </button>

      <p className="quarantine__note">
        صنّفها النظام على أنها قد تكون موجّهة للشخص. هذا ليس حكمًا نهائيًا — لك وحدك قرار قراءتها أو إدراجها.
      </p>

      {open && (
        <div className="msg-list">
          {items.map((m) => (
            <div key={m._id} className="quarantine__item">
              <MessageItem
                message={m}
                onChanged={load}
                onReport={onReport}
                onGoal={onGoal}
                onStory={onStory}
                showCategory={false}
              />
              <div className="quarantine__actions">
                <button
                  type="button"
                  className="btn btn--outline btn--sm"
                  disabled={busy}
                  onClick={() => release(m._id)}
                >
                  أدرجها في وردي
                </button>
                <button
                  type="button"
                  className="btn btn--ghost btn--sm btn--danger-ghost"
                  disabled={busy}
                  onClick={() => {
                    if (window.confirm('حذف هذه الرسالة نهائيًا؟')) {
                      (async () => {
                        setBusy(true);
                        try {
                          await messagesApi.remove(m._id);
                          await load();
                          onChanged();
                          toast.success('تم الحذف');
                        } catch (err) {
                          toast.error(err.message);
                        } finally {
                          setBusy(false);
                        }
                      })();
                    }
                  }}
                >
                  حذف
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

const toArabicDigits = (num) => {
  if (num === null || num === undefined) return '٠';
  return String(num).replace(/[0-9]/g, (d) => '٠١٢٣٤٥٦٧٨٩'[d]);
};

export default function Inbox() {
  const { user } = useAuth();
  const [tab, setTab] = useState('inbox');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [sentimentFilter, setSentimentFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [items, setItems] = useState([]);
  const [cursor, setCursor] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(null);
  const [reportId, setReportId] = useState(null);
  const [goalSource, setGoalSource] = useState(null);
  const [storyMessage, setStoryMessage] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [inboxCounts, setInboxCounts] = useState({ total: 0, unread: 0, quarantined: 0 });

  const activeTab = TABS.find((t) => t.key === tab) || TABS[0];

  const reload = useCallback(() => setRefreshKey((k) => k + 1), []);

  const fetchCounts = useCallback(async () => {
    try {
      const res = await messagesApi.counts();
      const counts = res.data?.counts || { total: 0, unread: 0, quarantined: 0 };
      setInboxCounts(counts);
      window.dispatchEvent(new CustomEvent('sarhny:counts_updated', { detail: counts }));
    } catch {
      // ignore
    }
  }, []);

  const load = useCallback(
    async (appendCursor = null) => {
      if (appendCursor) setLoadingMore(true);
      else setLoading(true);
      setError(null);
      try {
        const { data } = await messagesApi.inbox({
          ...activeTab.filter,
          ...(categoryFilter ? { category: categoryFilter } : {}),
          cursor: appendCursor,
        });
        setItems((prev) => (appendCursor ? [...prev, ...data.messages] : data.messages));
        setCursor(data.pagination.nextCursor);
        setHasMore(Boolean(data.pagination.hasMore));
        await fetchCounts();
      } catch (err) {
        if (!(err instanceof ApiError && err.status === 401)) setError(err.message);
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [activeTab, categoryFilter, refreshKey, fetchCounts],
  );

  useEffect(() => {
    setItems([]);
    setCursor(null);
    load();
  }, [load]);

  // Real-time listener for incoming messages to live-update the list
  useEffect(() => {
    const handleLiveMessage = (e) => {
      const msg = e.detail;
      if (!msg) return;

      // Direct message payload
      if (msg._id && (!msg.type || msg.type === 'message')) {
        setItems((prev) => {
          if (prev.some((m) => m._id === msg._id)) return prev;
          return [msg, ...prev];
        });
      }
      fetchCounts();
    };

    window.addEventListener('sarhny:new_message', handleLiveMessage);
    fetchCounts();
    return () => {
      window.removeEventListener('sarhny:new_message', handleLiveMessage);
    };
  }, [fetchCounts]);

  const sentimentStats = useMemo(() => {
    const stats = { positive: 0, constructive: 0, question: 0 };
    for (const m of items) {
      if (m.sentiment === 'positive') stats.positive += 1;
      else if (m.sentiment === 'constructive') stats.constructive += 1;
      else if (m.sentiment === 'question') stats.question += 1;
    }
    return stats;
  }, [items]);

  // Filter items if searching or if "goals" or sentiment tab is active
  const filteredItems = useMemo(() => {
    let result = items;
    if (tab === 'goals') {
      result = result.filter((m) => Boolean(m.goal));
    }
    if (sentimentFilter) {
      result = result.filter((m) => m.sentiment === sentimentFilter);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      result = result.filter((m) => m.content?.toLowerCase().includes(q));
    }
    return result;
  }, [items, tab, sentimentFilter, searchQuery]);

  const grouped = useMemo(() => {
    const map = new Map();
    for (const m of filteredItems) {
      const key = m.category || 'general';
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(m);
    }
    return [...map.entries()].sort((a, b) => b[1].length - a[1].length);
  }, [filteredItems]);

  return (
    <div className="page page--inbox">
      <header className="page__head">
        <div>
          <h1>صندوق الوارد</h1>
          <p className="muted">رسائلك الصريحة المجهولة في مكان آمن ومنظّم.</p>
        </div>
        <div className="tabs" role="tablist">
          {TABS.map((t) => {
            const countLabel =
              t.key === 'unread' && inboxCounts.unread > 0
                ? ` (${toArabicDigits(inboxCounts.unread)})`
                : '';
            return (
              <button
                key={t.key}
                type="button"
                role="tab"
                aria-selected={tab === t.key}
                className={`tab${tab === t.key ? ' tab--active' : ''}`}
                onClick={() => {
                  setTab(t.key);
                  setSearchQuery('');
                  setSentimentFilter('');
                }}
              >
                {t.label}
                {countLabel}
              </button>
            );
          })}
        </div>
      </header>

      {/* Unread Messages Arrival Banner */}
      {inboxCounts.unread > 0 && tab !== 'unread' && (
        <div className="inbox-alert-banner">
          <div className="inbox-alert-banner__content">
            <span className="inbox-alert-banner__badge">🔔 تنبيه الوارد</span>
            <span className="inbox-alert-banner__text">
              لديك <strong>{toArabicDigits(inboxCounts.unread)}</strong>{' '}
              {inboxCounts.unread === 1 ? 'رسالة جديدة غير مقروءة' : 'رسائل جديدة غير مقروءة'} بانتظار اطلاعك!
            </span>
          </div>
          <button
            type="button"
            className="btn btn--sm btn--primary"
            onClick={() => {
              setTab('unread');
              setSearchQuery('');
              setSentimentFilter('');
            }}
          >
            عرض غير المقروءة الآن ✨
          </button>
        </div>
      )}

      {/* Search and Quick Filter Bar */}
      <div className="inbox-search-bar">
        <div className="inbox-search-input-wrap">
          <span className="inbox-search-icon" aria-hidden="true">
            🔍
          </span>
          <input
            type="text"
            className="inbox-search-input"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="ابحث في نص الرسائل…"
          />
          {searchQuery && (
            <button
              type="button"
              className="inbox-search-clear"
              onClick={() => setSearchQuery('')}
              aria-label="مسح البحث"
            >
              ×
            </button>
          )}
        </div>
        <span className="inbox-count-badge">
          {filteredItems.length} {filteredItems.length === 1 ? 'رسالة' : 'رسائل'}
        </span>
      </div>

      {/* Sentiment Pulse (AI Insights Bar) */}
      {(sentimentStats.positive > 0 || sentimentStats.constructive > 0 || sentimentStats.question > 0) && (
        <div className="sentiment-pulse-bar">
          <span className="sentiment-pulse-title">⚡ نبض المشاعر:</span>
          <button
            type="button"
            className={`sentiment-chip ${sentimentFilter === 'positive' ? 'sentiment-chip--active' : ''}`}
            onClick={() => setSentimentFilter(sentimentFilter === 'positive' ? '' : 'positive')}
          >
            <span>💖 إيجابية</span>
            <strong>{sentimentStats.positive}</strong>
          </button>
          <button
            type="button"
            className={`sentiment-chip ${sentimentFilter === 'constructive' ? 'sentiment-chip--active' : ''}`}
            onClick={() => setSentimentFilter(sentimentFilter === 'constructive' ? '' : 'constructive')}
          >
            <span>💡 نصح وتطوير</span>
            <strong>{sentimentStats.constructive}</strong>
          </button>
          <button
            type="button"
            className={`sentiment-chip ${sentimentFilter === 'question' ? 'sentiment-chip--active' : ''}`}
            onClick={() => setSentimentFilter(sentimentFilter === 'question' ? '' : 'question')}
          >
            <span>❓ أسئلة</span>
            <strong>{sentimentStats.question}</strong>
          </button>
          {sentimentFilter && (
            <button
              type="button"
              className="sentiment-chip-clear"
              onClick={() => setSentimentFilter('')}
            >
              عرض الكل ×
            </button>
          )}
        </div>
      )}

      <QuarantineSection
        onChanged={reload}
        onReport={setReportId}
        onGoal={setGoalSource}
        onStory={setStoryMessage}
      />

      {tab === 'inbox' && grouped.length > 1 && !categoryFilter && !searchQuery && (
        <div className="cat-filter" role="group" aria-label="تصفية حسب النوع">
          <button
            type="button"
            className="toggle-chip toggle-chip--active"
            onClick={() => setCategoryFilter('')}
          >
            الكل
          </button>
          {grouped.map(([key, list]) => (
            <button
              key={key}
              type="button"
              className="toggle-chip"
              onClick={() => setCategoryFilter(key)}
            >
              {categoryOf(key).icon} {categoryOf(key).label} · {list.length}
            </button>
          ))}
        </div>
      )}

      {categoryFilter && (
        <div className="cat-filter cat-filter--active">
          <span>
            مُصفّاة حسب: {categoryOf(categoryFilter).icon} {categoryOf(categoryFilter).label}
          </span>
          <button type="button" className="linklike" onClick={() => setCategoryFilter('')}>
            إزالة التصفية
          </button>
        </div>
      )}

      {loading ? (
        <Spinner label="جارٍ تحميل الرسائل…" />
      ) : error ? (
        <Alert type="error">{error}</Alert>
      ) : filteredItems.length === 0 ? (
        <EmptyState
          icon={
            searchQuery
              ? '🔎'
              : tab === 'archived'
              ? '📦'
              : tab === 'goals'
              ? '🎯'
              : categoryFilter
              ? '🔍'
              : '📭'
          }
          title={
            searchQuery
              ? 'لم يتم العثور على نتائج مطابقة'
              : tab === 'archived'
              ? 'لا توجد رسائل مؤرشفة'
              : tab === 'goals'
              ? 'لا توجد رسائل مرتبطة بأهداف بعد'
              : categoryFilter
              ? 'لا ملاحظات من هذا النوع'
              : 'صندوق الوارد فارغ حاليًا'
          }
        >
          {searchQuery
            ? 'جرّب البحث بكلمة أخرى أو امسح البحث.'
            : tab === 'archived'
            ? 'الرسائل التي تؤرشفها تظهر هنا للرجوع إليها في أي وقت.'
            : tab === 'goals'
            ? 'يمكنك تحويل أي رسالة إلى هدف لتتبّع تنفيذها عبر زر (حوّلها إلى هدف).'
            : categoryFilter
            ? 'جرّب إزالة التصفية لرؤية باقي الملاحظات.'
            : 'شارك رابط صفحتك الشخصية على حساباتك لتصلك مصارحات سرية.'}
        </EmptyState>
      ) : (
        <>
          {tab === 'inbox' && !categoryFilter && !searchQuery ? (
            grouped.map(([key, list]) => (
              <section key={key} className="msg-group">
                <h2 className="msg-group__title">
                  <span aria-hidden="true">{categoryOf(key).icon}</span> {categoryOf(key).label}
                  <span className="msg-group__count">{list.length}</span>
                </h2>
                <div className="msg-list">
                  {list.map((m) => (
                    <MessageItem
                      key={m._id}
                      message={m}
                      onChanged={reload}
                      onReport={setReportId}
                      onGoal={setGoalSource}
                      onStory={setStoryMessage}
                      showCategory={false}
                    />
                  ))}
                </div>
              </section>
            ))
          ) : (
            <div className="msg-list">
              {filteredItems.map((m) => (
                <MessageItem
                  key={m._id}
                  message={m}
                  onChanged={reload}
                  onReport={setReportId}
                  onGoal={setGoalSource}
                  onStory={setStoryMessage}
                />
              ))}
            </div>
          )}

          {hasMore && !searchQuery && tab !== 'goals' && (
            <div className="load-more">
              <button
                type="button"
                className="btn btn--outline"
                disabled={loadingMore}
                onClick={() => load(cursor)}
              >
                {loadingMore ? 'جارٍ التحميل…' : 'تحميل المزيد'}
              </button>
            </div>
          )}
        </>
      )}

      {/* Modals */}
      <ReportModal open={Boolean(reportId)} onClose={() => setReportId(null)} messageId={reportId} />

      <GoalModal
        open={Boolean(goalSource)}
        message={goalSource}
        onClose={() => {
          setGoalSource(null);
          reload();
        }}
      />

      <StoryCardModal
        open={Boolean(storyMessage)}
        onClose={() => setStoryMessage(null)}
        message={storyMessage}
        username={user?.username}
      />
    </div>
  );
}
