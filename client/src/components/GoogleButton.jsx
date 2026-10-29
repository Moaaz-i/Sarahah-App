import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { beginGoogleLogin, googleApi, clearSession } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { useToast } from './Toast.jsx';

const STORAGE_KEY = 'sarhny:google_accounts';

function getStoredAccounts() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function removeStoredAccount(email) {
  try {
    const current = getStoredAccounts();
    const filtered = current.filter((a) => a.email !== email);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
    return filtered;
  } catch {
    return [];
  }
}

function saveAccount(email, name = '') {
  try {
    const current = getStoredAccounts();
    const updated = [
      {
        email,
        name: name || email.split('@')[0],
        avatar: '',
      },
      ...current.filter((a) => a.email !== email),
    ].slice(0, 5);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    return updated;
  } catch {
    return [];
  }
}

export default function GoogleButton({ label = 'المتابعة باستخدام Google', emailHint = '' }) {
  const [open, setOpen] = useState(false);
  const [accounts, setAccounts] = useState([]);
  const [manualMode, setManualMode] = useState(false);
  const [manualEmail, setManualEmail] = useState(emailHint || '');
  const [loading, setLoading] = useState(false);
  const containerRef = useRef(null);

  const navigate = useNavigate();
  const toast = useToast();
  const { adopt, setUser } = useAuth();

  // Load saved accounts on mount
  useEffect(() => {
    setAccounts(getStoredAccounts());
  }, []);

  // Sync emailHint if prop changes
  useEffect(() => {
    if (emailHint && !manualEmail) {
      setManualEmail(emailHint);
    }
  }, [emailHint, manualEmail]);

  // Listen to postMessage, BroadcastChannel, and storage events from the Google popup window
  useEffect(() => {
    let resolved = false;

    const processHandoff = async (handoff) => {
      if (resolved || !handoff) return;
      resolved = true;
      setLoading(true);
      try {
        const { data } = await googleApi.exchange(handoff);
        if (data.user?.email) {
          saveAccount(data.user.email, data.user.name);
        }
        if (data.linked) {
          setUser(data.user);
          toast.success(data.alreadyLinked ? 'حساب Google كان مرتبطًا بالفعل' : 'تم ربط Google');
          navigate('/settings', { replace: true });
          return;
        }
        clearSession();
        adopt(data);
        toast.success(data.created ? 'تم إنشاء حسابك بحساب Google' : 'أهلًا بعودتك');
        navigate('/inbox', { replace: true });
      } catch (err) {
        toast.error(err.message || 'تعذر إتمام الدخول بـ Google');
      } finally {
        setLoading(false);
      }
    };

    const processError = (err) => {
      setLoading(false);
      toast.error(err || 'تم إلغاء تسجيل الدخول بـ Google');
    };

    const handlePopupMessage = (e) => {
      if (e.data?.type === 'sarhny:google:success' && e.data?.handoff) {
        processHandoff(e.data.handoff);
      }
      if (e.data?.type === 'sarhny:google:error') {
        processError(e.data.error);
      }
    };

    let bc = null;
    try {
      bc = new BroadcastChannel('sarhny_oauth');
      bc.onmessage = (e) => {
        if (e.data?.type === 'sarhny:google:success' && e.data?.handoff) {
          processHandoff(e.data.handoff);
        }
        if (e.data?.type === 'sarhny:google:error') {
          processError(e.data.error);
        }
      };
    } catch {}

    const handleStorage = (e) => {
      if (e.key === 'sarhny:google_oauth_result' && e.newValue) {
        try {
          const parsed = JSON.parse(e.newValue);
          if (parsed.handoff) processHandoff(parsed.handoff);
          if (parsed.error) processError(parsed.error);
        } catch {}
      }
    };

    window.addEventListener('message', handlePopupMessage);
    window.addEventListener('storage', handleStorage);

    return () => {
      window.removeEventListener('message', handlePopupMessage);
      window.removeEventListener('storage', handleStorage);
      try {
        bc?.close();
      } catch {}
    };
  }, [adopt, navigate, setUser, toast]);

  // Close menu on click outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
        setManualMode(false);
      }
    };
    if (open) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [open]);

  // When selecting an account: authenticate directly with that account in popup WITHOUT Google forcing the chooser
  const handleSelectAccount = (email) => {
    setLoading(true);
    setOpen(false);
    try {
      if (email) saveAccount(email);
      // Omit prompt when specific email is chosen so Google doesn't force account chooser!
      beginGoogleLogin(email, { popup: true });
    } catch (err) {
      console.error('Google login failed, fallback to default:', err);
      beginGoogleLogin(email, { popup: false });
    }
  };

  // When user explicitly wants to choose among all Google accounts
  const handleAllAccounts = () => {
    setLoading(true);
    setOpen(false);
    try {
      beginGoogleLogin('', { prompt: 'select_account', popup: true });
    } catch {
      beginGoogleLogin('', { prompt: 'select_account', popup: false });
    }
  };

  const handleManualSubmit = (e) => {
    e.preventDefault();
    if (!manualEmail.trim()) return;
    handleSelectAccount(manualEmail.trim());
  };

  const handleDelete = (e, email) => {
    e.stopPropagation();
    const updated = removeStoredAccount(email);
    setAccounts(updated);
  };

  return (
    <div className="google-selector" ref={containerRef}>
      {/* Input-Options Trigger Bar */}
      <div
        className={`google-selector__trigger ${open ? 'google-selector__trigger--open' : ''}`}
        onClick={() => setOpen((prev) => !prev)}
        role="button"
        tabIndex={0}
        aria-haspopup="listbox"
        aria-expanded={open}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setOpen((prev) => !prev);
          }
        }}
      >
        <div className="google-selector__main">
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" className="google-icon">
            <path
              fill="#4285F4"
              d="M23.5 12.3c0-.9-.1-1.5-.3-2.3H12v4.5h6.5c-.1 1.1-.8 2.7-2.4 3.8l3.7 2.8c2.2-2 3.7-5 3.7-8.8z"
            />
            <path
              fill="#34A853"
              d="M12 24c3.2 0 6-1.1 8-2.9l-3.8-2.9c-1 .7-2.4 1.2-4.2 1.2-3.2 0-5.9-2.1-6.9-5l-3.9 3C3.2 21.3 7.3 24 12 24z"
            />
            <path
              fill="#FBBC05"
              d="M5.1 14.4c-.3-.8-.4-1.6-.4-2.4s.1-1.6.4-2.4l-3.9-3C.4 8.2 0 10 0 12s.4 3.8 1.2 5.4l3.9-3z"
            />
            <path
              fill="#EA4335"
              d="M12 4.7c1.8 0 3 .8 3.7 1.4l3.3-3.2C17 1.2 14.8 0 12 0 7.3 0 3.2 2.7 1.2 6.6l3.9 3c1-2.9 3.7-4.9 6.9-4.9z"
            />
          </svg>
          <span className="google-selector__label">{loading ? 'جارٍ تسجيل الدخول بـ Google…' : label}</span>
        </div>

        <div className="google-selector__arrow">
          <span className="google-selector__tag">خيارات الحسابات</span>
          <span className="google-selector__chevron">{open ? '▲' : '▼'}</span>
        </div>
      </div>

      {/* Dropdown Options Menu */}
      {open && (
        <div className="google-selector__menu">
          <header className="google-selector__head">
            <span className="google-selector__head-title">اختر حساب Google للمتابعة:</span>
          </header>

          {/* Stored / Recognized Accounts */}
          {accounts.length > 0 && (
            <div className="google-selector__list">
              {accounts.map((acc) => (
                <div
                  key={acc.email}
                  className="google-account-item"
                  onClick={() => handleSelectAccount(acc.email)}
                  role="button"
                  tabIndex={0}
                >
                  <div className="google-account-item__avatar">
                    {acc.avatar ? (
                      <img src={acc.avatar} alt={acc.name} />
                    ) : (
                      <span>{acc.name ? acc.name.charAt(0).toUpperCase() : 'G'}</span>
                    )}
                  </div>
                  <div className="google-account-item__meta">
                    <span className="google-account-item__name">{acc.name || acc.email}</span>
                    <span className="google-account-item__email">{acc.email}</span>
                  </div>
                  <button
                    type="button"
                    className="google-account-item__remove"
                    title="إزالة الحساب من القائمة"
                    onClick={(e) => handleDelete(e, acc.email)}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Action: Open Google In Popup Directly */}
          <div
            className="google-account-item google-account-item--action"
            onClick={handleAllAccounts}
            role="button"
            tabIndex={0}
          >
            <div className="google-account-item__icon-action">🌐</div>
            <div className="google-account-item__meta">
              <span className="google-account-item__name">تسجيل الدخول / اختيار حساب Google</span>
              <span className="google-account-item__sub">نافذة منبثقة سريعة دون مغادرة الموقع</span>
            </div>
            <span className="google-account-item__arrow">←</span>
          </div>

          {/* Manual Input Option */}
          {!manualMode ? (
            <div
              className="google-account-item google-account-item--action"
              onClick={() => setManualMode(true)}
              role="button"
              tabIndex={0}
            >
              <div className="google-account-item__icon-action">✏️</div>
              <div className="google-account-item__meta">
                <span className="google-account-item__name">كتابة بريد حساب Google يدويًا</span>
                <span className="google-account-item__sub">تحديد حساب معين للدخول به مباشرة</span>
              </div>
              <span className="google-account-item__arrow">+</span>
            </div>
          ) : (
            <form className="google-manual-form" onSubmit={handleManualSubmit}>
              <div className="google-manual-form__row">
                <input
                  type="email"
                  className="google-manual-input"
                  placeholder="بريدك في Google (مثال: name@gmail.com)"
                  value={manualEmail}
                  onChange={(e) => setManualEmail(e.target.value)}
                  autoFocus
                  required
                />
                <button type="submit" className="btn btn--primary btn--sm">
                  دخول
                </button>
              </div>
            </form>
          )}

          <footer className="google-selector__foot">
            <span>آمن ومحمي ومباشر دون مغادرة الموقع</span>
          </footer>
        </div>
      )}
    </div>
  );
}
