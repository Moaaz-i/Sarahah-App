import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { mirrorApi, goalsApi } from '../lib/api.js';
import { PERIODS, categoryOf, goalStatusOf } from '../lib/feedback.js';
import { relativeTime, formatDate } from '../lib/format.js';
import Spinner from '../components/Spinner.jsx';
import Alert from '../components/Alert.jsx';
import EmptyState from '../components/EmptyState.jsx';
import { useToast } from '../components/Toast.jsx';

/** A single counter. Deliberately plain — the number is the point. */
const Stat = ({ label, value, icon, tone }) => (
  <div className={`stat${tone ? ` stat--${tone}` : ''}`}>
    <span className="stat__icon" aria-hidden="true">
      {icon}
    </span>
    <div>
      <p className="stat__value">{value}</p>
      <p className="stat__label">{label}</p>
    </div>
  </div>
);

function GoalCard({ goal, onChanged }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const status = goalStatusOf(goal.status);

  const act = async (body, msg) => {
    setBusy(true);
    try {
      await goalsApi.update(goal._id, body);
      onChanged();
      if (msg) toast.success(msg);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  const dueSoon = goal.reviewAt && new Date(goal.reviewAt) <= new Date() && goal.status === 'active';

  return (
    <article className={`goal${goal.status === 'done' ? ' goal--done' : ''}`}>
      <header className="goal__head">
        <span className="goal__status">
          <span aria-hidden="true">{status.icon}</span> {status.label}
        </span>
        {dueSoon && <span className="goal__due">حان موعد المراجعة</span>}
      </header>

      <p className="goal__note">{goal.note}</p>
      {goal.action && <p className="goal__action">الإجراء: {goal.action}</p>}

      {goal.reviewAt && (
        <p className="goal__review">
          المراجعة في {formatDate(goal.reviewAt, { dateStyle: 'long' })}
        </p>
      )}

      <div className="goal__rating">
        <span className="goal__rating-label">تقدّمك الشخصي:</span>
        <div className="stars" role="group" aria-label="تقييم تقدمك">
          {[0, 1, 2, 3, 4].map((n) => (
            <button
              key={n}
              type="button"
              className={`star${goal.rating > n ? ' star--on' : ''}`}
              aria-label={`${n + 1} من 5`}
              disabled={busy}
              onClick={() => act({ rating: n + 1 }, 'حُفظ تقييمك')}
            >
              ★
            </button>
          ))}
        </div>
      </div>

      {goal.reflection && <p className="goal__reflection">{goal.reflection}</p>}

      <div className="goal__actions">
        {goal.status === 'active' && (
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            disabled={busy}
            onClick={() => act({ status: 'done' }, 'أُنهي الهدف')}
          >
            أنهيتها
          </button>
        )}
        {goal.status !== 'active' && (
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            disabled={busy}
            onClick={() => act({ status: 'active' }, 'أُعيد الهدف إلى التنفيذ')}
          >
            إعادة فتحها
          </button>
        )}
        {goal.status === 'active' && (
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            disabled={busy}
            onClick={() => act({ status: 'dropped' }, 'تم ترك الهدف')}
          >
            أتركها
          </button>
        )}
        <button
          type="button"
          className="btn btn--ghost btn--sm btn--danger-ghost"
          disabled={busy}
          onClick={() => {
            if (window.confirm('حذف هذا الهدف نهائيًا؟')) {
              (async () => {
                setBusy(true);
                try {
                  await goalsApi.remove(goal._id);
                  onChanged();
                  toast.success('حُذف الهدف');
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
    </article>
  );
}

/**
 * The feedback mirror.
 *
 * Every number here is a count of the owner's own messages. Nothing is
 * inferred about senders, and the caveat is rendered next to the numbers
 * rather than buried — because repetition is not proof, and the app should not
 * pretend otherwise.
 */
export default function Mirror() {
  const [period, setPeriod] = useState('30d');
  const [data, setData] = useState(null);
  const [goals, setGoals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const reload = useCallback(() => setRefreshKey((k) => k + 1), []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    Promise.all([mirrorApi.get(period), goalsApi.list({ limit: 20 })])
      .then(([mirrorRes, goalsRes]) => {
        if (cancelled) return;
        setData(mirrorRes.data);
        setGoals(goalsRes.data.goals);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [period, refreshKey]);

  if (loading) return <Spinner label="جارٍ تحليل ملاحظاتك…" />;

  if (error) {
    return (
      <div className="page page--narrow">
        <Alert type="error">تعذّر تحميل المرآة: {error}</Alert>
      </div>
    );
  }

  const totals = data?.totals ?? { messages: 0, unread: 0, flagged: 0, released: 0 };
  const categories = data?.categories ?? [];
  const maxCount = Math.max(1, ...categories.map((c) => c.count));
  const activeGoals = goals.filter((g) => g.status === 'active');

  return (
    <div className="page page--mirror">
      <header className="page__head">
        <div>
          <h1>مرآة الملاحظات</h1>
          <p className="muted">ما الذي يتكرر عندك — بعددٍ فقط، بلا استنتاجات عن أحد.</p>
        </div>
        <div className="tabs" role="tablist">
          {PERIODS.map((p) => (
            <button
              key={p.key}
              type="button"
              role="tab"
              aria-selected={period === p.key}
              className={`tab${period === p.key ? ' tab--active' : ''}`}
              onClick={() => setPeriod(p.key)}
            >
              {p.label}
            </button>
          ))}
        </div>
      </header>

      <div className="stat-grid">
        <Stat icon="✉️" label="ملاحظة" value={totals.messages} />
        <Stat icon=" unread" label="غير مقروءة" value={totals.unread} tone="info" />
        <Stat icon="🛡️" label="محفوظة لك" value={totals.flagged} tone="warn" />
        <Stat icon="✅" label="أدرجتها في وردك" value={totals.released} tone="good" />
      </div>

      {totals.messages === 0 ? (
        <EmptyState icon="🪞" title="لا ملاحظات بعد">
          عندما تبدأ الملاحظات بالوصول، ستظهر هنا موزّعة حسب النوع.
        </EmptyState>
      ) : (
        <>
          <section className="panel">
            <h2 className="panel__title">الملاحظات حسب النوع</h2>
            <div className="bars">
              {categories.map((c) => (
                <div key={c.key} className="bar">
                  <div className="bar__head">
                    <span>
                      <span aria-hidden="true">{c.icon}</span> {c.label}
                    </span>
                    <span className="bar__value">
                      {c.count} <span className="bar__share">({c.share}%)</span>
                    </span>
                  </div>
                  <div className="bar__track">
                    <div
                      className="bar__fill"
                      style={{ width: `${Math.max(4, (c.count / maxCount) * 100)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </section>

          {data?.themes?.length > 0 && (
            <section className="panel">
              <h2 className="panel__title">موضوعات متكرّرة آخر 14 يومًا</h2>
              <div className="theme-list">
                {data.themes.map((t) => (
                  <span key={t.key} className="theme">
                    <span aria-hidden="true">{t.icon}</span> {t.label} · {t.count} مرات
                  </span>
                ))}
              </div>
              <p className="panel__note">
                التكرار هنا عدّات فقط: قد تكون الملاحظات من شخص واحد، ولا يعني التكرار صحتها.
              </p>
            </section>
          )}

          {/* The caveat ships with the numbers, not in a footnote. */}
          {data?.caveat && <p className="caveat">{data.caveat}</p>}
        </>
      )}

      <section className="panel">
        <div className="panel__head">
          <h2 className="panel__title">أهدافك</h2>
          <Link to="/inbox" className="linklike">
            أنشئ هدفًا من واردك
          </Link>
        </div>

        {activeGoals.length === 0 && goals.length === 0 ? (
          <p className="muted">
            لم تحوّل أي ملاحظة إلى هدف بعد. من صندوق الوارد، اضغط «حوّلها إلى هدف» لأي ملاحظة
            تريدها أن تدفعك لتغيير شيء.
          </p>
        ) : (
          <div className="goal-list">
            {goals.map((g) => (
              <GoalCard key={g._id} goal={g} onChanged={reload} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
