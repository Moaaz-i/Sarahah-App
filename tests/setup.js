import { beforeAll, afterAll, beforeEach } from 'vitest';
import mongoose from 'mongoose';

/**
 * Test bootstrap.
 * - Forces the test environment BEFORE any app module is loaded.
 * - Uses a SEPARATE test database (never the dev/production one).
 * - Wipes the database before every test file/case.
 */

process.env.NODE_ENV = 'test';
process.env.MONGODB_URI =
  process.env.TEST_MONGODB_URI || 'mongodb://127.0.0.1:27017/sarhny_test';
process.env.JWT_ACCESS_SECRET = 'test_access_secret_do_not_use_in_production';
process.env.JWT_REFRESH_SECRET = 'test_refresh_secret_do_not_use_in_production';
process.env.JWT_ACCESS_EXPIRES_IN = '15m';
process.env.JWT_REFRESH_EXPIRES_IN = '7d';
process.env.BCRYPT_ROUNDS = '4'; // fast hashing for tests
process.env.RATE_LIMIT_ENABLED = 'false'; // enabled explicitly in the security test
process.env.FINGERPRINT_SALT = 'test_fingerprint_salt';

// SMTP: leave empty so mailer.sendMail() returns {skipped:true} in tests.
process.env.SMTP_HOST = '';
process.env.SMTP_USER = '';
process.env.SMTP_PASS = '';

// Redis: leave empty in default test runs so external Upstash state does not pollute tests
delete process.env.UPSTASH_REDIS_REST_URL;
delete process.env.UPSTASH_REDIS_REST_TOKEN;

// OTP settings for tests (short codes for easy debugging).
process.env.OTP_LENGTH = '6';
process.env.OTP_TTL_MINUTES = '15';
process.env.OTP_MAX_ATTEMPTS = '5';

// Google OAuth: the feature is exercised with an injected fake client, so no
// test ever contacts Google. Only the presence of these values matters.
process.env.GOOGLE_CLIENT_ID = 'test-client-id.apps.googleusercontent.com';
process.env.GOOGLE_CLIENT_SECRET = 'test-client-secret';
process.env.GOOGLE_REDIRECT_URI = 'http://localhost:3000/api/v1/auth/google/callback';
process.env.OAUTH_COOKIE_SECRET = 'test_oauth_cookie_secret_do_not_use_in_production';
delete process.env.OAUTH_REDIRECT_URL; // JSON mode by default; redirect mode is opted into per test

// Safety net: refuse to run against anything that is not a test database.
if (!/test/i.test(process.env.MONGODB_URI)) {
  throw new Error(
    `Refusing to run tests against "${process.env.MONGODB_URI}". ` +
      'The test database name must contain "test".',
  );
}

const { default: connectDB, disconnectDB } = await import('../src/config/database.js');

beforeAll(async () => {
  await connectDB(process.env.MONGODB_URI);
});

afterAll(async () => {
  await disconnectDB();
});

beforeEach(async () => {
  const collections = await mongoose.connection.db.collections();
  await Promise.all(collections.map((collection) => collection.deleteMany({})));
});
