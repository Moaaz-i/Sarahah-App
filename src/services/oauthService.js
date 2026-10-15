import mongoose from 'mongoose';
import User from '../models/User.js';
import OAuthAccount from '../models/OAuthAccount.js';
import AuditLog from '../models/AuditLog.js';
import AppError from '../utils/AppError.js';
import { ERROR_CODES } from '../constants/messages.js';
import { ROLES } from '../constants/roles.js';
import { sanitizeUser } from '../utils/sanitizeUser.js';
import * as tokenService from './tokenService.js';
import * as google from './googleOidcClient.js';
import { createFlow, safeEqual } from '../utils/oauthFlow.js';
import { enlargeGooglePhoto } from '../utils/googlePhoto.js';

/**
 * Google OAuth 2.0 / OIDC service.
 *
 * Security model
 * --------------
 * - `state` (CSRF), the PKCE `code_verifier` and the OIDC `nonce` are created
 *   here, travel to Google and come back through a signed HttpOnly cookie.
 *   The callback verifies all three before doing anything else.
 * - The authorization code is exchanged server-side; `redirect_uri` comes from
 *   the environment and is never read from the request.
 * - The ID token is verified by Google's official client (signature against
 *   Google's public keys + issuer + audience + expiry). Browser-supplied data
 *   is never trusted on its own.
 * - We NEVER auto-link a Google identity to an existing account based on an
 *   email match. Local signups do not verify emails, so silent linking would
 *   be an account-takeover vector: a conflicting email returns 409 and the
 *   user must sign in with their password and link Google explicitly.
 * - An email is only stored when Google reports it as verified.
 */

/** Audit retention: 1 year. */
const auditRetention = () => new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);

const assertConfigured = () => {
  if (!google.isConfigured()) {
    throw new AppError(
      400,
      ERROR_CODES.OAUTH_NOT_CONFIGURED,
      'Google sign-in is not configured on this server',
    );
  }
};

/**
 * Reduce Google's ID-token claims to the fields we actually use.
 * Anything Google did not verify is dropped rather than trusted.
 */
export const normalizeProfile = (profile) => {
  const providerId = String(profile?.sub || '');
  if (!providerId) {
    throw AppError.unauthenticated(
      'Google returned an identity without a subject',
      ERROR_CODES.OAUTH_ID_TOKEN_INVALID,
    );
  }

  const rawEmail = profile.email ? String(profile.email).toLowerCase().trim() : null;
  const emailVerified = profile.email_verified === true;

  return {
    providerId,
    // Only a Google-verified address is safe to persist and to compare on.
    email: rawEmail && emailVerified ? rawEmail : null,
    emailVerified,
    name: profile.name ? String(profile.name).trim().slice(0, 100) : '',
    // Google always hands back a 64px thumbnail; ask for a larger one so the
    // avatar is sharp where the UI renders it. Untouched when it is not a
    // Google photo URL.
    picture: enlargeGooglePhoto(
      profile.picture ? String(profile.picture).slice(0, 500) : '',
    ),
    handle: rawEmail ? rawEmail.split('@')[0] : profile.name || providerId,
  };
};

/** Unique, spec-compliant username derived from a Google profile handle. */
export const buildUsername = async (handle) => {
  const base =
    String(handle || '')
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, '')
      .slice(0, 24) || 'user';

  const padded = base.length >= 3 ? base : `${base}_g`.slice(0, 30);

  for (let attempt = 0; attempt < 25; attempt += 1) {
    const candidate =
      attempt === 0
        ? padded
        : `${padded.slice(0, 24)}_${Math.random().toString(36).slice(2, 6)}`;

    if (!/^[a-z0-9_]{3,30}$/.test(candidate)) continue;
    if (!(await User.exists({ username: candidate }))) return candidate;
  }

  return `user_${new mongoose.Types.ObjectId().toHexString().slice(-12)}`;
};

/* ------------------------------------------------------------------ *
 * Flow start
 * ------------------------------------------------------------------ */

/** Start the login flow: returns the consent URL plus the flow to persist. */
export const startLogin = async ({ loginHint } = {}) => {
  assertConfigured();

  const { codeVerifier, codeChallenge } = await google.generatePkce();
  const flow = createFlow({ purpose: 'login', codeVerifier });

  const url = google.buildAuthorizationUrl({
    state: flow.s,
    codeChallenge,
    nonce: flow.n,
    loginHint,
  });

  return { url, flow };
};

/** Start the "link Google to MY account" flow (requires an authenticated user). */
export const startLink = async (user, { loginHint } = {}) => {
  assertConfigured();

  const { codeVerifier, codeChallenge } = await google.generatePkce();
  const flow = createFlow({ purpose: 'link', userId: user._id, codeVerifier });

  const url = google.buildAuthorizationUrl({
    state: flow.s,
    codeChallenge,
    nonce: flow.n,
    loginHint: loginHint || user.email || undefined,
  });

  return { url, flow };
};

/* ------------------------------------------------------------------ *
 * Account resolution
 * ------------------------------------------------------------------ */

/**
 * Create the User for a brand-new Google identity.
 * Retries on a username collision and converts an email collision into the
 * same 409 the pre-check above produces (race with a concurrent signup).
 */
const createGoogleUser = async ({ email, emailVerified, name, picture, handle }) => {
  let lastError = null;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const username = await buildUsername(handle);

    try {
      return await User.create({
        name: name || username,
        username,
        email,
        // Google-only account: no local password (see User.password validator).
        role: ROLES.USER, // server-assigned, never from the client
        bio: '',
        avatar: picture,
        isVerified: emailVerified, // Google verified this address
        isActive: true,
        isReceivingMessages: true,
        authProvider: 'google',
        lastLoginAt: new Date(),
      });
    } catch (err) {
      if (err?.code !== 11000) throw err;

      const key = Object.keys(err.keyValue || {})[0];
      if (key === 'email') {
        throw AppError.conflict(
          ERROR_CODES.OAUTH_ACCOUNT_CONFLICT,
          'An account with this email already exists. Sign in with your password, then link Google from your profile settings.',
          { email },
        );
      }
      lastError = err; // username collision: loop for a fresh one
    }
  }

  throw lastError || AppError.internal('Could not allocate a unique username');
};

/**
 * Create the OAuthAccount row, handling the race where two callbacks for the
 * same Google identity run at the same time (unique index on provider+id).
 * Returns `{ user, adopted }` so the caller knows whether it won the race.
 */
const attachAfterRace = async ({ user, providerId, meta }) => {
  try {
    await OAuthAccount.create({ user: user._id, provider: 'google', providerId });
  } catch (err) {
    if (err?.code !== 11000) throw err;

    // Another callback won the race: drop the user we just made and adopt
    // the winner's account so we never end up with two users for one `sub`.
    await User.deleteOne({ _id: user._id, authProvider: 'google' });

    const winner = await OAuthAccount.findOne({ provider: 'google', providerId });
    const resolved = winner ? await User.findById(winner.user).select('+deletedAt') : null;
    if (!resolved || !resolved.isAccountActive()) {
      throw AppError.unauthenticated(
        'Google sign-in failed, please retry',
        ERROR_CODES.OAUTH_ID_TOKEN_INVALID,
      );
    }
    return { user: resolved, adopted: true };
  }

  await AuditLog.create({
    actor: user._id,
    action: 'auth.google_account_created',
    targetType: 'User',
    targetId: String(user._id),
    requestId: meta?.requestId ?? null,
    metadata: { provider: 'google' },
    expiresAt: auditRetention(),
  });

  return { user, adopted: false };
};

/**
 * Turn a verified Google identity into a local account.
 * Returns `{ user, created }` — tokens are issued separately so that the
 * redirect mode can defer them to the one-time handoff exchange.
 */
const resolveAccount = async ({ profile, meta }) => {
  const { providerId, email, emailVerified, name, picture, handle } =
    normalizeProfile(profile);

  const link = await OAuthAccount.findOne({ provider: 'google', providerId });

  if (link) {
    const user = await User.findById(link.user).select('+deletedAt');
    if (!user || !user.isAccountActive()) {
      throw AppError.unauthenticated('This account is disabled', ERROR_CODES.ACCOUNT_DISABLED);
    }

    user.lastLoginAt = new Date();
    await user.save();
    return { user, created: false };
  }

  if (!email) {
    throw AppError.unauthenticated(
      'Google did not return a verified email address for this account',
      ERROR_CODES.OAUTH_EMAIL_NOT_VERIFIED,
    );
  }

  // Account-takeover guard: never silently adopt an existing account.
  const existing = await User.findOne({ email }).select('+deletedAt');
  if (existing) {
    throw AppError.conflict(
      ERROR_CODES.OAUTH_ACCOUNT_CONFLICT,
      'An account with this email already exists. Sign in with your password, then link Google from your profile settings.',
      { email },
    );
  }

  const user = await createGoogleUser({ email, emailVerified, name, picture, handle });
  const { user: finalUser, adopted } = await attachAfterRace({ user, providerId, meta });

  return { user: finalUser, created: !adopted };
};

/* ------------------------------------------------------------------ *
 * Link / unlink
 * ------------------------------------------------------------------ */

/**
 * Explicitly link a Google identity to an authenticated user.
 *
 * Refuses when:
 * - the Google identity is already linked to somebody else,
 * - this user already has a Google link,
 * - the Google email belongs to a DIFFERENT local account (takeover guard:
 *   it would give this user a second door into somebody else's identity).
 */
export const linkAccount = async (user, profile, meta = {}) => {
  const { providerId, email, emailVerified, picture } = normalizeProfile(profile);

  const ownedBy = await OAuthAccount.findOne({ provider: 'google', providerId });
  if (ownedBy) {
    if (String(ownedBy.user) === String(user._id)) {
      return { user, linked: true, alreadyLinked: true };
    }
    throw AppError.conflict(
      ERROR_CODES.OAUTH_ALREADY_LINKED,
      'This Google account is already linked to a different user',
    );
  }

  const already = await OAuthAccount.findOne({ user: user._id, provider: 'google' });
  if (already) {
    throw AppError.conflict(
      ERROR_CODES.OAUTH_ALREADY_LINKED,
      'Your account already has a Google link. Unlink it first.',
    );
  }

  if (email) {
    const owner = await User.findOne({ email, _id: { $ne: user._id } }).select('+deletedAt');
    if (owner && !owner.deletedAt) {
      throw AppError.conflict(
        ERROR_CODES.OAUTH_ACCOUNT_CONFLICT,
        'That Google email belongs to a different account',
        { email },
      );
    }
  }

  try {
    await OAuthAccount.create({ user: user._id, provider: 'google', providerId });
  } catch (err) {
    if (err?.code === 11000) {
      throw AppError.conflict(
        ERROR_CODES.OAUTH_ALREADY_LINKED,
        'This Google account is already linked',
      );
    }
    throw err;
  }

  // Adopt the verified email / avatar only where it cannot collide.
  if (email && !user.email) {
    user.email = email;
  }
  if (email && user.email === email && emailVerified) {
    // Google confirmed this address, so the local account counts as verified.
    user.isVerified = true;
  }
  if (!user.avatar && picture) user.avatar = picture;

  await user.save();

  await AuditLog.create({
    actor: user._id,
    action: 'auth.google_linked',
    targetType: 'User',
    targetId: String(user._id),
    requestId: meta?.requestId ?? null,
    metadata: { provider: 'google' },
    expiresAt: auditRetention(),
  });

  return { user, linked: true, alreadyLinked: false };
};

/** Providers linked to a user (safe to expose). */
export const listLinks = async (user) => {
  const full = await User.findById(user._id).select('+password');
  const links = await OAuthAccount.find({ user: user._id }).sort({ createdAt: 1 });

  return {
    links: links.map((link) => ({
      provider: link.provider,
      providerId: link.providerId,
      createdAt: link.createdAt,
    })),
    hasPassword: Boolean(full?.password),
  };
};

/**
 * Unlink Google from a user.
 * Refuses when it is the only remaining sign-in method (lockout prevention).
 */
export const unlinkAccount = async (user, meta = {}) => {
  const link = await OAuthAccount.findOne({ user: user._id, provider: 'google' });
  if (!link) {
    throw new AppError(
      400,
      ERROR_CODES.OAUTH_NOT_LINKED,
      'No Google account is linked to this user',
    );
  }

  const full = await User.findById(user._id).select('+password +deletedAt');
  if (!full.password) {
    throw new AppError(
      400,
      ERROR_CODES.OAUTH_LAST_LOGIN_METHOD,
      'Cannot unlink the only sign-in method. Set a password first.',
    );
  }

  await OAuthAccount.deleteOne({ _id: link._id });

  await AuditLog.create({
    actor: user._id,
    action: 'auth.google_unlinked',
    targetType: 'User',
    targetId: String(user._id),
    requestId: meta?.requestId ?? null,
    metadata: { provider: 'google' },
    expiresAt: auditRetention(),
  });

  return { unlinked: true };
};

/* ------------------------------------------------------------------ *
 * Callback
 * ------------------------------------------------------------------ */

/**
 * Verify the CSRF `state` + the expiry of the signed flow bundle.
 * Shared by the controller (fail fast) and the service (source of truth).
 */
export const assertFlow = (flow, state) => {
  if (!flow || !safeEqual(flow.s, state)) {
    throw new AppError(
      400,
      ERROR_CODES.OAUTH_STATE_MISMATCH,
      'Invalid OAuth state, please restart the sign-in',
    );
  }
  if (typeof flow.e === 'number' && flow.e < Date.now()) {
    throw new AppError(
      400,
      ERROR_CODES.OAUTH_STATE_EXPIRED,
      'The OAuth session expired, please restart the sign-in',
    );
  }
};

/**
 * Complete the flow from the Google callback.
 *
 * Verifies state + nonce, exchanges the code, verifies the ID token, then
 * logs in, registers, or links to the user that started the flow.
 *
 * `deferTokens: true` (redirect mode) skips token issuance so that the token
 * pair is only ever produced at the one-time handoff exchange.
 */
export const handleCallback = async ({
  code,
  state,
  flow,
  meta = {},
  deferTokens = false,
}) => {
  assertConfigured();

  // --- CSRF / replay: state must match the value we handed out. ---
  assertFlow(flow, state);
  if (!code) {
    throw new AppError(
      400,
      ERROR_CODES.OAUTH_CODE_EXCHANGE_FAILED,
      'Missing authorization code',
    );
  }

  // --- Server-side code exchange (env redirect_uri + PKCE verifier). ---
  const tokens = await google.exchangeCode({ code, codeVerifier: flow.vf });

  // --- Server-side ID token verification (signature / iss / aud / exp). ---
  const profile = await google.verifyIdToken(tokens.id_token);

  // --- OIDC replay protection: nonce must be the one we generated. ---
  if (!safeEqual(profile.nonce, flow.n)) {
    throw AppError.unauthenticated(
      'Google ID token nonce mismatch',
      ERROR_CODES.OAUTH_ID_TOKEN_INVALID,
    );
  }

  // Link flow: bind this Google identity to the ALREADY authenticated user.
  if (flow.p === 'link') {
    const user = await User.findById(flow.u).select('+deletedAt');
    if (!user || !user.isAccountActive()) {
      throw AppError.unauthenticated(
        'Your session is no longer valid',
        ERROR_CODES.UNAUTHENTICATED,
      );
    }

    const linked = await linkAccount(user, profile, meta);
    return { purpose: 'link', ...linked, created: false, tokens: null };
  }

  const { user, created } = await resolveAccount({ profile, meta });
  const issued = deferTokens ? null : await tokenService.issueTokens(user, meta);

  return { purpose: 'login', user, created, linked: false, tokens: issued };
};

/** Standard envelope for an OAuth result (mirrors authService.register/login). */
export const presentResult = (result, extra = {}) => ({
  user: sanitizeUser(result.user),
  ...(result.tokens || {}),
  ...extra,
});

export default {
  startLogin,
  startLink,
  assertFlow,
  handleCallback,
  linkAccount,
  unlinkAccount,
  listLinks,
  buildUsername,
  normalizeProfile,
  presentResult,
};
