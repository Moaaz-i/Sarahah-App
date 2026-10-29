/**
 * Thin API client for the Sar7ny backend.
 *
 * Responsibilities:
 *  - Build URLs against VITE_API_URL (no dev proxy — see vite.config.js).
 *  - Attach the bearer access token when one is available.
 *  - Refresh an expired access token exactly once per request, single-flight
 *    within a tab and coordinated across tabs through a localStorage lock
 *    (the backend treats a replayed refresh token as theft and revokes the
 *    whole session chain, so two tabs must never rotate concurrently).
 *  - Normalize every failure into ApiError { status, code, message, details }.
 */

const API_URL = (import.meta.env.VITE_API_URL || 'http://localhost:3000/api/v1').replace(
  /\/+$/,
  '',
);

/** API origin without the /api/v1 prefix, used to build absolute upload URLs. */
export const API_BASE = API_URL.replace(/\/api\/v1$/, '');

/** Turn a stored avatar reference into an absolute URL the browser can load. */
export const resolveUploadUrl = (ref) => {
  if (!ref) return ref;
  if (/^https?:\/\//i.test(ref)) return ref;
  if (/^data:image\//i.test(ref)) return ref;
  if (ref.startsWith('/uploads/')) return `${API_BASE}${ref}`;
  return ref;
};

const ACCESS_KEY = 'sarhny.access';
const REFRESH_KEY = 'sarhny.refresh';
const LOCK_KEY = 'sarhny.refresh.lock';
const LOCK_TTL_MS = 6_000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message || 'Request failed');
    this.name = 'ApiError';
    this.status = status;
    this.code = code || 'UNKNOWN_ERROR';
    this.details = details;
  }

  /** field -> message, handy for inline form errors */
  get fieldErrors() {
    if (Array.isArray(this.details)) {
      return Object.fromEntries(this.details.map((d) => [d.field, d.message]));
    }
    return null;
  }
}

/* ------------------------------------------------------------------ session */

const decodeExpiry = (token) => {
  try {
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    return Number(payload.exp) * 1000 || 0;
  } catch {
    return 0;
  }
};

export const getAccessToken = () => localStorage.getItem(ACCESS_KEY) || null;
export const getRefreshToken = () => localStorage.getItem(REFRESH_KEY) || null;

/** True when we hold a refresh token (the session may still be revivable). */
export const hasSession = () => Boolean(getRefreshToken());

/** True when the access token exists and is not within 5s of expiring. */
export const hasUsableAccess = () => {
  const token = getAccessToken();
  return Boolean(token) && decodeExpiry(token) - Date.now() > 5_000;
};

export const setSession = ({ accessToken, refreshToken }) => {
  if (accessToken) localStorage.setItem(ACCESS_KEY, accessToken);
  if (refreshToken) localStorage.setItem(REFRESH_KEY, refreshToken);
};

export const clearSession = () => {
  localStorage.removeItem(ACCESS_KEY);
  localStorage.removeItem(REFRESH_KEY);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('sarhny:auth:logout'));
  }
};

/* ---------------------------------------------------------------- transport */

async function transport(path, { method = 'GET', body, auth = true, signal } = {}) {
  const headers = { Accept: 'application/json' };
  let requestBody = undefined;
  if (body !== undefined) {
    if (body instanceof FormData) {
      // Let the browser set multipart/form-data with the correct boundary.
      requestBody = body;
    } else {
      headers['Content-Type'] = 'application/json';
      requestBody = JSON.stringify(body);
    }
  }

  if (auth) {
    const token = getAccessToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  let res;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method,
      headers,
      body: requestBody,
      // Required: the OAuth flow cookie is set/read cross-origin on the link flow.
      credentials: 'include',
      signal,
    });
  } catch (err) {
    if (err?.name === 'AbortError') throw err;
    throw new ApiError(0, 'NETWORK_ERROR', 'تعذّر الاتصال بالخادم، تحقّق من اتصالك');
  }

  const text = await res.text();
  let payload = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      /* non-JSON body (should not happen for this API) */
    }
  }

  if (!res.ok) {
    throw new ApiError(
      res.status,
      payload?.code,
      payload?.message || `HTTP ${res.status}`,
      payload?.details,
    );
  }
  return payload;
}

/* ------------------------------------------------------- refresh (single-flight) */

let inFlightRefresh = null;

async function performRefresh(force = false) {
  let lockedByUs = false;

  // Cross-tab coordination: only one tab may rotate at a time.
  const deadline = Date.now() + LOCK_TTL_MS;
  for (;;) {
    if (!force && hasUsableAccess()) return getAccessToken();

    const now = Date.now();
    const held = Number(localStorage.getItem(LOCK_KEY) || 0);
    if (!held || now - held > LOCK_TTL_MS) {
      localStorage.setItem(LOCK_KEY, String(now));
      lockedByUs = true;
      break;
    }
    if (now > deadline) {
      // The other tab went away mid-flight; take over rather than fail.
      localStorage.setItem(LOCK_KEY, String(now));
      lockedByUs = true;
      break;
    }
    await sleep(250);
  }

  try {
    // Another tab may have finished while we waited for the lock.
    if (!force && hasUsableAccess()) return getAccessToken();

    const refreshToken = getRefreshToken();
    if (!refreshToken) {
      clearSession();
      throw new ApiError(401, 'NO_SESSION', 'انتهت الجلسة، الرجاء تسجيل الدخول');
    }

    try {
      const data = (
        await transport('/auth/refresh', { method: 'POST', body: { refreshToken }, auth: false })
      ).data;

      setSession(data);
      return data.accessToken;
    } catch (err) {
      clearSession();
      throw err;
    }
  } finally {
    if (lockedByUs) localStorage.removeItem(LOCK_KEY);
  }
}

export function refreshSession(force = false) {
  if (!inFlightRefresh) {
    inFlightRefresh = performRefresh(force).finally(() => {
      inFlightRefresh = null;
    });
  }
  return inFlightRefresh;
}

/* ------------------------------------------------------------------ request */

/**
 * Perform an API request.
 * @param {string} path  path under VITE_API_URL, e.g. "/auth/login"
 */
export async function api(path, options = {}) {
  const { auth = true, _retried = false, ...rest } = options;

  // Proactively renew before the call instead of paying a round-trip on 401.
  if (auth && !hasUsableAccess() && hasSession()) {
    try {
      await refreshSession();
    } catch {
      /* let the request run; it will 401 and we handle it below */
    }
  }

  try {
    return await transport(path, { ...rest, auth });
  } catch (err) {
    const isRevoked =
      err instanceof ApiError &&
      err.status === 401 &&
      (err.code === 'SESSION_EXPIRED' || err.code === 'TOKEN_REVOKED');

    if (isRevoked) {
      clearSession();
      throw err;
    }

    const retryable = err instanceof ApiError && err.status === 401 && auth && !_retried;
    if (!retryable) {
      if (err instanceof ApiError && err.status === 401) clearSession();
      throw err;
    }

    try {
      await refreshSession(true);
      return await transport(path, { ...rest, auth, _retried: true });
    } catch (refreshErr) {
      clearSession();
      throw refreshErr;
    }
  }
}

/* ------------------------------------------------------------------ helpers */

export const get = (path, options) => api(path, { ...options, method: 'GET' });
export const post = (path, body, options) => api(path, { ...options, method: 'POST', body });
export const patch = (path, body, options) => api(path, { ...options, method: 'PATCH', body });
export const put = (path, body, options) => api(path, { ...options, method: 'PUT', body });
export const del = (path, body, options) => api(path, { ...options, method: 'DELETE', body });

/* --------------------------------------------------------------------- auth */

export const authApi = {
  register: (body) => post('/auth/register', body, { auth: false }),
  login: (body) => post('/auth/login', body, { auth: false }),
  me: () => get('/auth/me'),
  logout: async () => {
    const refreshToken = getRefreshToken();
    try {
      await post('/auth/logout', refreshToken ? { refreshToken } : {});
    } finally {
      clearSession();
    }
  },
  logoutAll: async () => {
    try {
      await post('/auth/logout-all', {});
    } finally {
      clearSession();
    }
  },
};

/* ------------------------------------------------------------- google oauth */

/**
 * Starts Google OAuth.
 * Defaults to a centered popup window so the main web application never leaves the current page.
 * If popups are blocked by the browser, it seamlessly falls back to standard page redirection.
 */
export function beginGoogleLogin(loginHint, options = {}) {
  const isPopup = options.popup !== false;
  const params = new URLSearchParams();
  if (loginHint) params.set('login_hint', loginHint);
  if (options.prompt) params.set('prompt', options.prompt);
  if (isPopup) params.set('popup', '1');

  const qs = params.toString() ? `?${params.toString()}` : '';
  const url = `${API_URL}/auth/google${qs}`;

  if (isPopup) {
    const width = 500;
    const height = 620;
    const left = window.screenX + Math.max(0, (window.outerWidth - width) / 2);
    const top = window.screenY + Math.max(0, (window.outerHeight - height) / 2);
    try {
      localStorage.setItem('sarhny_in_popup_flow', '1');
      const popup = window.open(
        url,
        'sarhny_google_auth',
        `width=${width},height=${height},left=${left},top=${top},status=0,menubar=0,toolbar=0,resizable=1`,
      );
      if (popup && !popup.closed) {
        popup.focus?.();
        return popup;
      }
    } catch {
      /* popup blocked: fall through to redirect */
    }
  }

  // Fallback to standard redirect
  localStorage.removeItem('sarhny_in_popup_flow');
  window.location.assign(url);
}

export const googleApi = {
  /** Resolves { authorizationUrl } and sets the flow cookie on the reply. */
  startLink: (loginHint) =>
    post('/auth/google/link', loginHint ? { login_hint: loginHint } : {}),
  links: () => get('/auth/google/links'),
  unlink: () => del('/auth/google/link'),
  exchange: (handoff) => post('/auth/google/exchange', { handoff }, { auth: false }),
};

/* ------------------------------------------------------------------- toasts */

export const usersApi = {
  profile: (username) => get(`/users/${encodeURIComponent(username)}`, { auth: false }),
  updateMe: (body) => patch('/users/me', body),
  changePassword: (body) => patch('/users/me/password', body),
  deleteAccount: (password) => del('/users/me', password ? { password } : {}),
  /** Upload an avatar image file (multipart/form-data). Returns { user }. */
  uploadAvatar: (file) => {
    const formData = new FormData();
    formData.append('avatar', file);
    return api('/users/me/avatar', { method: 'PATCH', body: formData });
  },
};

export const messagesApi = {
  send: (username, content) =>
    post(`/messages/${encodeURIComponent(username)}`, content, { auth: false }),
  inbox: ({ limit = 20, cursor, isRead, isArchived, category, quarantined } = {}) => {
    const qs = new URLSearchParams({ limit: String(limit) });
    if (cursor) qs.set('cursor', cursor);
    if (isRead !== undefined) qs.set('isRead', String(isRead));
    if (isArchived !== undefined) qs.set('isArchived', String(isArchived));
    if (category) qs.set('category', category);
    // Absent = the normal inbox; `true` = the quarantine section only.
    if (quarantined) qs.set('quarantined', 'true');
    return get(`/messages?${qs}`);
  },
  counts: () => get('/messages/counts'),
  get: (id) => get(`/messages/${id}`),
  markRead: (id) => patch(`/messages/${id}/read`),
  archive: (id, archived) => patch(`/messages/${id}/archive`, { archived }),
  /** Recipient override: let a shield-flagged message through. */
  release: (id) => patch(`/messages/${id}/release`),
  /** Recipient replies to message */
  reply: (id, { content, isPublic = false }) =>
    post(`/messages/${id}/reply`, { content, isPublic }),
  /** Anonymous sender loads thread */
  getThread: (conversationKey) =>
    get(`/messages/thread/${encodeURIComponent(conversationKey)}`, { auth: false }),
  /** Anonymous sender replies in thread */
  replyThread: (conversationKey, { content }) =>
    post(`/messages/thread/${encodeURIComponent(conversationKey)}/reply`, { content }, { auth: false }),
  remove: (id) => del(`/messages/${id}`),
};

/**
 * The "useful honesty" layer: reception policy, guided prompts, the feedback
 * mirror, and personal goals. All authenticated and scoped to the caller.
 */
export const receptionApi = {
  get: () => get('/reception'),
  update: (body) => put('/reception', body),
  replacePrompts: (prompts) => put('/reception/prompts', { prompts }),
};

export const mirrorApi = {
  /** @param {'30d'|'90d'|'all'} period */
  get: (period = '30d') => get(`/mirror?period=${encodeURIComponent(period)}`),
};

export const goalsApi = {
  list: ({ status, limit } = {}) => {
    const qs = new URLSearchParams();
    if (status) qs.set('status', status);
    if (limit) qs.set('limit', String(limit));
    const query = qs.toString();
    return get(`/goals${query ? `?${query}` : ''}`);
  },
  create: (body) => post('/goals', body),
  get: (id) => get(`/goals/${id}`),
  update: (id, body) => patch(`/goals/${id}`, body),
  remove: (id) => del(`/goals/${id}`),
  due: () => get('/goals/due'),
};

export const reportsApi = {
  create: (body) => post('/reports', body, { auth: false }),
  list: ({ status, reason, page = 1, limit = 20 } = {}) => {
    const qs = new URLSearchParams({ page: String(page), limit: String(limit) });
    if (status) qs.set('status', status);
    if (reason) qs.set('reason', reason);
    return get(`/reports?${qs}`);
  },
  get: (id) => get(`/reports/${id}`),
  setStatus: (id, status) => patch(`/reports/${id}/status`, { status }),
};

export const adminApi = {
  stats: () => get('/admin/stats'),
  users: ({ page = 1, limit = 20, search = '', role = '' } = {}) => {
    const qs = new URLSearchParams({ page: String(page), limit: String(limit) });
    if (search) qs.set('search', search);
    if (role) qs.set('role', role);
    return get(`/admin/users?${qs}`);
  },
  getUser: (id) => get(`/admin/users/${id}`),
  setUserActive: (id, isActive) => patch(`/admin/users/${id}`, { isActive }),
  setUserRole: (id, role) => patch(`/admin/users/${id}/role`, { role }),
  resetUserPassword: (id, newPassword) => patch(`/admin/users/${id}/password`, { newPassword }),
  revokeUserSessions: (id) => post(`/admin/users/${id}/revoke-sessions`, {}),
  deleteUser: (id) => del(`/admin/users/${id}`),
  reports: ({ page = 1, limit = 20, status } = {}) => {
    const qs = new URLSearchParams({ page: String(page), limit: String(limit) });
    if (status) qs.set('status', status);
    return get(`/admin/reports?${qs}`);
  },
  updateReport: (id, status) => patch(`/admin/reports/${id}`, { status }),
  auditLogs: ({ page = 1, limit = 20, action } = {}) => {
    const qs = new URLSearchParams({ page: String(page), limit: String(limit) });
    if (action) qs.set('action', action);
    return get(`/admin/audit-logs?${qs}`);
  },
  systemHealth: () => get('/admin/system'),
  flushCache: () => post('/admin/system/flush-cache', {}),
};

export const passwordApi = {
  forgot: (email) => post('/password/forgot', { email }, { auth: false }),
  reset: (body) => post('/password/reset', body, { auth: false }),
};

export const confirmEmailApi = {
  send: () => post('/confirm-email/send', {}),
  verify: (code) => post('/confirm-email/verify', { code }),
};

export { API_URL };
