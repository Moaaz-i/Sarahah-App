import { useCallback, useEffect, useMemo, useState } from 'react';
import { messagesApi, goalsApi, ApiError } from '../lib/api.js';
import { CATEGORIES, categoryOf, harmMeta } from '../lib/feedback.js';
import { relativeTime } from '../lib/format.js';
import { useToast } from '../components/Toast.jsx';
import Spinner from '../components/Spinner.jsx';
import Alert from '../components/Alert.jsx';
import EmptyState from '../components/EmptyState.jsx';
import ReportModal from '../components/ReportModal.jsx';
import GoalModal from '../components/GoalModal.jsx';

const TABS = [
  { key: 'inbox', label: 'الوارد', filter: { isArchived: false } },
  { key: 'unread', label: 'غير مقروءة', filter: { isRead: false, isArchived: false } },
  { key: 'archived', label: 'المؤرشفة', filter: { isArchived: true } },
];

/**
 * Why a message was held, in the owner's own words.
 * The shield reports evidence, so the explanation names what matched rather
 * than pretending to know what the sender meant.
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

function MessageItem({ message, onChanged, onReport, onGoal, showCategory = true }) {
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

  const category = categoryOf(message.category);

  return (
    <article className={`msg${message.isRead ? ' msg--read' : ' msg--unread'}`}>
      <div className="msg__head">
        <span className={`msg__badge${message.isRead ? '' : ' msg__badge--new'}`}>
          {message.isRead ? 'مقروءة' : 'جديدة'}
        </span>
        {showCategory && (
          <span className="msg__category">
            <span aria-hidden="true">{category.icon}</span> {category.label}
          </span>
        )}
        <time className="msg__time" dateTime={message.createdAt}>
          {relativeTime(message.createdAt)}
        </time>
        {message.isArchived && <span className="msg__tag">مؤرشفة</span>}
      </div>

      <HarmNotice message={message} />

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

        {/* The whole point of the mirror: turn a note into something you do. */}
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
        {message.goal && <span className="msg__tag msg__tag--goal">🎯 لها هدف</span>}

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
 *
 * Deliberately separate from the inbox rather than a filter on it: a flagged
 * note should never be something the owner stumbles into. Releasing it is an
 * explicit act, and the label stays attached afterwards so the owner still
 * knows why it was held.
 */
function QuarantineSection({ onChanged, onReport, onGoal }) {
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
      // Handled by the empty state; the section is optional by design.
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
        صنّفها النظام على أنها قد تكون موجّهة للشخص. هذا ليس حكمًا نهائيًا — لك وحدك قرار
        قراءتها أو إدراجها.
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

export default function Inbox() {
  const [tab, setTab] = useState('inbox');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [items, setItems] = useState([]);
  const [cursor, setCursor] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(null);
  const [reportId, setReportId] = useState(null);
  /** The message currently being turned into a goal, if any. */
  const [goalSource, setGoalSource] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const activeTab = TABS.find((t) => t.key === tab);

  const reload = useCallback(() => setRefreshKey((k) => k + 1), []);

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
      } catch (err) {
        if (!(err instanceof ApiError && err.status === 401)) setError(err.message);
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [activeTab, categoryFilter, refreshKey],
  );

  useEffect(() => {
    setItems([]);
    setCursor(null);
    load();
  }, [load]);

  /**
   * Group by category rather than presenting one flat pile. The categories the
   * owner actually has are derived from the loaded page, so the filter never
   * offers a bucket that would come back empty.
   */
  const grouped = useMemo(() => {
    const map = new Map();
    for (const m of items) {
      const key = m.category || 'general';
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(m);
    }
    return [...map.entries()].sort((a, b) => b[1].length - a[1].length);
  }, [items]);

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

      <QuarantineSection onChanged={reload} onReport={setReportId} onGoal={setGoalSource} />

      {tab === 'inbox' && grouped.length > 1 && !categoryFilter && (
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
      ) : items.length === 0 ? (
        <EmptyState
          icon={tab === 'archived' ? '📦' : categoryFilter ? '🔍' : '📭'}
          title={
            tab === 'archived'
              ? 'لا رسائل مؤرشفة'
              : categoryFilter
                ? 'لا ملاحظات من هذا النوع'
                : 'لا رسائل بعد'
          }
        >
          {tab === 'archived'
            ? 'ستظهر هنا الرسائل التي تؤرشفها.'
            : categoryFilter
              ? 'جرّب إزالة التصفية لرؤية بقية ملاحظاتك.'
              : 'شارك رابط صفحتك ليبدأ الناس بالإرسال.'}
        </EmptyState>
      ) : (
        <>
          {tab === 'inbox' && !categoryFilter ? (
            grouped.map(([key, list]) => (
              <section key={key} className="msg-group">
                <h2 className="msg-group__title">
                  <span aria-hidden="true">{categoryOf(key).icon}</span>{' '}
                  {categoryOf(key).label}
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
                      showCategory={false}
                    />
                  ))}
                </div>
              </section>
            ))
          ) : (
            <div className="msg-list">
              {items.map((m) => (
                <MessageItem
                  key={m._id}
                  message={m}
                  onChanged={reload}
                  onReport={setReportId}
                  onGoal={setGoalSource}
                />
              ))}
            </div>
          )}

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

      <GoalModal
        open={Boolean(goalSource)}
        message={goalSource}
        onClose={() => {
          setGoalSource(null);
          reload();
        }}
      />
    </div>
  );
}
