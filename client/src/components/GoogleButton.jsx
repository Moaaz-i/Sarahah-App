import { beginGoogleLogin } from '../lib/api.js';

/** Full-page navigation to the backend's OAuth start endpoint. */
export default function GoogleButton({ label = 'المتابعة باستخدام Google', emailHint = '' }) {
  return (
    <button
      type="button"
      className="btn btn--google btn--block"
      onClick={() => beginGoogleLogin(emailHint)}
    >
      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
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
      {label}
    </button>
  );
}
