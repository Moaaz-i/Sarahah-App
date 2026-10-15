import crypto from 'node:crypto';
import env from '../config/env.js';

/**
 * Signed, short-lived OAuth flow state.
 *
 * The whole bundle (purpose, state, PKCE code_verifier, OIDC nonce and the
 * optional linking user) travels between the "start" request and the Google
 * callback inside ONE HttpOnly cookie:
 *
 * - HttpOnly  -> JavaScript (and XSS) cannot read the PKCE verifier or nonce.
 * - SameSite=Lax -> it is still sent on the top-level GET redirect coming back
 *   from Google, but not on cross-site sub-requests (CSRF mitigation).
 * - Path scoped to the OAuth endpoints only.
 * - HMAC-SHA256 signed -> the browser cannot tamper with any field.
 * - Short TTL -> a stale flow cannot be replayed later.
 *
 * `state` is additionally compared with a timing-safe equality on callback,
 * and the OIDC `nonce` is checked against the ID token claims.
 */

const FLOW_VERSION = 1;

const b64url = (buf) => Buffer.from(buf).toString('base64url');

/** Cryptographically random, URL-safe secret. */
export const randomToken = (bytes = 32) => b64url(crypto.randomBytes(bytes));

export const signFlow = (payload) => {
  const body = b64url(JSON.stringify(payload));
  const mac = crypto
    .createHmac('sha256', env.oauth.cookieSecret)
    .update(body)
    .digest('base64url');
  return `${body}.${mac}`;
};

/** Returns the parsed flow, or null when it is forged, malformed or expired. */
export const verifySignedFlow = (cookieValue) => {
  if (typeof cookieValue !== 'string' || cookieValue.length === 0) return null;

  const separator = cookieValue.lastIndexOf('.');
  if (separator <= 0) return null;

  const body = cookieValue.slice(0, separator);
  const mac = cookieValue.slice(separator + 1);

  const expected = crypto
    .createHmac('sha256', env.oauth.cookieSecret)
    .update(body)
    .digest('base64url');

  const macBuf = Buffer.from(mac, 'utf8');
  const expectedBuf = Buffer.from(expected, 'utf8');
  if (macBuf.length !== expectedBuf.length) return null;
  if (!crypto.timingSafeEqual(macBuf, expectedBuf)) return null;

  let payload;
  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  } catch {
    return null;
  }

  if (!payload || payload.v !== FLOW_VERSION) return null;
  // Expiry is deliberately NOT checked here: assertFlow() reports the precise
  // "session expired" reason instead of a misleading state mismatch.
  if (typeof payload.e !== 'number') return null;
  if (typeof payload.s !== 'string' || payload.s.length < 20) return null;
  if (typeof payload.vf !== 'string' || payload.vf.length < 40) return null;
  if (typeof payload.n !== 'string' || payload.n.length < 20) return null;

  return payload;
};

/**
 * Build the flow object for a start request.
 * `codeVerifier` may be supplied so it is exactly the PKCE verifier whose
 * challenge was placed in the consent URL (they MUST be a matching pair).
 */
export const createFlow = ({
  purpose = 'login',
  userId = null,
  codeVerifier = null,
  ttlMs,
} = {}) => {
  const now = Date.now();
  return {
    v: FLOW_VERSION,
    p: purpose, // 'login' | 'link'
    u: userId ? String(userId) : null,
    s: randomToken(32), // state (CSRF)
    vf: codeVerifier || randomToken(48), // PKCE code_verifier
    n: randomToken(32), // OIDC nonce
    i: now,
    e: now + (ttlMs ?? env.oauth.flowTtlMs),
  };
};

/**
 * Cookie options for the flow cookie.
 * `clear: true` drops `maxAge` so Express can emit a matching deletion.
 */
export const flowCookieOptions = ({ clear = false } = {}) => ({
  httpOnly: true,
  secure: env.isProduction, // must be true behind TLS in production
  sameSite: 'lax', // sent on the top-level redirect back from Google
  path: '/api/v1/auth/google', // only the OAuth endpoints ever see it
  ...(clear ? {} : { maxAge: env.oauth.flowTtlMs }),
});

/** Timing-safe comparison of two short ASCII strings. */
export const safeEqual = (a, b) => {
  const bufA = Buffer.from(String(a ?? ''), 'utf8');
  const bufB = Buffer.from(String(b ?? ''), 'utf8');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
};

export default { createFlow, verifySignedFlow, flowCookieOptions, randomToken, safeEqual };
