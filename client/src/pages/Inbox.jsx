import { useCallback, useEffect, useState } from 'react';
import { messagesApi, ApiError } from '../lib/api.js';
import { relativeTime } from '../lib/format.js';
import { useToast } from '../components/Toast.jsx';
import Spinner from '../components/Spinner.jsx';
import Alert from '../components/Alert.jsx';
import EmptyState from '../components/EmptyState.jsx';
import ReportModal from '../components/ReportModal.jsx';

const TABS = [
  { key: 'inbox', label: 'الوارد', filter: { isArchived: false } },
  { key: 'unread', label: 'غير مقروءة', filter: { isRead: false, isArchived: false } },
  { key: 'archived', label: 'المؤرشفة', filter: { isArchived: true } },
];

function MessageItem({ message, onChanged, onReport }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState(false);

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

  return (
    <article className={`msg${message.isRead ? ' msg--read' : ' msg--unread'}`}>
      <div className="msg__head">
        <span className={`msg__badge${message.isRead ? '' : ' msg__badge--new'}`}>
          {message.isRead ? 'مقروءة' : 'جديدة'}
        </span>
        <time className="msg__time" dateTime={message.createdAt}>
          {relativeTime(message.createdAt)}
        </time>
        {message.isArchived && <span className="msg__tag">مؤرشفة</span>}
      </div>

      <p className={`msg__body${expanded ? '' : ' msg__body--clamp'}`}>{message.content}</p>

      {message.content.length > 220 && (
        <button type="button" className="linklike" onClick={() => setExpanded((v) => !v)}>
          {expanded ? 'طيّ النص' : 'عرض الكل'}
        </button>
      )}

      <div className="msg__actions">
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

export default function Inbox() {
  const [tab, setTab] = useState('inbox');
  const [items, setItems] = useState([]);
  const [cursor, setCursor] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(null);
  const [reportId, setReportId] = useState(null);

  const activeTab = TABS.find((t) => t.key === tab);

  const load = useCallback(
    async (appendCursor = null) => {
      if (appendCursor) setLoadingMore(true);
      else setLoading(true);
      setError(null);
      try {
        const { data } = await messagesApi.inbox({ ...activeTab.filter, cursor: appendCursor });
        setItems((prev) => (appendCursor ? [...prev, ...data.messages] : data.messages));
        setCursor(data.pagination.nextCursor);
        setHasMore(Boolean(data.pagination.hasMore));
      } catch (err) {
        if (!(err instanceof ApiError && err.status === 401)) setError(err.message);
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [activeTab],
  );

  useEffect(() => {
    setItems([]);
    setCursor(null);
    load();
  }, [load]);

  return (
    <div className="page page--inbox">
      <header className="page__head">
        <div>
          <h1>صندوق الوارد</h1>
          <p className="muted">الرسائل التي وصلتك — من دون أي أثر لمرسلها.</p>
        </div>
        <div className="tabs" role="tablist">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={tab === t.key}
              className={`tab${tab === t.key ? ' tab--active' : ''}`}
              onClick={() => setTab(t.key)}
            >
              {t.label}
            </button>
          ))}
        </div>
      </header>

      {loading ? (
        <Spinner label="جارٍ تحميل الرسائل…" />
      ) : error ? (
        <Alert type="error">{error}</Alert>
      ) : items.length === 0 ? (
        <EmptyState
          icon={tab === 'archived' ? '📦' : '📭'}
          title={tab === 'archived' ? 'لا رسائل مؤرشفة' : 'لا رسائل بعد'}
        >
          {tab === 'archived'
            ? 'ستظهر هنا الرسائل التي تؤرشفها.'
            : 'شارك رابط صفحتك ليبدأ الناس بالإرسال.'}
        </EmptyState>
      ) : (
        <>
          <div className="msg-list">
            {items.map((m) => (
              <MessageItem
                key={m._id}
                message={m}
                onChanged={() => load()}
                onReport={setReportId}
              />
            ))}
          </div>

          {hasMore && (
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

      <ReportModal open={Boolean(reportId)} onClose={() => setReportId(null)} messageId={reportId} />
    </div>
  );
}
