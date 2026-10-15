import { rateLimit } from 'express-rate-limit';
import env from '../config/env.js';
import { ERROR_CODES } from '../constants/messages.js';

/**
 * Rate limiting.
 * - Separate limits per operation type (auth, messages, reports, password).
 * - Uses the in-memory store by default. FOR PRODUCTION MULTI-INSTANCE
 *   DEPLOYMENTS you must plug a shared store (e.g. rate-limit-redis) via
 *   `createLimiter({ store })`; a per-process memory store is not enough
 *   when several instances run behind one load balancer.
 * - Disabled entirely when RATE_LIMIT_ENABLED=false (tests).
 */

const buildHandler = (message) => (req, res) => {
  res.status(429).json({
    success: false,
    message,
    code: ERROR_CODES.RATE_LIMITED,
    requestId: req.requestId ?? null,
  });
};

/** Dynamic check so tests can flip RATE_LIMIT_ENABLED per test. */
const isEnabled = () => {
  const value = process.env.RATE_LIMIT_ENABLED;
  if (value === undefined) return env.rateLimit.enabled;
  return !['false', '0', 'no'].includes(String(value).toLowerCase());
};

export const createLimiter = ({
  windowMs = env.rateLimit.windowMs,
  limit = env.rateLimit.globalMax,
  message = 'Too many requests, please try again later.',
  keyGenerator,
  store,
  standardHeaders = true,
  legacyHeaders = false,
} = {}) =>
  rateLimit({
    windowMs,
    limit,
    standardHeaders,
    legacyHeaders,
    // Only trust the proxy header when the app runs behind a proxy.
    validate: { xForwardedForHeader: false, trustProxy: false },
    keyGenerator,
    store,
    handler: buildHandler(message),
    skip: () => !isEnabled(),
  });

/** Fallback IP key: does not trust X-Forwarded-For unless configured to. */
export const ipKeyGenerator = (req) =>
  req.ip || req.socket?.remoteAddress || 'unknown';

/** Global limiter applied to /api/v1 as a safety net. */
export const globalLimiter = () =>
  createLimiter({
    limit: env.rateLimit.globalMax,
    message: 'Too many requests from this client.',
  });

/** Login / register / refresh attempts. */
export const authLimiter = () =>
  createLimiter({
    limit: env.rateLimit.authMax,
    message: 'Too many authentication attempts, please try again later.',
  });

/** Anonymous message sending. */
export const messageLimiter = () =>
  createLimiter({
    limit: env.rateLimit.messageMax,
    message: 'You are sending messages too quickly, please slow down.',
  });

/** Report creation. */
export const reportLimiter = () =>
  createLimiter({
    limit: env.rateLimit.reportMax,
    message: 'Too many reports submitted, please try again later.',
  });

/** Password forgot/reset. */
export const passwordLimiter = () =>
  createLimiter({
    limit: env.rateLimit.passwordMax,
    message: 'Too many password reset attempts, please try again later.',
  });

export default createLimiter;
