import { useEffect, useRef, useState } from "react";
import {
  Link,
  NavLink,
  Outlet,
  useLocation,
  useNavigate,
} from "react-router-dom";
import { useAuth } from "../lib/auth.jsx";
import Avatar from "./Avatar.jsx";
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

  const handleSignOut = async () => {
    setOpen(false);
    await signOut();
    toast.success("تم تسجيل الخروج");
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
          <button
            type="button"
            className="usermenu__item usermenu__item--danger"
            role="menuitem"
            onClick={handleSignOut}
          >
            تسجيل الخروج
          </button>
        </div>
      )}
    </div>
  );
}

export default function AppShell() {
  const { user, booting } = useAuth();
  const location = useLocation();

  return (
    <div className="shell">
      <header className="topbar">
        <div className="topbar__inner">
          <Link to="/" className="brand">
            <span className="brand__mark" aria-hidden="true">
              ص
            </span>
            <span className="brand__text">صارحني</span>
          </Link>

          <nav className="nav" aria-label="التنقل الرئيسي">
            <NavLink to="/" end>
              الرئيسية
            </NavLink>
            {user && <NavLink to="/inbox">الوارد</NavLink>}
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
        <p>
          <strong>صارحني</strong> — رسائل تُرسل من دون كشف هوية المرسل.
        </p>
        <p className="footer__muted">
          لا يخزّن الخادم اسمك ولا عنوان IP ولا وكيل المستخدم مع الرسالة.
        </p>
      </footer>
    </div>
  );
}
