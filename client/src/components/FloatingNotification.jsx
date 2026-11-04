import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

/**
 * Floating notification popup card anchored specifically at the bottom-right
 * of the screen (أسفل الجانب الأيمن) as requested.
 */
export default function FloatingNotification({ notification, onDismiss }) {
  const navigate = useNavigate();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!notification) {
      setVisible(false);
      return;
    }
    // Enter animation
    const enterTimer = setTimeout(() => setVisible(true), 10);

    // Auto dismiss after 8 seconds
    const dismissTimer = setTimeout(() => {
      setVisible(false);
      setTimeout(onDismiss, 300);
    }, 8000);

    return () => {
      clearTimeout(enterTimer);
      clearTimeout(dismissTimer);
    };
  }, [notification, onDismiss]);

  if (!notification) return null;

  const handleClickAction = () => {
    if (notification.link) {
      navigate(notification.link);
    }
    setVisible(false);
    setTimeout(onDismiss, 300);
  };

  const handleClose = (e) => {
    e.stopPropagation();
    setVisible(false);
    setTimeout(onDismiss, 300);
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
    <aside
      className={`floating-notif-card ${visible ? 'floating-notif-card--show' : ''}`}
      role="alert"
      aria-live="polite"
    >
      <div className="floating-notif-card__glow" />
      
      <div className="floating-notif-card__header">
        <div className="floating-notif-card__badge">
          <span className="floating-notif-card__icon">{getIcon(notification.type)}</span>
          <span className="floating-notif-card__title">{notification.title}</span>
        </div>
        <button
          type="button"
          className="floating-notif-card__close"
          onClick={handleClose}
          aria-label="إغلاق الإشعار"
          title="إغلاق"
        >
          ✕
        </button>
      </div>

      <div className="floating-notif-card__body">
        <p className="floating-notif-card__content">{notification.body}</p>
      </div>

      <div className="floating-notif-card__footer">
        <button
          type="button"
          className="floating-notif-card__btn"
          onClick={handleClickAction}
        >
          {notification.actionText || 'عرض التفاصيل ←'}
        </button>
        <span className="floating-notif-card__hint">وصل للتو ⚡</span>
      </div>
      
      {/* Auto-dismiss progress bar */}
      <div className="floating-notif-card__progress" />
    </aside>
  );
}

