import crypto from 'node:crypto';
import OAuthHandoff from '../models/OAuthHandoff.js';
import User from '../models/User.js';
import AppError from '../utils/AppError.js';
import { ERROR_CODES } from '../constants/messages.js';
import env from '../config/env.js';

/**
 * One-time handoff codes for the OAuth REDIRECT mode.
 *
 * The browser callback must never put the token pair in a URL: it would leak
 * through Referer headers, browser history and access logs. Instead the API
 * issues a random code, redirects the SPA with `?handoff=<code>` and the SPA
 * posts that code to POST /api/v1/auth/google/exchange.
 *
 * Properties:
 * - only the SHA-256 of the code is stored (a DB dump cannot be replayed),
 * - single use, claimed with an atomic findOneAndUpdate,
 * - short TTL, plus a Mongo TTL index that purges rows automatically.
 */

const hash = (code) => crypto.createHash('sha256').update(String(code)).digest('hex');

const invalid = () =>
  AppError.unauthenticated(
    'The sign-in handoff code is invalid or expired',
    ERROR_CODES.OAUTH_HANDOFF_INVALID,
  );

/** Issue a one-time code bound to a user and a purpose. */
export const createHandoff = async ({ user, purpose = 'login', payload = null }) => {
  const code = crypto.randomBytes(32).toString('base64url');

  await OAuthHandoff.create({
    codeHash: hash(code),
    user: user._id,
    purpose,
    payload,
    expiresAt: new Date(Date.now() + env.oauth.handoffTtlMs),
  });

  return code;
};

/**
 * Atomically claim a code and return what it carries.
 * A second attempt (replayed callback / replayed exchange) finds `usedAt`
 * already set and fails with 401.
 */
export const consumeHandoff = async (code) => {
  if (!code || typeof code !== 'string' || code.length < 20 || code.length > 128) {
    throw invalid();
  }

  const now = new Date();
  const doc = await OAuthHandoff.findOneAndUpdate(
    { codeHash: hash(code), usedAt: null, expiresAt: { $gt: now } },
    { $set: { usedAt: now } },
    { new: true },
  );

  if (!doc) throw invalid();

  const user = await User.findById(doc.user).select('+deletedAt');
  if (!user || !user.isAccountActive()) {
    throw AppError.unauthenticated('This account is disabled', ERROR_CODES.ACCOUNT_DISABLED);
  }

  return { user, purpose: doc.purpose, payload: doc.payload || {} };
};

export default { createHandoff, consumeHandoff };
