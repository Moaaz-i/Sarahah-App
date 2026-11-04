import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { relativeTime } from '../lib/format.js';

const toArabicDigits = (num) => {
  if (num === null || num === undefined) return '٠';
  return String(num).replace(/[0-9]/g, (d) => '٠١٢٣٤٥٦٧٨٩'[d]);
};

export default function NotificationsCenter({
  notifications = [],
  unreadCount = 0,
  onMarkAsRead,
  onMarkAllAsRead,
  onClearAll,
}) {
  const [open, setOpen] = useState(false);
  const panelRef = useRef(null);
  const navigate = useNavigate();

  // Close when clicking outside
  useEffect(() => {
    if (!open) return;
    const handleClick = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    const handleKey = (e) => {
      if (e.key === 'Escape') setOpen(false);
    };

    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [open]);

  const handleItemClick = (notif) => {
    if (!notif.read && onMarkAsRead) {
      onMarkAsRead(notif.id);
    }
    setOpen(false);
    if (notif.link) {
      navigate(notif.link);
    }
  };

  const getIcon = (type) => {
    switch (type) {
      case 'conversation_message':
        return '💬';
      case 'identity_request':
        return '🎭';
      case 'request_accepted':
        return '🔓';
      case 'request_rejected':
        return '🔒';
      default:
        return '💌';
    }
  };

  return (
    <div className="notif-center" ref={panelRef}>
      <button
        type="button"
        className={`notif-center__trigger ${open ? 'notif-center__trigger--active' : ''}`}
        onClick={() => setOpen((v) => !v)}
        title="مركز الإشعارات 🔔"
        aria-label="الإشعارات"
        aria-expanded={open}
      >
        <span className="notif-center__bell">🔔</span>
        {unreadCount > 0 && (
          <span className="notif-center__badge">
            {unreadCount > 99 ? '+٩٩' : toArabicDigits(unreadCount)}
          </span>
        )}
      </button>

      {open && (
        <div className="notif-center__panel" role="menu">
          <div className="notif-center__head">
            <div className="notif-center__head-info">
              <strong className="notif-center__title">الإشعارات</strong>
              {unreadCount > 0 && (
                <span className="notif-center__head-badge">
                  {toArabicDigits(unreadCount)} جديدة
                </span>
              )}
            </div>
            <div className="notif-center__head-actions">
              {unreadCount > 0 && (
                <button
                  type="button"
                  className="notif-center__action-btn"
                  onClick={onMarkAllAsRead}
                  title="تعليم الكل كمقروء"
                >
                  ✓ مقروء للكل
                </button>
              )}
              {notifications.length > 0 && (
                <button
                  type="button"
                  className="notif-center__action-btn notif-center__action-btn--danger"
                  onClick={onClearAll}
                  title="مسح كافة الإشعارات"
                >
                  مسح
                </button>
              )}
            </div>
          </div>

          <div className="notif-center__list">
            {notifications.length === 0 ? (
              <div className="notif-center__empty">
                <span className="notif-center__empty-icon">🔕</span>
                <p>لا توجد إشعارات حالياً</p>
                <small>ستظهر هنا أي رسائل صراحة أو محادثات أو طلبات كشف هوية جديدة</small>
              </div>
            ) : (
              notifications.map((notif) => (
                <div
                  key={notif.id}
                  className={`notif-item ${!notif.read ? 'notif-item--unread' : ''}`}
                  onClick={() => handleItemClick(notif)}
                  role="menuitem"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleItemClick(notif);
                  }}
                >
                  <div className="notif-item__icon-wrap">
                    <span className="notif-item__icon">{getIcon(notif.type)}</span>
                    {!notif.read && <span className="notif-item__dot" />}
                  </div>
                  <div className="notif-item__content">
                    <div className="notif-item__top">
                      <span className="notif-item__title">{notif.title}</span>
                      <time className="notif-item__time">
                        {notif.time ? relativeTime(notif.time) : 'الآن'}
                      </time>
                    </div>
                    <p className="notif-item__body">{notif.body}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

