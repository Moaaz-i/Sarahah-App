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
        const unread = res.data?.counts?.unread || 0;
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
      setUnreadCount((c) => c + 1);

      if (payload?.type === 'thread_reply') {
        toast.info(payload.content || 'رد جديد في إحدى محادثاتك السرية! 💬');
      } else {
        const preview = payload?.content
          ? payload.content.length > 40
            ? `${payload.content.slice(0, 40)}…`
            : payload.content
          : payload?.voiceUrl
          ? 'رسالة صوتية مجهولة 🎙️'
          : 'رسالة جديدة';
        toast.info(`رسالة صراحة جديدة: "${preview}" ✨`, 6500);
      }

      // Notify any active page components (like Inbox)
      window.dispatchEvent(new CustomEvent('sarhny:new_message', { detail: payload }));
    };

    socket.on('new_message', handleNewMessage);

    // Sync count updates triggered by other components (e.g. marking as read in Inbox)
    const handleCountSync = (e) => {
      if (typeof e.detail?.unread === 'number') {
        setUnreadCount(e.detail.unread);
      }
    };
    window.addEventListener('sarhny:counts_updated', handleCountSync);

    return () => {
      socket.off('new_message', handleNewMessage);
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
            {user && <NavLink to="/mirror">المرآة</NavLink>}
            {user?.role === "admin" && <NavLink to="/admin">الإدارة</NavLink>}
            {user && <NavLink to="/settings">الإعدادات</NavLink>}
          </nav>

          <div className="topbar__actions">
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
