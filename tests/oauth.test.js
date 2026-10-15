import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import crypto from 'node:crypto';
import { api, createUser, registerUser, authHeaderFor, User } from './helpers.js';
import OAuthAccount from '../src/models/OAuthAccount.js';
import RefreshToken from '../src/models/RefreshToken.js';
import env from '../src/config/env.js';
import { createFlow, signFlow } from '../src/utils/oauthFlow.js';
import { setGoogleOidcClient } from '../src/services/googleOidcClient.js';
import { enlargeGooglePhoto, GOOGLE_PHOTO_SIZE } from '../src/utils/googlePhoto.js';

/**
 * Google OAuth 2.0 / OIDC tests.
 *
 * Google is NEVER contacted: a fake client exposing the same surface as
 * google-auth-library is injected through `setGoogleOidcClient()`. The fake
 * still performs real PKCE verification (sha256(verifier) === challenge) and
 * a real redirect_uri comparison, so a broken pairing fails the suite.
 */

const COOKIE = env.oauth.cookieName;
const DEFAULT_CLIENT_ID = 'test-client-id.apps.googleusercontent.com';
const DEFAULT_CLIENT_SECRET = 'test-client-secret';
const DEFAULT_REDIRECT_URI = 'http://localhost:3000/api/v1/auth/google/callback';

const DEFAULT_PROFILE = {
  sub: 'google-sub-0001',
  email: 'googler@example.com',
  email_verified: true,
  name: 'Go Ogle',
  picture: 'https://lh3.example.com/avatar.png',
};

const createFakeGoogle = () => ({
  profile: { ...DEFAULT_PROFILE },
  nonce: null,
  challenge: null,
  lastAuthUrl: null,
  failExchange: false,
  failVerify: false,
  nonceOverride: undefined,
  usedCode: false,
  codeVerifierSeen: null,
  tokenCalls: 0,

  async generateCodeVerifierAsync() {
    const codeVerifier = crypto.randomBytes(48).toString('base64url');
    const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url');
    return { codeVerifier, codeChallenge };
  },

  generateAuthUrl(opts) {
    // Mirrors google-auth-library: response_type / client_id / redirect_uri
    // default from the client configuration when the caller omits them.
    const merged = {
      response_type: 'code',
      client_id: env.oauth.clientId,
      redirect_uri: env.oauth.redirectUri,
      ...opts,
    };

    const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    for (const [key, value] of Object.entries(merged)) {
      if (value === undefined || value === null) continue;
      url.searchParams.set(key, Array.isArray(value) ? value.join(' ') : String(value));
    }

    // Each consent request mints a fresh authorization code.
    this.usedCode = false;
    this.lastAuthUrl = url;
    this.nonce = opts.nonce;
    this.challenge = opts.code_challenge;
    return url.toString();
  },

  async getToken({ code, codeVerifier, redirect_uri }) {
    this.tokenCalls += 1;
    this.codeVerifierSeen = codeVerifier;

    if (this.failExchange) throw new Error('invalid_grant');

    // RFC 6749 §4.1.2: an authorization code is single use.
    if (this.usedCode) throw new Error('invalid_grant');

    // Real PKCE verification: the verifier that reached the token endpoint
    // must hash back to the challenge we published in the consent URL.
    const derived = crypto
      .createHash('sha256')
      .update(String(codeVerifier || ''))
      .digest('base64url');
    if (derived !== this.challenge) throw new Error('PKCE mismatch');

    if (code !== 'valid-code') throw new Error('invalid_grant');
    if (redirect_uri !== env.oauth.redirectUri) throw new Error('redirect_uri mismatch');

    this.usedCode = true;
    return { tokens: { id_token: 'fake-google-id-token' } };
  },

  async verifyIdToken({ idToken }) {
    if (this.failVerify) throw new Error('Wrong recipient, signature mismatch or token expired');
    if (idToken !== 'fake-google-id-token') throw new Error('unexpected id_token');

    return {
      getPayload: () => ({
        ...this.profile,
        nonce: this.nonceOverride !== undefined ? this.nonceOverride : this.nonce,
      }),
    };
  },
});

/** Accept either a `Bearer x` string or an Authorization header object. */
const authHeader = (value) => (typeof value === 'string' ? { Authorization: value } : value);

let fake;

beforeEach(() => {
  fake = createFakeGoogle();
  setGoogleOidcClient(fake);
});

afterEach(() => {
  setGoogleOidcClient(null);
  delete process.env.OAUTH_REDIRECT_URL;
  process.env.GOOGLE_CLIENT_ID = DEFAULT_CLIENT_ID;
  process.env.GOOGLE_CLIENT_SECRET = DEFAULT_CLIENT_SECRET;
  process.env.GOOGLE_REDIRECT_URI = DEFAULT_REDIRECT_URI;
});

/* ----------------------------------------------------------------- helpers */

const cookieAttributes = (setCookie) => {
  const header = (setCookie || []).find((value) => value.startsWith(`${COOKIE}=`));
  if (!header) return { header: null, attrs: [], parts: [] };
  return {
    header,
    parts: header.split(';').map((part) => part.trim()),
    attrs: header
      .split(';')
      .slice(1)
      .map((part) => part.trim()),
  };
};

const extractCookie = (setCookie) => cookieAttributes(setCookie).header?.split(';')[0] ?? null;

/** GET /auth/google and pull everything the browser would carry back. */
const startFlow = async (query = {}) => {
  const res = await api.get('/api/v1/auth/google').query(query);
  expect(res.status).toBe(302);

  const location = new URL(res.headers.location);
  const { attrs } = cookieAttributes(res.headers['set-cookie']);

  return {
    res,
    location,
    attrs,
    cookie: extractCookie(res.headers['set-cookie']),
    setCookie: (res.headers['set-cookie'] || []).join(' | '),
    state: location.searchParams.get('state'),
    nonce: location.searchParams.get('nonce'),
  };
};

/** GET /auth/google/callback the way the browser would after Google. */
const complete = ({ cookie, state, query = {} }) => {
  let req = api.get('/api/v1/auth/google/callback').query({ state, ...query });
  if (cookie) req = req.set('Cookie', cookie);
  return req;
};

/** Full login: start the flow, then come back through the callback. */
const fullLogin = async (query = {}) => {
  const flow = await startFlow();
  const res = await complete({
    cookie: flow.cookie,
    state: flow.state,
    query: { code: 'valid-code', ...query },
  });
  return { res, data: res.body?.data, flow };
};

/** Link the caller to the current fake Google identity through the UI flow. */
const linkViaFlow = async (authorization) => {
  const start = await api
    .post('/api/v1/auth/google/link')
    .set(authHeader(authorization))
    .send({});
  expect(start.status).toBe(200);

  const url = new URL(start.body.data.authorizationUrl);
  return complete({
    cookie: extractCookie(start.headers['set-cookie']),
    state: url.searchParams.get('state'),
    query: { code: 'valid-code' },
  });
};

/* ------------------------------------------------------------------ suites */

describe('Google OAuth — starting the flow', () => {
  it('redirects to Google with state, PKCE and a nonce', async () => {
    const { location, attrs } = await startFlow();

    expect(location.host).toBe('accounts.google.com');
    expect(location.searchParams.get('response_type')).toBe('code');
    expect(location.searchParams.get('client_id')).toBe(env.oauth.clientId);
    expect(location.searchParams.get('redirect_uri')).toBe(env.oauth.redirectUri);
    expect(location.searchParams.get('scope')).toBe('openid email profile');
    expect(location.searchParams.get('code_challenge_method')).toBe('S256');
    expect(location.searchParams.get('code_challenge')).toMatch(/^[A-Za-z0-9_-]{40,}$/);
    expect(location.searchParams.get('state')).toMatch(/^[A-Za-z0-9_-]{40,}$/);
    expect(location.searchParams.get('nonce')).toMatch(/^[A-Za-z0-9_-]{40,}$/);
    expect(location.searchParams.get('prompt')).toBe('select_account');

    // The flow travels in an HttpOnly, SameSite=Lax cookie scoped to OAuth.
    expect(attrs).toContain('HttpOnly');
    expect(attrs).toContain('SameSite=Lax');
    expect(attrs).toContain(`Path=/api/v1/auth/google`);
    expect(attrs.some((attr) => attr.toLowerCase() === 'secure')).toBe(false); // no TLS in tests
  });

  it('forwards login_hint but nothing else from the query string', async () => {
    const { location } = await startFlow({
      login_hint: 'someone@example.com',
      redirect_uri: 'https://evil.example/steal',
      client_id: 'attacker-client',
      purpose: 'admin',
    });

    expect(location.searchParams.get('login_hint')).toBe('someone@example.com');
    // redirect_uri / client_id come from the environment, never the request.
    expect(location.searchParams.get('redirect_uri')).toBe(DEFAULT_REDIRECT_URI);
    expect(location.searchParams.get('client_id')).toBe(DEFAULT_CLIENT_ID);
    expect(location.searchParams.has('purpose')).toBe(false);
    expect(location.href).not.toContain('evil.example');
  });

  it('never echoes secrets back to the browser', async () => {
    const { setCookie, res } = await startFlow();
    const blob = `${setCookie}|${JSON.stringify(res.headers)}|${res.headers.location}`;

    expect(blob).not.toContain(env.oauth.clientSecret);
    expect(blob).not.toContain(env.oauth.cookieSecret);
    expect(blob).not.toContain('access_secret');
  });

  it('returns 400 OAUTH_NOT_CONFIGURED when Google credentials are absent', async () => {
    delete process.env.GOOGLE_CLIENT_ID;

    try {
      const res = await api.get('/api/v1/auth/google');
      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({ success: false, code: 'OAUTH_NOT_CONFIGURED' });
      expect(res.headers['set-cookie']).toBeUndefined();

      const flow = createFlow();
      const callback = await api
        .get('/api/v1/auth/google/callback')
        .set('Cookie', `${COOKIE}=${signFlow(flow)}`)
        .query({ code: 'valid-code', state: flow.s });
      expect(callback.status).toBe(400);
      expect(callback.body.code).toBe('OAUTH_NOT_CONFIGURED');
    } finally {
      process.env.GOOGLE_CLIENT_ID = DEFAULT_CLIENT_ID;
    }
  });
});

describe('Google OAuth — happy path', () => {
  it('creates a Google-only account and returns the standard token pair', async () => {
    const { res, data } = await fullLogin();

    expect(res.status).toBe(201);
    expect(res.body.message).toBe('Account created successfully');
    expect(data.created).toBe(true);
    expect(data.accessToken).toBeTruthy();
    expect(data.refreshToken).toBeTruthy();
    expect(data.tokenType).toBe('Bearer');
    expect(data.expiresIn).toBe(900);

    expect(data.user.role).toBe('user');
    expect(data.user.authProvider).toBe('google');
    expect(data.user.isVerified).toBe(true);
    expect(data.user.email).toBe('googler@example.com');
    expect(data.user.username).toMatch(/^[a-z0-9_]{3,30}$/);
    expect(data.user.password).toBeUndefined();
    expect(data.user.deletedAt).toBeUndefined();

    expect(await User.countDocuments()).toBe(1);
    const [stored] = await User.find({}).select('+password');
    expect(stored.password).toBeFalsy();

    const accounts = await OAuthAccount.find({});
    expect(accounts).toHaveLength(1);
    expect(accounts[0].provider).toBe('google');
    expect(accounts[0].providerId).toBe('google-sub-0001');
    expect(String(accounts[0].user)).toBe(String(data.user._id));
  });

  it('sends the PKCE verifier that matches the challenge it published', async () => {
    const { res } = await fullLogin();

    expect(res.status).toBe(201);
    expect(fake.tokenCalls).toBe(1);
    expect(fake.codeVerifierSeen).toMatch(/^[A-Za-z0-9_-]{40,}$/);

    const derived = crypto.createHash('sha256').update(fake.codeVerifierSeen).digest('base64url');
    expect(derived).toBe(fake.challenge);
  });

  it('reuses the same account on a second sign-in', async () => {
    const first = await fullLogin();
    const second = await fullLogin();

    expect(second.res.status).toBe(200);
    expect(second.data.created).toBe(false);
    expect(second.data.user._id).toBe(first.data.user._id);

    expect(await User.countDocuments()).toBe(1);
    expect(await OAuthAccount.countDocuments()).toBe(1);
  });

  it('issues tokens that work with the existing auth + refresh system', async () => {
    const { data } = await fullLogin();

    const me = await api
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${data.accessToken}`);
    expect(me.status).toBe(200);
    expect(me.body.data.user.username).toBe(data.user.username);

    const refreshed = await api
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: data.refreshToken });
    expect(refreshed.status).toBe(200);
    expect(refreshed.body.data.accessToken).toBeTruthy();
    expect(await RefreshToken.countDocuments()).toBeGreaterThan(0);
  });

  it('tolerates the extra query parameters Google appends to the callback', async () => {
    const flow = await startFlow();
    const res = await complete({
      cookie: flow.cookie,
      state: flow.state,
      query: {
        code: 'valid-code',
        scope: 'openid email profile',
        authuser: '0',
        prompt: 'select_account',
        session_state: 'abc',
        iss: 'https://accounts.google.com',
      },
    });

    expect(res.status).toBe(201);
  });
});

describe('Google OAuth — CSRF, replay and forgery', () => {
  it('rejects a state that does not match the signed cookie', async () => {
    const { cookie } = await startFlow();
    const res = await complete({ cookie, state: 'a'.repeat(43), query: { code: 'valid-code' } });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('OAUTH_STATE_MISMATCH');
    expect(await User.countDocuments()).toBe(0);
    expect(fake.tokenCalls).toBe(0);
  });

  it('rejects a callback with no flow cookie at all', async () => {
    const res = await api
      .get('/api/v1/auth/google/callback')
      .query({ code: 'valid-code', state: 'b'.repeat(43) });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('OAUTH_STATE_MISMATCH');
    expect(await User.countDocuments()).toBe(0);
  });

  it('rejects a tampered flow cookie', async () => {
    const { cookie, state } = await startFlow();
    const forged = cookie.replace(/\.[A-Za-z0-9_-]+$/, `.${'f'.repeat(43)}`);

    const res = await complete({ cookie: forged, state, query: { code: 'valid-code' } });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('OAUTH_STATE_MISMATCH');
    expect(await User.countDocuments()).toBe(0);
    expect(fake.tokenCalls).toBe(0);
  });

  it('reports an expired flow as OAUTH_STATE_EXPIRED', async () => {
    const flow = createFlow({ purpose: 'login', ttlMs: -1000 });

    const res = await api
      .get('/api/v1/auth/google/callback')
      .set('Cookie', `${COOKIE}=${signFlow(flow)}`)
      .query({ code: 'valid-code', state: flow.s });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('OAUTH_STATE_EXPIRED');
    expect(await User.countDocuments()).toBe(0);
    expect(fake.tokenCalls).toBe(0);
  });

  it('consumes the flow cookie so a replayed callback fails', async () => {
    const { cookie, state } = await startFlow();

    const first = await complete({ cookie, state, query: { code: 'valid-code' } });
    expect(first.status).toBe(201);

    const cleared = cookieAttributes(first.headers['set-cookie']).header;
    expect(cleared).toBeTruthy();
    expect(cleared).toContain('Expires=Thu, 01 Jan 1970');

    // Browser perspective: the cookie was cleared, so nothing can be verified.
    const browserReplay = await api
      .get('/api/v1/auth/google/callback')
      .query({ code: 'valid-code', state });
    expect(browserReplay.status).toBe(400);
    expect(browserReplay.body.code).toBe('OAUTH_STATE_MISMATCH');

    // Attacker perspective: even replaying the stolen cookie, the SAME
    // authorization code is rejected because codes are single use.
    const codeReplay = await complete({ cookie, state, query: { code: 'valid-code' } });
    expect(codeReplay.status).toBe(401);
    expect(codeReplay.body.code).toBe('OAUTH_CODE_EXCHANGE_FAILED');

    expect(await User.countDocuments()).toBe(1);
    expect(await RefreshToken.countDocuments()).toBe(1);
    expect(fake.tokenCalls).toBe(2);
  });

  it('rejects a callback whose issuer hint is not Google', async () => {
    const { cookie, state } = await startFlow();
    const res = await complete({
      cookie,
      state,
      query: { code: 'valid-code', iss: 'https://evil.example' },
    });

    expect(res.status).toBe(401);
    expect(res.body.code).toBe('OAUTH_ID_TOKEN_INVALID');
    expect(await User.countDocuments()).toBe(0);
    expect(fake.tokenCalls).toBe(0);
  });
});

describe('Google OAuth — consent, verification and exchange failures', () => {
  it('handles the user cancelling consent (access_denied)', async () => {
    const { cookie, state } = await startFlow();
    const res = await complete({
      cookie,
      state,
      query: { error: 'access_denied', error_description: 'User denied' },
    });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('OAUTH_ACCESS_DENIED');
    expect(fake.tokenCalls).toBe(0);
    expect(await User.countDocuments()).toBe(0);
  });

  it('maps any other Google-reported error to OAUTH_CODE_EXCHANGE_FAILED', async () => {
    const { cookie, state } = await startFlow();
    const res = await complete({ cookie, state, query: { error: 'invalid_request' } });

    expect(res.status).toBe(401);
    expect(res.body.code).toBe('OAUTH_CODE_EXCHANGE_FAILED');
  });

  it('returns 401 when the code exchange fails (invalid or replayed code)', async () => {
    fake.failExchange = true;

    const { res } = await fullLogin();
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('OAUTH_CODE_EXCHANGE_FAILED');
    expect(await User.countDocuments()).toBe(0);
    expect(await RefreshToken.countDocuments()).toBe(0);
  });

  it('returns 401 when the ID token cannot be verified', async () => {
    fake.failVerify = true;

    const { res } = await fullLogin();
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('OAUTH_ID_TOKEN_INVALID');
    expect(await User.countDocuments()).toBe(0);
  });

  it('rejects an ID token whose nonce is not the one we issued', async () => {
    fake.nonceOverride = 'attacker-controlled-nonce-value-here';

    const { res } = await fullLogin();
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('OAUTH_ID_TOKEN_INVALID');
    expect(await User.countDocuments()).toBe(0);
  });

  it('rejects a Google identity with no verified email', async () => {
    fake.profile = { ...DEFAULT_PROFILE, email_verified: false };

    const { res } = await fullLogin();
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('OAUTH_EMAIL_NOT_VERIFIED');
    expect(await User.countDocuments()).toBe(0);
  });
});

describe('Google OAuth — account-takeover protections', () => {
  it('refuses to auto-link when the email already belongs to a local account', async () => {
    const local = await createUser({ email: 'googler@example.com' });

    const { res } = await fullLogin();

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('OAUTH_ACCOUNT_CONFLICT');
    expect(res.body.details).toMatchObject({ email: 'googler@example.com' });

    // Nothing was created, linked, or taken over.
    expect(await User.countDocuments()).toBe(1);
    expect(await OAuthAccount.countDocuments()).toBe(0);
    expect(await RefreshToken.countDocuments()).toBe(0);

    const untouched = await User.findById(local._id).select('+password');
    expect(untouched.password).toBeTruthy();
    expect(untouched.authProvider).toBe('local');
  });

  it('blocks linking a Google identity whose verified email belongs to someone else', async () => {
    await createUser({ email: 'shared@example.com' });
    const other = await authHeaderFor();

    fake.profile = { ...DEFAULT_PROFILE, sub: 'sub-conflict', email: 'shared@example.com' };
    const res = await linkViaFlow(other.authorization);

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('OAUTH_ACCOUNT_CONFLICT');
    expect(await OAuthAccount.countDocuments()).toBe(0);
    expect(await User.countDocuments()).toBe(2);
  });

  it('blocks linking a Google identity that is already linked to another user', async () => {
    const first = await authHeaderFor();
    const second = await authHeaderFor();

    const linked = await linkViaFlow(first.authorization);
    expect(linked.status).toBe(200);

    const conflict = await linkViaFlow(second.authorization);
    expect(conflict.status).toBe(409);
    expect(conflict.body.code).toBe('OAUTH_ALREADY_LINKED');
    expect(await OAuthAccount.countDocuments()).toBe(1);
    expect(await User.countDocuments()).toBe(2);
  });

  it('refuses Google sign-in for a disabled account', async () => {
    const { data } = await fullLogin();
    await User.updateOne({ _id: data.user._id }, { $set: { isActive: false } });

    const second = await fullLogin();
    expect(second.res.status).toBe(401);
    expect(second.res.body.code).toBe('ACCOUNT_DISABLED');
  });
});

describe('Google OAuth — explicit account linking', () => {
  it('requires authentication to start the link flow', async () => {
    const res = await api.post('/api/v1/auth/google/link').send({});
    expect(res.status).toBe(401);
  });

  it('rejects unknown fields on the link start body (no privilege escalation)', async () => {
    const { authorization } = await authHeaderFor();
    const res = await api
      .post('/api/v1/auth/google/link')
      .set(authorization)
      .send({ role: 'admin', isVerified: true });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('links a Google identity and then signs in through it without a duplicate account', async () => {
    const local = await authHeaderFor();

    const linked = await linkViaFlow(local.authorization);
    expect(linked.status).toBe(200);
    expect(linked.body.data).toMatchObject({ linked: true, alreadyLinked: false });
    expect(await OAuthAccount.countDocuments()).toBe(1);

    const login = await fullLogin();
    expect(login.res.status).toBe(200);
    expect(login.data.created).toBe(false);
    expect(login.data.user._id).toBe(local.user._id);

    expect(await User.countDocuments()).toBe(1);
  });

  it('is idempotent when the same Google identity is linked twice', async () => {
    const local = await authHeaderFor();

    expect((await linkViaFlow(local.authorization)).status).toBe(200);
    const again = await linkViaFlow(local.authorization);

    expect(again.status).toBe(200);
    expect(again.body.data).toMatchObject({ linked: true, alreadyLinked: true });
    expect(await OAuthAccount.countDocuments()).toBe(1);
  });

  it('marks the account verified when Google confirms the existing email', async () => {
    const email = `${Math.random().toString(36).slice(2, 10)}@example.com`;
    const local = await registerUser({ email });

    fake.profile = { ...DEFAULT_PROFILE, sub: 'sub-verify', email, email_verified: true };
    const res = await linkViaFlow(`Bearer ${local.data.accessToken}`);

    expect(res.status).toBe(200);

    const reloaded = await User.findById(local.data.user._id);
    expect(reloaded.isVerified).toBe(true);
    expect(reloaded.email).toBe(email);
    expect(reloaded.authProvider).toBe('local'); // password stays the primary method
  });

  it('lists the linked providers without leaking anything sensitive', async () => {
    const local = await authHeaderFor();
    await linkViaFlow(local.authorization);

    const res = await api.get('/api/v1/auth/google/links').set(local.authorization);

    expect(res.status).toBe(200);
    expect(res.body.data.links).toHaveLength(1);
    expect(res.body.data.links[0]).toMatchObject({
      provider: 'google',
      providerId: 'google-sub-0001',
    });
    expect(res.body.data.hasPassword).toBe(true);
    expect(JSON.stringify(res.body.data)).not.toContain('password');
  });
});

describe('Google OAuth — unlinking', () => {
  it('refuses to unlink the only sign-in method (lockout prevention)', async () => {
    const { data } = await fullLogin(); // Google-only account, no password

    const res = await api
      .delete('/api/v1/auth/google/link')
      .set('Authorization', `Bearer ${data.accessToken}`);

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('OAUTH_LAST_LOGIN_METHOD');
    expect(await OAuthAccount.countDocuments()).toBe(1);
  });

  it('unlinks Google when a password exists', async () => {
    const local = await authHeaderFor();
    await linkViaFlow(local.authorization);

    const res = await api.delete('/api/v1/auth/google/link').set(local.authorization);

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ unlinked: true });
    expect(await OAuthAccount.countDocuments()).toBe(0);

    const links = await api.get('/api/v1/auth/google/links').set(local.authorization);
    expect(links.body.data.links).toHaveLength(0);
    expect(links.body.data.hasPassword).toBe(true);
  });

  it('returns 400 OAUTH_NOT_LINKED when there is nothing to unlink', async () => {
    const local = await authHeaderFor();
    const res = await api.delete('/api/v1/auth/google/link').set(local.authorization);

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('OAUTH_NOT_LINKED');
  });

  it('requires authentication', async () => {
    const res = await api.delete('/api/v1/auth/google/link');
    expect(res.status).toBe(401);
  });
});

describe('Google OAuth — redirect mode (handoff instead of tokens in the URL)', () => {
  const SPA = 'http://localhost:5173/auth/google';

  beforeEach(() => {
    process.env.OAUTH_REDIRECT_URL = SPA;
  });

  it('redirects with a one-time handoff code and never exposes tokens', async () => {
    const { cookie, state } = await startFlow();
    const res = await complete({ cookie, state, query: { code: 'valid-code' } });

    expect(res.status).toBe(302);

    const target = new URL(res.headers.location);
    expect(`${target.origin}${target.pathname}`).toBe(SPA);
    expect(res.headers.location).not.toContain('accessToken');
    expect(res.headers.location).not.toContain('refreshToken');

    const handoff = target.searchParams.get('handoff');
    expect(handoff).toMatch(/^[A-Za-z0-9_-]{40,}$/);

    // Tokens must not exist before the exchange happens.
    expect(await RefreshToken.countDocuments()).toBe(0);
    expect(await User.countDocuments()).toBe(1);

    const exchanged = await api.post('/api/v1/auth/google/exchange').send({ handoff });
    expect(exchanged.status).toBe(200);
    expect(exchanged.body.data.accessToken).toBeTruthy();
    expect(exchanged.body.data.created).toBe(true);
    expect(exchanged.body.data.user.password).toBeUndefined();

    // Single use: a replay of the handoff fails.
    const replay = await api.post('/api/v1/auth/google/exchange').send({ handoff });
    expect(replay.status).toBe(401);
    expect(replay.body.code).toBe('OAUTH_HANDOFF_INVALID');
    expect(await RefreshToken.countDocuments()).toBe(1);
  });

  it('confirms a link without minting a second token pair', async () => {
    const local = await authHeaderFor();
    const tokensBefore = await RefreshToken.countDocuments(); // from registration

    const start = await api
      .post('/api/v1/auth/google/link')
      .set(local.authorization)
      .send({});
    const url = new URL(start.body.data.authorizationUrl);

    const res = await complete({
      cookie: extractCookie(start.headers['set-cookie']),
      state: url.searchParams.get('state'),
      query: { code: 'valid-code' },
    });

    expect(res.status).toBe(302);
    const handoff = new URL(res.headers.location).searchParams.get('handoff');

    const exchanged = await api.post('/api/v1/auth/google/exchange').send({ handoff });
    expect(exchanged.status).toBe(200);
    expect(exchanged.body.data).toMatchObject({ linked: true });
    expect(exchanged.body.data.accessToken).toBeUndefined();
    expect(await RefreshToken.countDocuments()).toBe(tokensBefore);
    expect(await OAuthAccount.countDocuments()).toBe(1);
  });

  it('sends an error code instead of tokens when the flow fails', async () => {
    const { cookie, state } = await startFlow();
    const res = await complete({ cookie, state, query: { error: 'access_denied' } });

    expect(res.status).toBe(302);
    const target = new URL(res.headers.location);
    expect(`${target.origin}${target.pathname}`).toBe(SPA);
    expect(target.searchParams.get('error')).toBe('OAUTH_ACCESS_DENIED');
    expect(target.searchParams.get('handoff')).toBeNull();
    expect(target.searchParams.get('error_description')).toBeTruthy();
  });

  it('rejects a malformed or unknown handoff code', async () => {
    const tooShort = await api.post('/api/v1/auth/google/exchange').send({ handoff: 'short' });
    expect(tooShort.status).toBe(400);
    expect(tooShort.body.code).toBe('VALIDATION_ERROR');

    const unknown = await api
      .post('/api/v1/auth/google/exchange')
      .send({ handoff: crypto.randomBytes(32).toString('base64url') });
    expect(unknown.status).toBe(401);
    expect(unknown.body.code).toBe('OAUTH_HANDOFF_INVALID');

    expect(await RefreshToken.countDocuments()).toBe(0);
  });
});

describe('Google OAuth — configuration guards', () => {
  it('refuses the link flow when Google is not configured', async () => {
    const { authorization } = await authHeaderFor();
    delete process.env.GOOGLE_CLIENT_SECRET;

    try {
      const res = await api.post('/api/v1/auth/google/link').set(authorization).send({});
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('OAUTH_NOT_CONFIGURED');
    } finally {
      process.env.GOOGLE_CLIENT_SECRET = DEFAULT_CLIENT_SECRET;
    }
  });

  it('keeps the flow cookie out of the response when configuration is missing', async () => {
    delete process.env.GOOGLE_REDIRECT_URI;

    try {
      const res = await api.get('/api/v1/auth/google');
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('OAUTH_NOT_CONFIGURED');
      expect(res.headers['set-cookie']).toBeUndefined();
    } finally {
      process.env.GOOGLE_REDIRECT_URI = DEFAULT_REDIRECT_URI;
    }
  });
});

/* ------------------------------------------------------------------ *
 * Google profile photo
 *
 * Google's `picture` claim is a 64px thumbnail, which is soft at the sizes
 * the UI renders. The size is a server-side parameter, so we rewrite the
 * number and keep every flag after it. Nothing else about the URL may change.
 * ------------------------------------------------------------------ */

describe('enlargeGooglePhoto', () => {
  it('asks Google for the larger size, keeping the flags that follow', () => {
    expect(
      enlargeGooglePhoto('https://lh3.googleusercontent.com/ogw/AF2bZyi0X=s64-c-mo'),
    ).toBe('https://lh3.googleusercontent.com/ogw/AF2bZyi0X=s192-c-mo');
  });

  it('keeps `-c` so the avatar stays square rather than oval', () => {
    expect(enlargeGooglePhoto('https://lh3.googleusercontent.com/a/pic=s64-c')).toBe(
      'https://lh3.googleusercontent.com/a/pic=s192-c',
    );
  });

  it('replaces the number only — the path and query are byte-identical', () => {
    const input = 'https://lh3.googleusercontent.com/ogw/ABCD=s64';
    const output = enlargeGooglePhoto(input);
    expect(output).toBe('https://lh3.googleusercontent.com/ogw/ABCD=s192');
    expect(output.replace('=s192', '=s64')).toBe(input);
    expect(output.slice(0, output.indexOf('=s'))).toBe(input.slice(0, input.indexOf('=s')));
  });

  it('leaves any host we do not recognise alone', () => {
    for (const url of [
      'https://lh3.example.com/avatar.png',
      'https://example.com/s64.png',
      'http://evil.test/lh3.googleusercontent.com/s64',
      'https://notgoogleusercontent.com/x=s64',
    ]) {
      expect(enlargeGooglePhoto(url)).toBe(url);
    }
  });

  it('leaves URLs with no size parameter alone', () => {
    const url = 'https://lh3.googleusercontent.com/ogw/AF2bZyi0X';
    expect(enlargeGooglePhoto(url)).toBe(url);
  });

  it('passes empty and non-string claims through untouched', () => {
    expect(enlargeGooglePhoto('')).toBe('');
    expect(enlargeGooglePhoto('   ')).toBe('');
    expect(enlargeGooglePhoto(undefined)).toBe('');
    expect(enlargeGooglePhoto(null)).toBe('');
    expect(enlargeGooglePhoto(12345)).toBe('');
  });

  it('exposes the size it asks for', () => {
    expect(GOOGLE_PHOTO_SIZE).toBeGreaterThanOrEqual(192);
  });
});

describe('Google profile photo — stored on the account', () => {
  const GOOGLE_PIC = 'https://lh3.googleusercontent.com/ogw/AF2bZyi0XOpQe_5P93kc7Aqfxzc1R9rOjmq9=s64-c-mo';

  it('stores the enlarged URL when it creates the account', async () => {
    fake.profile = {
      ...DEFAULT_PROFILE,
      sub: 'sub-avatar-create',
      email: 'avatar_create@example.com',
      picture: GOOGLE_PIC,
    };

    const { data } = await fullLogin();

    expect(data.user.avatar).toBe(GOOGLE_PIC.replace('=s64-c-mo', '=s192-c-mo'));
  });

  it('does not clobber an avatar the user chose themselves', async () => {
    fake.profile = {
      ...DEFAULT_PROFILE,
      sub: 'sub-avatar-existing',
      email: 'avatar_existing@example.com',
      picture: GOOGLE_PIC,
    };

    await fullLogin();

    const custom = 'https://cdn.example.com/me/drawn-by-hand.png';
    await User.updateOne({ email: 'avatar_existing@example.com' }, { $set: { avatar: custom } });

    const { data } = await fullLogin();

    expect(data.user.avatar).toBe(custom);
  });

  it('enlarges a recognised URL but never rewrites an unrecognised one', async () => {
    fake.profile = {
      ...DEFAULT_PROFILE,
      sub: 'sub-avatar-foreign',
      email: 'avatar_foreign@example.com',
      picture: 'https://lh3.example.com/avatar.png',
    };

    const { data } = await fullLogin();

    expect(data.user.avatar).toBe('https://lh3.example.com/avatar.png');
  });
});
