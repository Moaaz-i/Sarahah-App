import 'dotenv/config';

/**
 * Central environment access + startup validation.
 * - Missing required variables are reported BY NAME only (never by value).
 * - Secrets must never fall back to default values in production.
 */

const NODE_ENV = process.env.NODE_ENV || 'development';
const isProduction = NODE_ENV === 'production';
const isTest = NODE_ENV === 'test';

const REQUIRED_IN_PRODUCTION = [
  'MONGODB_URI',
  'JWT_ACCESS_SECRET',
  'JWT_REFRESH_SECRET',
  'CLIENT_ORIGIN',
];

/** Variables that must exist in every environment (defaults are dev/test only). */
const REQUIRED = ['MONGODB_URI', 'JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET'];

const missing = [];
for (const name of REQUIRED) {
  if (!process.env[name]) missing.push(name);
}

if (isProduction) {
  for (const name of REQUIRED_IN_PRODUCTION) {
    if (!process.env[name] && !missing.includes(name)) missing.push(name);
  }
}

/** Google OAuth is optional, but when it is switched on it must be complete. */
const GOOGLE_OAUTH_ENABLED = Boolean(
  process.env.GOOGLE_CLIENT_ID &&
    process.env.GOOGLE_CLIENT_SECRET &&
    process.env.GOOGLE_REDIRECT_URI,
);

if (isProduction && GOOGLE_OAUTH_ENABLED && !process.env.OAUTH_COOKIE_SECRET) {
  // Without it the flow cookie could not be HMAC-signed (createHmac would fail).
  missing.push('OAUTH_COOKIE_SECRET');
}

const isHttpUrl = (value) => {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
};

const OAUTH_REDIRECT_URL = process.env.OAUTH_REDIRECT_URL || '';
if (OAUTH_REDIRECT_URL && !isHttpUrl(OAUTH_REDIRECT_URL)) {
  const message = '[env] OAUTH_REDIRECT_URL must be an absolute http(s) URL.';
  if (isProduction) throw new Error(message);
  console.warn(message);
}

if (missing.length > 0) {
  const message =
    `[env] Missing required environment variable(s): ${missing.join(', ')}. ` +
    'Copy .env.example to .env and fill in the values.';
  if (isProduction) throw new Error(message);
  // In dev/test we warn loudly and keep going with explicit non-production defaults.
  console.warn(message);
}

const devSecret = (name) =>
  isProduction
    ? undefined // never default a secret in production
    : process.env[name] || `dev_only_${name}_not_for_production`;

const csv = (value) =>
  String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

const int = (value, fallback) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export const env = Object.freeze({
  nodeEnv: NODE_ENV,
  isProduction,
  isTest,
  isDevelopment: NODE_ENV === 'development',

  port: int(process.env.PORT, 3000),
  mongoUri:
    process.env.MONGODB_URI ||
    process.env.MONGO_URI ||
    (isTest
      ? 'mongodb://127.0.0.1:27017/sarhny_test'
      : 'mongodb://127.0.0.1:27017/sarhny_dev'),

  jwt: Object.freeze({
    accessSecret: devSecret('JWT_ACCESS_SECRET'),
    accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '15m',
    refreshSecret: devSecret('JWT_REFRESH_SECRET'),
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
    refreshExpiresMs: 7 * 24 * 60 * 60 * 1000,
    issuer: process.env.JWT_ISSUER || 'sarhny-api',
    audience: process.env.JWT_AUDIENCE || 'sarhny-app',
  }),

  corsOrigins: csv(process.env.CLIENT_ORIGIN),


  security: Object.freeze({
    bcryptRounds: int(process.env.BCRYPT_ROUNDS, 10),
    passwordResetTtlMinutes: int(process.env.PASSWORD_RESET_TTL_MINUTES, 15),
    maxMessagesPerRecipientPerDay: int(process.env.MAX_MESSAGES_PER_RECIPIENT_PER_DAY, 20),
    maxReportsPerFingerprintPerDay: int(process.env.MAX_REPORTS_PER_FINGERPRINT_PER_DAY, 5),
    maxDeletedAccountsRetentionDays: int(process.env.DELETED_ACCOUNT_RETENTION_DAYS, 30),
  }),

  oauth: Object.freeze({
    /**
     * Read lazily (not snapshotted) so the flag always mirrors the current
     * environment: all three variables must be present to turn it on.
     */
    get enabled() {
      return Boolean(
        process.env.GOOGLE_CLIENT_ID &&
          process.env.GOOGLE_CLIENT_SECRET &&
          process.env.GOOGLE_REDIRECT_URI,
      );
    },
    clientId: process.env.GOOGLE_CLIENT_ID || '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    /**
     * The redirect URI is NEVER taken from the request. It must be configured
     * here and must exactly match an entry in the Google Cloud Console
     * (scheme, host, port and trailing slash all matter).
     */
    redirectUri: process.env.GOOGLE_REDIRECT_URI || '',
    /** Sign/verify the short-lived flow cookie that carries state + PKCE. */
    cookieSecret: devSecret('OAUTH_COOKIE_SECRET'),
    cookieName: process.env.OAUTH_COOKIE_NAME || 'sarhny_oauth_flow',
    /** Lifetime of the state/PKCE/nonce bundle (ms). */
    flowTtlMs: int(process.env.OAUTH_FLOW_TTL_MS, 10 * 60 * 1000),
    /** Lifetime of the one-time handoff code used by the redirect mode (ms). */
    handoffTtlMs: int(process.env.OAUTH_HANDOFF_TTL_MS, 60 * 1000),
    /** Optional SPA landing URL; when set, the callback redirects with a
     *  one-time handoff code instead of returning tokens as JSON.
     *  Read lazily for the same reason as `enabled`. */
    get redirectUrl() {
      return process.env.OAUTH_REDIRECT_URL || '';
    },
    scopes: csv(process.env.GOOGLE_SCOPES).length
      ? csv(process.env.GOOGLE_SCOPES)
      : ['openid', 'email', 'profile'],
    prompt: process.env.GOOGLE_PROMPT || 'select_account',
  }),

  rateLimit: Object.freeze({
    enabled: (process.env.RATE_LIMIT_ENABLED ?? 'true') !== 'false',
    windowMs: int(process.env.RATE_LIMIT_WINDOW_MS, 15 * 60 * 1000),
    globalMax: int(process.env.RATE_LIMIT_GLOBAL_MAX, 300),
    authMax: int(process.env.RATE_LIMIT_AUTH_MAX, 20),
    messageMax: int(process.env.RATE_LIMIT_MESSAGE_MAX, 10),
    reportMax: int(process.env.RATE_LIMIT_REPORT_MAX, 10),
    passwordMax: int(process.env.RATE_LIMIT_PASSWORD_MAX, 5),
  }),
});

export default env;
