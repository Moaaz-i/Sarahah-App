import { useCallback, useEffect, useState } from 'react';
import { adminApi, reportsApi, ApiError } from '../lib/api.js';
import { formatDate, reasonLabel, statusLabel, shortId } from '../lib/format.js';
import { useToast } from '../components/Toast.jsx';
import Spinner from '../components/Spinner.jsx';
import Alert from '../components/Alert.jsx';
import EmptyState from '../components/EmptyState.jsx';
import Modal from '../components/Modal.jsx';
import Field from '../components/Field.jsx';

const TABS = [
  { key: 'stats', label: 'نظرة عامة' },
  { key: 'users', label: 'المستخدمون' },
  { key: 'reports', label: 'البلاغات' },
  { key: 'logs', label: 'سجل التدقيق' },
];

const STATUS_TONE = {
  pending: 'tone--pending',
  reviewed: 'tone--reviewed',
  resolved: 'tone--resolved',
  rejected: 'tone--rejected',
};

function Pager({ meta, onPage }) {
  if (!meta || meta.totalPages <= 1) return null;
  return (
    <div className="pager">
      <button
        type="button"
        className="btn btn--ghost btn--sm"
        disabled={meta.page <= 1}
        onClick={() => onPage(meta.page - 1)}
      >
        السابق
      </button>
      <span>
        صفحة {meta.page} من {meta.totalPages} · {meta.total} سجلًا
      </span>
      <button
        type="button"
        className="btn btn--ghost btn--sm"
        disabled={!meta.hasNextPage}
        onClick={() => onPage(meta.page + 1)}
      >
        التالي
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ stats */

function StatsPanel() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    adminApi
      .stats()
      .then(({ data: d }) => setData(d.stats))
      .catch((e) => setError(e.message));
  }, []);

  if (error) return <Alert type="error">{error}</Alert>;
  if (!data) return <Spinner label="جارٍ تحميل الإحصاءات…" />;

  const cards = [
    { label: 'إجمالي المستخدمين', value: data.users, icon: '👥' },
    { label: 'حسابات نشطة', value: data.activeUsers, icon: '✅' },
    { label: 'حسابات مُؤكَّدة', value: data.verifiedUsers, icon: '📧' },
    { label: 'إجمالي الرسائل', value: data.messages, icon: '✉️' },
    { label: 'إجمالي البلاغات', value: data.reports, icon: '🚩' },
    { label: 'بلاغات معلّقة', value: data.pendingReports, icon: '⏳' },
  ];

  return (
    <div className="stat-grid">
      {cards.map((c) => (
        <div key={c.label} className="stat-card">
          <span className="stat-card__icon" aria-hidden="true">
            {c.icon}
          </span>
          <span className="stat-card__value">{c.value}</span>
          <span className="stat-card__label">{c.label}</span>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ users */

function UsersPanel() {
  const toast = useToast();
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [busyId, setBusyId] = useState(null);

  // Modals
  const [resetModal, setResetModal] = useState(null); // {id, username}
  const [resetPw, setResetPw] = useState('');
  const [resetBusy, setResetBusy] = useState(false);
  const [deleteModal, setDeleteModal] = useState(null); // {id, username}
  const [deleteBusy, setDeleteBusy] = useState(false);

  const load = useCallback(() => {
    setError(null);
    return adminApi
      .users({ page, limit: 20 })
      .then(({ data: d }) => setData(d))
      .catch((e) => setError(e.message));
  }, [page]);

  useEffect(() => {
    let cancelled = false;
    load().then(() => {});
    return () => { cancelled = true; };
  }, [load]);

  const toggleActive = async (u) => {
    setBusyId(u._id);
    try {
      await adminApi.setUserActive(u._id, !u.isActive);
      setData((d) => ({
        ...d,
        users: d.users.map((x) => (x._id === u._id ? { ...x, isActive: !x.isActive } : x)),
      }));
      toast.success(u.isActive ? `تم تعطيل @${u.username}` : `تم تفعيل @${u.username}`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : err.message);
    } finally {
      setBusyId(null);
    }
  };

  const changeRole = async (u) => {
    const nextRole = u.role === 'admin' ? 'user' : 'admin';
    setBusyId(u._id);
    try {
      await adminApi.setUserRole(u._id, nextRole);
      setData((d) => ({
        ...d,
        users: d.users.map((x) => (x._id === u._id ? { ...x, role: nextRole } : x)),
      }));
      toast.success(`تم تغيير دور @${u.username} إلى ${nextRole}`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : err.message);
    } finally {
      setBusyId(null);
    }
  };

  const doResetPassword = async (e) => {
    e.preventDefault();
    setResetBusy(true);
    try {
      await adminApi.resetUserPassword(resetModal.id, resetPw);
      toast.success(`تم إعادة تعيين كلمة مرور @${resetModal.username}`);
      setResetModal(null);
      setResetPw('');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : err.message);
    } finally {
      setResetBusy(false);
    }
  };

  const doDelete = async () => {
    setDeleteBusy(true);
    try {
      await adminApi.deleteUser(deleteModal.id);
      toast.success(`تم حذف @${deleteModal.username}`);
      setDeleteModal(null);
      await load();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : err.message);
    } finally {
      setDeleteBusy(false);
    }
  };

  if (error) return <Alert type="error">{error}</Alert>;
  if (!data) return <Spinner label="جارٍ تحميل المستخدمين…" />;

  return (
    <>
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>المستخدم</th>
              <th>البريد</th>
              <th>الدور</th>
              <th>الحالة</th>
              <th>آخر دخول</th>
              <th>إجراءات</th>
            </tr>
          </thead>
          <tbody>
            {data.users.map((u) => (
              <tr key={u._id} className={u.isActive ? '' : 'row--disabled'}>
                <td>
                  <strong>{u.name}</strong>
                  <div className="muted">@{u.username}</div>
                </td>
                <td className="ltr">{u.email}</td>
                <td>
                  <span className={`chip${u.role === 'admin' ? ' chip--admin' : ''}`}>{u.role}</span>
                  {u.isVerified && <span className="chip chip--ok" title="بريد مُؤكَّد">📧</span>}
                </td>
                <td>
                  <span className={`chip${u.isActive ? ' chip--ok' : ' chip--off'}`}>
                    {u.isActive ? 'نشط' : 'معطّل'}
                  </span>
                </td>
                <td>{u.lastLoginAt ? formatDate(u.lastLoginAt) : '—'}</td>
                <td>
                  <div className="btn-row">
                    <button
                      type="button"
                      className={`btn btn--sm ${u.isActive ? 'btn--danger-ghost' : 'btn--outline'}`}
                      disabled={busyId === u._id}
                      onClick={() => toggleActive(u)}
                    >
                      {u.isActive ? 'تعطيل' : 'تفعيل'}
                    </button>
                    <button
                      type="button"
                      className="btn btn--ghost btn--sm"
                      disabled={busyId === u._id}
                      onClick={() => changeRole(u)}
                      title={u.role === 'admin' ? 'تحويل إلى مستخدم' : 'ترقية إلى مسؤول'}
                    >
                      {u.role === 'admin' ? '↓ دور' : '↑ ترقية'}
                    </button>
                    <button
                      type="button"
                      className="btn btn--ghost btn--sm"
                      onClick={() => { setResetModal(u); setResetPw(''); }}
                    >
                      إعادة تعيين
                    </button>
                    <button
                      type="button"
                      className="btn btn--danger-ghost btn--sm"
                      onClick={() => setDeleteModal(u)}
                    >
                      حذف
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pager meta={data.pagination} onPage={setPage} />

      {/* Reset password modal */}
      <Modal
        open={!!resetModal}
        onClose={() => setResetModal(null)}
        title={`إعادة تعيين كلمة مرور @${resetModal?.username || ''}`}
        footer={
          <>
            <button type="button" className="btn btn--ghost" onClick={() => setResetModal(null)}>
              إلغاء
            </button>
            <button
              type="submit"
              form="reset-pw-form"
              className="btn btn--primary"
              disabled={resetBusy || resetPw.length < 8}
            >
              {resetBusy ? 'جارٍ…' : 'تعيين كلمة المرور'}
            </button>
          </>
        }
      >
        <form id="reset-pw-form" onSubmit={doResetPassword}>
          <p className="muted">سيتم إبطال جميع الجلسات النشطة لهذا المستخدم.</p>
          <Field
            label="كلمة المرور الجديدة"
            name="resetPw"
            type="text"
            hint="8 أحرف على الأقل، وتحوي حرفًا ورقمًا."
            value={resetPw}
            onChange={(e) => setResetPw(e.target.value)}
            required
            autoFocus
          />
        </form>
      </Modal>

      {/* Delete user modal */}
      <Modal
        open={!!deleteModal}
        onClose={() => setDeleteModal(null)}
        title={`حذف @${deleteModal?.username || ''}`}
        footer={
          <>
            <button type="button" className="btn btn--ghost" onClick={() => setDeleteModal(null)}>
              إلغاء
            </button>
            <button
              type="button"
              className="btn btn--danger"
              onClick={doDelete}
              disabled={deleteBusy}
            >
              {deleteBusy ? 'جارٍ الحذف…' : 'حذف نهائي'}
            </button>
          </>
        }
      >
        <p>
          سيتم حذف المستخدم ورسائله وبلاغاته نهائيًا. لا يمكن التراجع عن هذه الخطوة.
        </p>
      </Modal>
    </>
  );
}

/* ---------------------------------------------------------------- reports */

function ReportsPanel() {
  const toast = useToast();
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [busyId, setBusyId] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    reportsApi
      .list({ page, limit: 20, status: status || undefined })
      .then(({ data: d }) => !cancelled && setData(d))
      .catch((e) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [page, status]);

  const updateStatus = async (id, next) => {
    setBusyId(id);
    try {
      await adminApi.updateReport(id, next);
      toast.success(`البلاغ: ${statusLabel(next)}`);
      const { data } = await reportsApi.list({
        page,
        limit: 20,
        status: status || undefined,
      });
      setData(data);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusyId(null);
    }
  };

  if (error) return <Alert type="error">{error}</Alert>;
  if (!data) return <Spinner label="جارٍ تحميل البلاغات…" />;

  return (
    <>
      <div className="filters">
        <label htmlFor="status-filter">الحالة:</label>
        <select
          id="status-filter"
          value={status}
          onChange={(e) => {
            setPage(1);
            setStatus(e.target.value);
          }}
        >
          <option value="">الكل</option>
          <option value="pending">قيد الانتظار</option>
          <option value="reviewed">تمت المراجعة</option>
          <option value="resolved">تم الحل</option>
          <option value="rejected">مرفوض</option>
        </select>
      </div>

      {data.reports.length === 0 ? (
        <EmptyState icon="🛡️" title="لا بلاغات">
          لا يوجد بلاغات تطابق هذا الفلتر.
        </EmptyState>
      ) : (
        <div className="report-list">
          {data.reports.map((r) => (
            <article key={r.id} className="report-card">
              <header className="report-card__head">
                <span className={`chip ${STATUS_TONE[r.status]}`}>{statusLabel(r.status)}</span>
                <span className="chip chip--plain">{reasonLabel(r.reason)}</span>
                <time className="muted">{formatDate(r.createdAt)}</time>
              </header>

              {r.message?.content ? (
                <blockquote className="report-card__quote">{r.message.content}</blockquote>
              ) : (
                <p className="muted">تعذّر عرض نص الرسالة (حُذفت أو لم تُحمَّل).</p>
              )}
              {r.reporter && (
                <p className="muted">
                  أبلغه: <strong>@{r.reporter.username}</strong>
                </p>
              )}
              {r.details && <p className="report-card__details">{r.details}</p>}

              <footer className="report-card__foot">
                <span className="muted">
                  {r.reviewedBy
                    ? `راجعه ${r.reviewedBy.username} في ${formatDate(r.reviewedAt)}`
                    : 'لم يُراجع بعد'}
                </span>
                <div className="btn-row">
                  {r.status !== 'reviewed' && (
                    <button
                      type="button"
                      className="btn btn--ghost btn--sm"
                      disabled={busyId === r.id}
                      onClick={() => updateStatus(r.id, 'reviewed')}
                    >
                      مراجعة
                    </button>
                  )}
                  {r.status !== 'resolved' && (
                    <button
                      type="button"
                      className="btn btn--outline btn--sm"
                      disabled={busyId === r.id}
                      onClick={() => updateStatus(r.id, 'resolved')}
                    >
                      حلّ
                    </button>
                  )}
                  {r.status !== 'rejected' && (
                    <button
                      type="button"
                      className="btn btn--danger-ghost btn--sm"
                      disabled={busyId === r.id}
                      onClick={() => updateStatus(r.id, 'rejected')}
                    >
                      رفض
                    </button>
                  )}
                </div>
              </footer>
            </article>
          ))}
        </div>
      )}

      <Pager meta={data.pagination} onPage={setPage} />
    </>
  );
}

/* ------------------------------------------------------------------- logs */

function LogsPanel() {
  const [action, setAction] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    adminApi
      .auditLogs({ page, limit: 20, action: action.trim() || undefined })
      .then(({ data: d }) => !cancelled && setData(d))
      .catch((e) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [page, action]);

  if (error) return <Alert type="error">{error}</Alert>;
  if (!data) return <Spinner label="جارٍ تحميل السجل…" />;

  return (
    <>
      <div className="filters">
        <label htmlFor="action-filter">الإجراء:</label>
        <input
          id="action-filter"
          type="text"
          placeholder="مثال: admin.user_role_changed"
          value={action}
          onChange={(e) => {
            setPage(1);
            setAction(e.target.value);
          }}
          className="ltr"
        />
      </div>

      {data.logs.length === 0 ? (
        <EmptyState icon="📜" title="لا سجلات">
          لا توجد سجلات تطابق هذا الفلتر.
        </EmptyState>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>الإجراء</th>
                <th>المنفّذ</th>
                <th>الهدف</th>
                <th>الوقت</th>
                <th>طلب</th>
              </tr>
            </thead>
            <tbody>
              {data.logs.map((log) => (
                <tr key={log.id}>
                  <td>
                    <code className="ltr">{log.action}</code>
                  </td>
                  <td>{log.actor ? `${log.actor.username} (${log.actor.role})` : 'النظام'}</td>
                  <td className="muted">
                    {log.targetType ? `${log.targetType} ${shortId(log.targetId)}` : '—'}
                  </td>
                  <td>{formatDate(log.createdAt)}</td>
                  <td className="muted ltr">{shortId(log.requestId)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Pager meta={data.pagination} onPage={setPage} />
    </>
  );
}

/* ------------------------------------------------------------------- page */

export default function Admin() {
  const [tab, setTab] = useState('stats');

  return (
    <div className="page page--admin">
      <header className="page__head">
        <div>
          <h1>لوحة الإدارة</h1>
          <p className="muted">الميزات هنا تتطلّب دور admin — وكل إجراء يُسجَّل في سجل التدقيق.</p>
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

      {tab === 'stats' && <StatsPanel />}
      {tab === 'users' && <UsersPanel />}
      {tab === 'reports' && <ReportsPanel />}
      {tab === 'logs' && <LogsPanel />}
    </div>
  );
}
