import { useEffect, useRef, useState } from "react";
import {
  Link,
  NavLink,
  Outlet,
  useLocation,
  useNavigate,
} from "react-router-dom";
import { useAuth } from "../lib/auth.jsx";
import { messagesApi } from "../lib/api.js";
import { getSocket, reauthSocket } from "../lib/socket.js";
import Avatar from "./Avatar.jsx";
import Logo from "./Logo.jsx";
import { useToast } from "./Toast.jsx";
import NotificationsCenter from "./NotificationsCenter.jsx";
import FloatingNotification from "./FloatingNotification.jsx";

function UserMenu() {
  const { user, signOut } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const handleSignOut = async (allDevices = false) => {
    setOpen(false);
    await signOut(allDevices);
    toast.success(
      allDevices
        ? "تم تسجيل الخروج وإبطال الجلسات من كل الأجهزة بنجاح"
        : "تم تسجيل الخروج من هذا الجهاز بنجاح",
    );
    navigate("/");
  };

  return (
    <div className="usermenu" ref={ref}>
      <button
        type="button"
        className="usermenu__trigger"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <Avatar
          src={user.avatar}
          name={user.name}
          username={user.username}
          size={34}
        />
        <span className="usermenu__name">{user.name}</span>
        <span className="usermenu__caret" aria-hidden="true">
          ▾
        </span>
      </button>

      {open && (
        <div className="usermenu__panel" role="menu">
          <div className="usermenu__head">
            <strong>{user.name}</strong>
            <span>@{user.username}</span>
          </div>
          <Link
            className="usermenu__item"
            to="/conversations"
            role="menuitem"
            onClick={() => setOpen(false)}
          >
            💬 المحادثات المباشرة
          </Link>
          <Link
            className="usermenu__item"
            to="/identity-requests"
            role="menuitem"
            onClick={() => setOpen(false)}
          >
            🎭 طلبات كشف الهوية
          </Link>
          <Link
            className="usermenu__item"
            to="/settings"
            role="menuitem"
            onClick={() => setOpen(false)}
          >
            الإعدادات
          </Link>
          <Link
            className="usermenu__item"
            to={`/u/${user.username}`}
            role="menuitem"
            onClick={() => setOpen(false)}
          >
            صفحتي العامة
          </Link>
          
          <div className="usermenu__actions-attached">
            <div className="btn-group--attached" role="group" aria-label="خيارات تسجيل الخروج">
              <button
                type="button"
                className="btn btn--single-device"
                title="تسجيل الخروج من هذا الجهاز فقط"
                onClick={() => handleSignOut(false)}
              >
                خروج من هذا الجهاز
              </button>
              <button
                type="button"
                className="btn btn--all-devices"
                title="تسجيل الخروج وإبطال كافة الجلسات على كل الأجهزة"
                onClick={() => handleSignOut(true)}
              >
                كل الأجهزة
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const toArabicDigits = (num) => {
  if (num === null || num === undefined) return '٠';
  return String(num).replace(/[0-9]/g, (d) => '٠١٢٣٤٥٦٧٨٩'[d]);
};

const loadSavedNotifs = (userId) => {
  if (!userId) return [];
  try {
    const raw = localStorage.getItem(`sarhny_notifs_${userId}`);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
};

const saveNotifs = (userId, notifs) => {
  if (!userId) return;
  try {
    localStorage.setItem(`sarhny_notifs_${userId}`, JSON.stringify(notifs.slice(0, 50)));
  } catch {}
};

const playNotificationSound = () => {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(587.33, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.15);
    gain.gain.setValueAtTime(0.12, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.35);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.35);
  } catch {
    // Ignore audio permission restrictions
  }
};

export default function AppShell() {
  const { user, booting } = useAuth();
  const location = useLocation();
  const toast = useToast();
  const [unreadCount, setUnreadCount] = useState(0);
  const welcomedRef = useRef(false);

  // Persistent notifications state
  const [notifications, setNotifications] = useState(() => (user?._id ? loadSavedNotifs(user._id) : []));
  const [floatingNotif, setFloatingNotif] = useState(null);

  useEffect(() => {
    if (user?._id) {
      setNotifications(loadSavedNotifs(user._id));
    } else {
      setNotifications([]);
      setFloatingNotif(null);
    }
  }, [user?._id]);

  const addNotification = (item) => {
    const notif = {
      id: `${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      time: new Date().toISOString(),
      read: false,
      ...item,
    };
    setNotifications((prev) => {
      const next = [notif, ...prev];
      if (user?._id) saveNotifs(user._id, next);
      return next;
    });
    // Pop up bottom-right notification card
    setFloatingNotif(notif);
  };

  const unreadNotifsCount = notifications.filter((n) => !n.read).length;

  const handleMarkNotifRead = (id) => {
    setNotifications((prev) => {
      const next = prev.map((n) => (n.id === id ? { ...n, read: true } : n));
      if (user?._id) saveNotifs(user._id, next);
      return next;
    });
  };

  const handleMarkAllNotifsRead = () => {
    setNotifications((prev) => {
      const next = prev.map((n) => ({ ...n, read: true }));
      if (user?._id) saveNotifs(user._id, next);
      return next;
    });
  };

  const handleClearAllNotifs = () => {
    setNotifications([]);
    if (user?._id) saveNotifs(user._id, []);
  };

  // Fetch unread count on login or mount
  useEffect(() => {
    if (!user) {
      setUnreadCount(0);
      return;
    }

    let active = true;
    messagesApi.counts()
      .then((res) => {
        if (!active) return;
        const countsData = res.data?.counts || res.data || {};
        const unread = Number(countsData.unread ?? 0);
        setUnreadCount(unread);

        // Alert about pending unread messages upon entering
        if (unread > 0 && !welcomedRef.current) {
          welcomedRef.current = true;
          toast.info(
            `لديك ${toArabicDigits(unread)} ${
              unread === 1 ? 'رسالة غير مقروءة' : 'رسائل غير مقروءة'
            } في صندوق الوارد ✨`,
            6000,
          );
        }
      })
      .catch(() => {});

    return () => {
      active = false;
    };
  }, [user]);

  // Real-time socket events for messages
  useEffect(() => {
    if (!user) return;

    const socket = getSocket();
    reauthSocket();

    const handleNewMessage = (payload) => {
      playNotificationSound();

      if (payload?.type === 'conversation_message') {
        const senderName = payload.message?.sender?.name || payload.message?.sender?.username || 'مستخدم';
        const content = payload.message?.content || 'أرسل رسالة جديدة';
        addNotification({
          type: 'conversation_message',
          title: `رسالة جديدة من ${senderName} 💬`,
          body: content,
          link: `/conversations/${payload.conversationId}`,
          actionText: 'فتح المحادثة 💬',
        });
      } else if (payload?.type === 'thread_reply') {
        const content = payload.content || 'رد جديد في إحدى محادثاتك السرية!';
        addNotification({
          type: 'thread_reply',
          title: 'رد جديد في محادثة سرية 💬',
          body: content,
          link: '/inbox',
          actionText: 'عرض الرد 📥',
        });
      } else {
        // Standard anonymous Sarahah message
        setUnreadCount((c) => c + 1);
        const content = payload?.content
          ? payload.content
          : payload?.voiceUrl
          ? 'رسالة صوتية مجهولة 🎙️'
          : 'وصلتك صراحة جديدة!';
        addNotification({
          type: 'sarahah_message',
          title: 'رسالة صراحة جديدة ✨',
          body: content,
          link: '/inbox',
          actionText: 'فتح صندوق الوارد 📥',
        });
      }

      // Notify any active page components (like Inbox)
      window.dispatchEvent(new CustomEvent('sarhny:new_message', { detail: payload }));
    };

    socket.on('new_message', handleNewMessage);

    const handleIdentityRequest = (payload) => {
      playNotificationSound();
      if (payload?.type === 'request_received') {
        const username = payload.receiver?.username || 'مستخدم';
        addNotification({
          type: 'identity_request',
          title: `طلب كشف هوية من @${username} 🎭`,
          body: `المستلم @${username} يطلب معرفة هويتك لصراحة أرسلتها إليه`,
          link: '/identity-requests',
          actionText: 'قبول أو رفض 🎭',
        });
      } else if (payload?.type === 'request_accepted') {
        const username = payload.sender?.username || 'المرسل';
        addNotification({
          type: 'request_accepted',
          title: 'تم قبول كشف الهوية وبدء المحادثة! 🔓',
          body: `كشف @${username} عن هويته وبدأت محادثتكما المباشرة!`,
          link: payload.conversationId ? `/conversations/${payload.conversationId}` : '/conversations',
          actionText: 'فتح المحادثة المباشرة 💬',
        });
      } else if (payload?.type === 'request_rejected') {
        addNotification({
          type: 'request_rejected',
          title: 'رُفض طلب كشف الهوية 🔒',
          body: 'اعتذر مرسل الصراحة عن كشف هويته، وستظل هويته محمية ومجهولة تماماً.',
          link: '/identity-requests',
          actionText: 'الاطلاع على الطلبات 🎭',
        });
      }
    };

    socket.on('identity_request', handleIdentityRequest);

    const handleConversationCreated = (payload) => {
      if (payload?.conversationId) {
        addNotification({
          type: 'conversation_message',
          title: 'بدء محادثة مباشرة جديدة 💬',
          body: 'تم فتح قناة تواصل مباشرة بينكما، انقر للدردشة الآن!',
          link: `/conversations/${payload.conversationId}`,
          actionText: 'فتح المحادثة 💬',
        });
      }
    };

    socket.on('conversation_created', handleConversationCreated);

    // Sync count updates triggered by other components (e.g. marking as read in Inbox)
    const handleCountSync = (e) => {
      if (typeof e.detail?.unread === 'number') {
        setUnreadCount(e.detail.unread);
      }
    };
    window.addEventListener('sarhny:counts_updated', handleCountSync);

    return () => {
      socket.off('new_message', handleNewMessage);
      socket.off('identity_request', handleIdentityRequest);
      socket.off('conversation_created', handleConversationCreated);
      window.removeEventListener('sarhny:counts_updated', handleCountSync);
    };
  }, [user]);

  return (
    <div className="shell">
      <header className="topbar">
        <div className="topbar__inner">
          <Link to="/" className="brand" aria-label="صارحني الرئيسية">
            <Logo size={34} showText={true} />
          </Link>

          <nav className="nav" aria-label="التنقل الرئيسي">
            <NavLink to="/" end>
              الرئيسية
            </NavLink>
            {user && (
              <NavLink to="/inbox" className="nav__inbox-link">
                <span>الوارد</span>
                <span className={`nav__badge ${unreadCount > 0 ? 'nav__badge--active' : ''}`}>
                  ( {toArabicDigits(unreadCount)} )
                </span>
              </NavLink>
            )}
            {user && <NavLink to="/conversations">المحادثات</NavLink>}
            {user && <NavLink to="/identity-requests">طلبات الهوية</NavLink>}
            {user && <NavLink to="/mirror">المرآة</NavLink>}
            {user?.role === "admin" && <NavLink to="/admin">الإدارة</NavLink>}
            {user && <NavLink to="/settings">الإعدادات</NavLink>}
          </nav>

          <div className="topbar__actions">
            {!booting && user && (
              <NotificationsCenter
                notifications={notifications}
                unreadCount={unreadNotifsCount}
                onMarkAsRead={handleMarkNotifRead}
                onMarkAllAsRead={handleMarkAllNotifsRead}
                onClearAll={handleClearAllNotifs}
              />
            )}
            {!booting &&
              (user ? (
                <UserMenu />
              ) : (
                <>
                  <Link className="btn btn--ghost" to="/login">
                    دخول
                  </Link>
                  <Link className="btn btn--primary" to="/register">
                    إنشاء حساب
                  </Link>
                </>
              ))}
          </div>
        </div>
      </header>

      <main className="main" key={location.pathname}>
        <Outlet />
      </main>

      <FloatingNotification
        notification={floatingNotif}
        onDismiss={() => setFloatingNotif(null)}
      />

      <footer className="footer">
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '0.85rem' }}>
          <Logo size={28} showText={true} showTagline={true} />
        </div>
        <p>
          <strong>صارحني</strong> — منصة الصراحة والرسائل التفاعلية المجهولة بكل أمان.
        </p>
        <p className="footer__muted">
          لا يخزّن الخادم اسمك ولا عنوان IP ولا وكيل المستخدم مع الرسالة.
        </p>
      </footer>
    </div>
  );
}
