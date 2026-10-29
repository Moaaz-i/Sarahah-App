import { useCallback, useEffect, useState } from 'react';
import { adminApi, ApiError } from '../lib/api.js';
import { formatDate, statusLabel, shortId } from '../lib/format.js';
import { useToast } from '../components/Toast.jsx';
import Spinner from '../components/Spinner.jsx';
import Alert from '../components/Alert.jsx';
import EmptyState from '../components/EmptyState.jsx';
import Modal from '../components/Modal.jsx';
import Field from '../components/Field.jsx';
import Avatar from '../components/Avatar.jsx';

const TABS = [
  { key: 'stats', label: '📊 التحليلات والنظرة العامة' },
  { key: 'users', label: '👥 إدارة المستخدمين' },
  { key: 'reports', label: '🚩 البلاغات والمراجعة' },
  { key: 'logs', label: '📜 سجل التدقيق المباشر' },
  { key: 'system', label: '⚡ صحة النظام و Redis' },
];

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

function StatsPanel({ onSelectTab }) {
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
    { label: 'إجمالي المستخدمين', value: data.users, icon: '👥', color: '#6366f1', tab: 'users' },
    { label: 'حسابات نشطة', value: data.activeUsers, icon: '✅', color: '#10b981', tab: 'users' },
    { label: 'حسابات مُؤكَّدة', value: data.verifiedUsers, icon: '📧', color: '#06b6d4', tab: 'users' },
    { label: 'إجمالي الرسائل', value: data.messages, icon: '✉️', color: '#8b5cf6' },
    { label: 'إجمالي البلاغات', value: data.reports, icon: '🚩', color: '#f59e0b', tab: 'reports' },
    { label: 'بلاغات معلّقة', value: data.pendingReports, icon: '⏳', color: '#ef4444', tab: 'reports' },
  ];

  return (
    <div className="admin-overview">
      <div className="stat-grid">
        {cards.map((c) => (
          <div
            key={c.label}
            className="stat-card"
            style={{ cursor: c.tab && onSelectTab ? 'pointer' : 'default' }}
            onClick={() => c.tab && onSelectTab && onSelectTab(c.tab)}
            title={c.tab ? 'انقر للانتقال' : ''}
          >
            <span className="stat-card__icon" aria-hidden="true" style={{ color: c.color }}>
              {c.icon}
            </span>
            <span className="stat-card__value">{c.value}</span>
            <span className="stat-card__label">{c.label}</span>
          </div>
        ))}
      </div>

      <div className="admin-quick-actions" style={{ marginTop: '1.5rem' }}>
        <h3>إجراءات سريعة ومختصرات</h3>
        <div className="btn-row" style={{ marginTop: '0.75rem' }}>
          <button
            type="button"
            className="btn btn--outline"
            onClick={() => onSelectTab && onSelectTab('users')}
          >
            🔍 البحث في المستخدمين وإدارتهم
          </button>
          <button
            type="button"
            className="btn btn--outline"
            onClick={() => onSelectTab && onSelectTab('reports')}
          >
            🚩 مراجعة البلاغات المعلقة ({data.pendingReports})
          </button>
          <button
            type="button"
            className="btn btn--outline"
            onClick={() => onSelectTab && onSelectTab('system')}
          >
            ⚡ فحص خادم Redis والذاكرة
          </button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ users */

function UsersPanel() {
  const toast = useToast();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [busyId, setBusyId] = useState(null);

  // Modals
  const [resetModal, setResetModal] = useState(null);
  const [resetPw, setResetPw] = useState('');
  const [resetBusy, setResetBusy] = useState(false);
  const [deleteModal, setDeleteModal] = useState(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const load = useCallback(() => {
    setError(null);
    return adminApi
      .users({ page, limit: 15, search, role: roleFilter })
      .then(({ data: d }) => setData(d))
      .catch((e) => setError(e.message));
  }, [page, search, roleFilter]);

  useEffect(() => {
    load();
  }, [load]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    setPage(1);
    setSearch(searchInput.trim());
  };

  const handleRoleChange = (role) => {
    setPage(1);
    setRoleFilter(role);
  };

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
      toast.error(err.message);
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
      toast.error(err.message);
    } finally {
      setBusyId(null);
    }
  };

  const revokeUserSessions = async (u) => {
    if (!window.confirm(`هل أنت متأكد من طرد وإلغاء جميع جلسات @${u.username} على كافة الأجهزة فوراً؟`)) {
      return;
    }
    setBusyId(u._id);
    try {
      await adminApi.revokeUserSessions(u._id);
      toast.success(`تم إبطال وطرد جميع جلسات @${u.username} بنجاح عبر Redis!`);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusyId(null);
    }
  };

  const doResetPassword = async (e) => {
    e.preventDefault();
    setResetBusy(true);
    try {
      await adminApi.resetUserPassword(resetModal?._id || resetModal?.id, resetPw);
      toast.success(`تم إعادة تعيين كلمة مرور @${resetModal.username} وطرد جلساته القديمة`);
      setResetModal(null);
      setResetPw('');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setResetBusy(false);
    }
  };

  const doDelete = async () => {
    setDeleteBusy(true);
    try {
      await adminApi.deleteUser(deleteModal?._id || deleteModal?.id);
      toast.success(`تم حذف @${deleteModal.username}`);
      setDeleteModal(null);
      await load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setDeleteBusy(false);
    }
  };

  if (error) return <Alert type="error">{error}</Alert>;

  return (
    <>
      {/* Search and Filters Bar */}
      <div className="filter-bar" style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center', marginBottom: '1.2rem' }}>
        <form onSubmit={handleSearchSubmit} style={{ display: 'flex', gap: '0.5rem', flex: 1, minWidth: '240px' }}>
          <input
            type="text"
            className="input"
            placeholder="بحث بالاسم أو اسم المستخدم أو البريد…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            style={{ flex: 1 }}
          />
          <button type="submit" className="btn btn--primary">
            بحث
          </button>
          {search && (
            <button
              type="button"
              className="btn btn--ghost"
              onClick={() => {
                setSearchInput('');
                setSearch('');
                setPage(1);
              }}
            >
              إلغاء
            </button>
          )}
        </form>

        <div className="btn-group--attached" role="group">
          <button
            type="button"
            className={`btn ${roleFilter === '' ? 'btn--all-devices' : 'btn--single-device'}`}
            onClick={() => handleRoleChange('')}
          >
            الكل
          </button>
          <button
            type="button"
            className={`btn ${roleFilter === 'user' ? 'btn--all-devices' : 'btn--single-device'}`}
            onClick={() => handleRoleChange('user')}
          >
            مستخدمون
          </button>
          <button
            type="button"
            className={`btn ${roleFilter === 'admin' ? 'btn--all-devices' : 'btn--single-device'}`}
            onClick={() => handleRoleChange('admin')}
          >
            مسؤولون
          </button>
        </div>
      </div>

      {!data ? (
        <Spinner label="جارٍ تحميل المستخدمين…" />
      ) : data.users.length === 0 ? (
        <EmptyState icon="🔍" title="لا توجد نتائج">
          لم يتم العثور على أي مستخدم يطابق معايير البحث الحالية.
        </EmptyState>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>المستخدم</th>
                <th>البريد الإلكتروني</th>
                <th>الدور</th>
                <th>الحالة</th>
                <th>تاريخ الانضمام</th>
                <th>إجراءات الإدارة</th>
              </tr>
            </thead>
            <tbody>
              {data.users.map((u) => (
                <tr key={u._id} className={u.isActive ? '' : 'row--disabled'}>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                      <Avatar src={u.avatar} name={u.name} username={u.username} size={34} />
                      <div>
                        <strong>{u.name}</strong>
                        <div className="muted">@{u.username}</div>
                      </div>
                    </div>
                  </td>
                  <td className="ltr">{u.email || '—'}</td>
                  <td>
                    <span className={`chip${u.role === 'admin' ? ' chip--admin' : ''}`}>{u.role}</span>
                    {u.isVerified && <span className="chip chip--ok" title="بريد مُؤكَّد">📧</span>}
                  </td>
                  <td>
                    <span className={`chip${u.isActive ? ' chip--ok' : ' chip--off'}`}>
                      {u.isActive ? 'نشط' : 'معطّل'}
                    </span>
                  </td>
                  <td>{formatDate(u.createdAt)}</td>
                  <td>
                    <div className="btn-row">
                      <button
                        type="button"
                        className={`btn btn--sm ${u.isActive ? 'btn--danger-ghost' : 'btn--outline'}`}
                        disabled={busyId === u._id}
                        onClick={() => toggleActive(u)}
                        title={u.isActive ? 'تعطيل الحساب' : 'تفعيل الحساب'}
                      >
                        {u.isActive ? 'تعطيل' : 'تفعيل'}
                      </button>
                      <button
                        type="button"
                        className="btn btn--ghost btn--sm"
                        disabled={busyId === u._id}
                        onClick={() => changeRole(u)}
                        title={u.role === 'admin' ? 'تحويل إلى مستخدم عادي' : 'ترقية إلى مسؤول'}
                      >
                        {u.role === 'admin' ? '↓ دور' : '↑ ترقية'}
                      </button>
                      <button
                        type="button"
                        className="btn btn--danger-ghost btn--sm"
                        disabled={busyId === u._id}
                        onClick={() => revokeUserSessions(u)}
                        title="إبطال وطرد كافة جلسات هذا الحساب عبر Redis"
                      >
                        🔒 طرد الجلسات
                      </button>
                      <button
                        type="button"
                        className="btn btn--ghost btn--sm"
                        onClick={() => {
                          setResetModal(u);
                          setResetPw('');
                        }}
                        title="إعادة تعيين كلمة المرور"
                      >
                        كلمة مرور
                      </button>
                      <button
                        type="button"
                        className="btn btn--danger-ghost btn--sm"
                        onClick={() => setDeleteModal(u)}
                        title="حذف المستخدم نهائياً"
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
      )}

      {data && <Pager meta={data.pagination} onPage={setPage} />}

      {/* Reset Password Modal */}
      <Modal
        open={Boolean(resetModal)}
        onClose={() => setResetModal(null)}
        title={`إعادة تعيين كلمة مرور @${resetModal?.username}`}
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
              {resetBusy ? 'جارٍ الحفظ…' : 'حفظ وإبطال الجلسات'}
            </button>
          </>
        }
      >
        <form id="reset-pw-form" onSubmit={doResetPassword}>
          <p>
            تغيير كلمة المرور سيُبطل تلقائيًا جميع الجلسات النشطة للمستخدم على جميع الأجهزة.
          </p>
          <Field
            label="كلمة المرور الجديدة"
            name="newPassword"
            type="password"
            hint="8 أحرف على الأقل، وتحوي حرفًا ورقمًا."
            value={resetPw}
            onChange={(e) => setResetPw(e.target.value)}
            required
            autoFocus
          />
        </form>
      </Modal>

      {/* Delete User Modal */}
      <Modal
        open={Boolean(deleteModal)}
        onClose={() => setDeleteModal(null)}
        title={`تأكيد حذف @${deleteModal?.username}`}
        footer={
          <>
            <button type="button" className="btn btn--ghost" onClick={() => setDeleteModal(null)}>
              إلغاء
            </button>
            <button
              type="button"
              className="btn btn--danger"
              disabled={deleteBusy}
              onClick={doDelete}
            >
              {deleteBusy ? 'جارٍ الحذف…' : 'حذف نهائي'}
            </button>
          </>
        }
      >
        <p>
          سيتم مسح حساب <strong>@{deleteModal?.username}</strong> نهائيًا وحذف كافة الرسائل الموجهة إليه.
          هذا الإجراء لا يمكن التراجع عنه.
        </p>
      </Modal>
    </>
  );
}

/* ------------------------------------------------------------------ reports */

function ReportsPanel() {
  const toast = useToast();
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(() => {
    setError(null);
    return adminApi
      .reports({ page, limit: 15, status: status || undefined })
      .then(({ data: d }) => setData(d))
      .catch((e) => setError(e.message));
  }, [page, status]);

  useEffect(() => {
    load();
  }, [load]);

  const updateStatus = async (id, nextStatus) => {
    setBusyId(id);
    try {
      await adminApi.updateReport(id, nextStatus);
      setData((d) => ({
        ...d,
        reports: d.reports.map((r) => (r.id === id ? { ...r, status: nextStatus } : r)),
      }));
      toast.success(`تم تحديث حالة البلاغ إلى ${statusLabel(nextStatus)}`);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusyId(null);
    }
  };

  if (error) return <Alert type="error">{error}</Alert>;

  return (
    <>
      <div className="filter-bar" style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.2rem', alignItems: 'center' }}>
        <span className="muted">فلترة حسب الحالة:</span>
        <div className="btn-group--attached" role="group">
          <button
            type="button"
            className={`btn ${status === '' ? 'btn--all-devices' : 'btn--single-device'}`}
            onClick={() => { setPage(1); setStatus(''); }}
          >
            الكل
          </button>
          <button
            type="button"
            className={`btn ${status === 'pending' ? 'btn--all-devices' : 'btn--single-device'}`}
            onClick={() => { setPage(1); setStatus('pending'); }}
          >
            معلّقة
          </button>
          <button
            type="button"
            className={`btn ${status === 'reviewed' ? 'btn--all-devices' : 'btn--single-device'}`}
            onClick={() => { setPage(1); setStatus('reviewed'); }}
          >
            تمت المراجعة
          </button>
          <button
            type="button"
            className={`btn ${status === 'dismissed' ? 'btn--all-devices' : 'btn--single-device'}`}
            onClick={() => { setPage(1); setStatus('dismissed'); }}
          >
            مرفوضة
          </button>
        </div>
      </div>

      {!data ? (
        <Spinner label="جارٍ تحميل البلاغات…" />
      ) : data.reports.length === 0 ? (
        <EmptyState icon="🚩" title="لا توجد بلاغات">
          لا توجد بلاغات مسجلة تطابق هذه الحالة.
        </EmptyState>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>السبب</th>
                <th>المحتوى المبلَّغ عنه</th>
                <th>تاريخ البلاغ</th>
                <th>الحالة</th>
                <th>الإجراء</th>
              </tr>
            </thead>
            <tbody>
              {data.reports.map((r) => (
                <tr key={r.id}>
                  <td>
                    <strong>{r.reason}</strong>
                  </td>
                  <td>
                    <div style={{ maxWidth: '350px', fontSize: '0.9rem', color: 'var(--text)' }}>
                      {r.messageContent || <span className="muted">(المحتوى محذوف)</span>}
                    </div>
                  </td>
                  <td>{formatDate(r.createdAt)}</td>
                  <td>
                    <span className={`chip chip--${r.status}`}>{statusLabel(r.status)}</span>
                  </td>
                  <td>
                    <div className="btn-row">
                      {r.status !== 'reviewed' && (
                        <button
                          type="button"
                          className="btn btn--outline btn--sm"
                          disabled={busyId === r.id}
                          onClick={() => updateStatus(r.id, 'reviewed')}
                        >
                          اعتماد المراجعة
                        </button>
                      )}
                      {r.status !== 'dismissed' && (
                        <button
                          type="button"
                          className="btn btn--ghost btn--sm"
                          disabled={busyId === r.id}
                          onClick={() => updateStatus(r.id, 'dismissed')}
                        >
                          رفض البلاغ
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {data && <Pager meta={data.pagination} onPage={setPage} />}
    </>
  );
}

/* ------------------------------------------------------------------ logs */

function LogsPanel() {
  const [page, setPage] = useState(1);
  const [action, setAction] = useState('');
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(() => {
    setError(null);
    return adminApi
      .auditLogs({ page, limit: 20, action: action || undefined })
      .then(({ data: d }) => setData(d))
      .catch((e) => setError(e.message));
  }, [page, action]);

  useEffect(() => {
    load();
  }, [load]);

  if (error) return <Alert type="error">{error}</Alert>;
  if (!data) return <Spinner label="جارٍ تحميل سجل التدقيق…" />;

  return (
    <>
      <div className="filter-bar" style={{ marginBottom: '1.2rem', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
        <input
          type="text"
          className="input"
          placeholder="فلترة بنوع الإجراء (مثل: auth.login أو auth.logout_all)…"
          value={action}
          onChange={(e) => {
            setPage(1);
            setAction(e.target.value.trim());
          }}
          style={{ maxWidth: '380px' }}
        />
      </div>

      {data.logs.length === 0 ? (
        <EmptyState icon="📜" title="لا سجلات">
          لا توجد سجلات تدقيق تطابق هذا الفلتر.
        </EmptyState>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>الإجراء</th>
                <th>المنفّذ</th>
                <th>الهدف</th>
                <th>التاريخ والوقت</th>
                <th>معرّف الطلب</th>
              </tr>
            </thead>
            <tbody>
              {data.logs.map((log) => (
                <tr key={log.id}>
                  <td>
                    <code className="ltr" style={{ color: 'var(--brand-2)', fontWeight: 600 }}>
                      {log.action}
                    </code>
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

/* -------------------------------------------------------- system & redis */

function SystemHealthPanel() {
  const toast = useToast();
  const [health, setHealth] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [flushBusy, setFlushBusy] = useState(false);

  const fetchHealth = useCallback(() => {
    setBusy(true);
    setError(null);
    adminApi
      .systemHealth()
      .then(({ data: d }) => setHealth(d))
      .catch((e) => setError(e.message))
      .finally(() => setBusy(false));
  }, []);

  useEffect(() => {
    fetchHealth();
  }, [fetchHealth]);

  const handleFlushCache = async () => {
    if (!window.confirm('هل أنت متأكد من رغبتك في مسح كافة مفاتيح الكاش المؤقت في Redis؟')) {
      return;
    }
    setFlushBusy(true);
    try {
      await adminApi.flushCache();
      toast.success('تم مسح كاش الـ Redis المؤقت بنجاح!');
      fetchHealth();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setFlushBusy(false);
    }
  };

  if (error) return <Alert type="error">{error}</Alert>;
  if (!health && busy) return <Spinner label="جارٍ فحص صحة النظام و Redis…" />;
  if (!health) return null;

  const formatUptime = (seconds) => {
    const d = Math.floor(seconds / (3600 * 24));
    const h = Math.floor((seconds % (3600 * 24)) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return `${d > 0 ? `${d} يوم و ` : ''}${h} ساعة و ${m} دقيقة`;
  };

  return (
    <div className="system-health">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.2rem' }}>
        <div>
          <h2>مؤشرات الخادم وقاعدة البيانات و Redis</h2>
          <p className="muted">مراقبة حية للبيئة السحابية والذاكرة واستجابة الاتصال.</p>
        </div>
        <div className="btn-row">
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            disabled={busy}
            onClick={fetchHealth}
          >
            🔄 تحديث المؤشرات
          </button>
          <button
            type="button"
            className="btn btn--danger-ghost btn--sm"
            disabled={flushBusy}
            onClick={handleFlushCache}
          >
            🧹 مسح كاش Redis
          </button>
        </div>
      </div>

      <div className="stat-grid">
        <div className="stat-card">
          <span className="stat-card__icon" aria-hidden="true">
            {health.redis.status === 'connected' ? '🟢' : '🔴'}
          </span>
          <span className="stat-card__value" style={{ fontSize: '1.4rem' }}>
            {health.redis.status === 'connected' ? 'Upstash متصل' : 'غير متصل'}
          </span>
          <span className="stat-card__label">خادم الـ Redis السحابي</span>
        </div>

        <div className="stat-card">
          <span className="stat-card__icon" aria-hidden="true">
            {health.database === 'connected' ? '🟢' : '🟡'}
          </span>
          <span className="stat-card__value" style={{ fontSize: '1.4rem' }}>
            MongoDB نشط
          </span>
          <span className="stat-card__label">قاعدة البيانات الرئيسية</span>
        </div>

        <div className="stat-card">
          <span className="stat-card__icon" aria-hidden="true">
            ⏱️
          </span>
          <span className="stat-card__value" style={{ fontSize: '1.15rem' }}>
            {formatUptime(health.uptime)}
          </span>
          <span className="stat-card__label">مدة تشغيل الخادم (Uptime)</span>
        </div>

        <div className="stat-card">
          <span className="stat-card__icon" aria-hidden="true">
            🧠
          </span>
          <span className="stat-card__value" style={{ fontSize: '1.4rem' }}>
            {health.memory.heapUsedMb} MB
          </span>
          <span className="stat-card__label">استهلاك الذاكرة (Heap Used)</span>
        </div>
      </div>

      <div className="section-card" style={{ marginTop: '1.5rem' }}>
        <h3>تفاصيل بيئة التشغيل</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem', marginTop: '1rem' }}>
          <div>
            <span className="muted">إصدار Node.js:</span>
            <div><strong>{health.nodeVersion}</strong></div>
          </div>
          <div>
            <span className="muted">البيئة (NODE_ENV):</span>
            <div><strong>{health.environment}</strong></div>
          </div>
          <div>
            <span className="muted">استجابة Redis Ping:</span>
            <div><strong className="ltr">{health.redis.ping}</strong></div>
          </div>
          <div>
            <span className="muted">الذاكرة الكلية (RSS):</span>
            <div><strong>{health.memory.rssMb} MB</strong></div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------- main page */

export default function Admin() {
  const [tab, setTab] = useState('stats');

  return (
    <div className="page page--admin">
      <header className="page__head">
        <div>
          <h1>لوحة الإدارة المتقدمة</h1>
          <p className="muted">تحكم شامل في الحسابات، الجلسات، البلاغات وسجلات التدقيق المباشرة.</p>
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

      {tab === 'stats' && <StatsPanel onSelectTab={setTab} />}
      {tab === 'users' && <UsersPanel />}
      {tab === 'reports' && <ReportsPanel />}
      {tab === 'logs' && <LogsPanel />}
      {tab === 'system' && <SystemHealthPanel />}
    </div>
  );
}
