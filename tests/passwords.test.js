import { describe, it, expect } from 'vitest';
import { api, createUser, signTokenFor } from './helpers.js';
import EmailOtp from '../src/models/EmailOtp.js';
import * as passwordService from '../src/services/passwordService.js';
import RefreshToken from '../src/models/RefreshToken.js';

describe('Password reset (OTP)', () => {
  it('always answers 202 from /forgot, whether or not the account exists', async () => {
    await createUser({ username: 'reset_user', email: 'reset@example.com' });

    const existing = await api.post('/api/v1/password/forgot').send({ email: 'reset@example.com' });
    const missing = await api.post('/api/v1/password/forgot').send({ email: 'ghost@example.com' });

    expect(existing.status).toBe(202);
    expect(missing.status).toBe(202);
    // Identical shape: no way to tell which accounts exist.
    expect(JSON.stringify(existing.body)).not.toContain('token');
    expect(JSON.stringify(existing.body)).not.toContain('code');
    expect(existing.body.success).toBe(true);
    expect(missing.body.success).toBe(true);
  });

  it('stores only the hash of the OTP code, never the raw code', async () => {
    const user = await createUser({ username: 'hash_only', email: 'hash@example.com' });

    const raw = await passwordService.createResetOtpForTests(user._id);
    const record = await EmailOtp.findOne({ user: user._id, purpose: 'password_reset' })
      .select('+codeHash +salt');

    expect(record).toBeTruthy();
    expect(record.codeHash).toBeTruthy();
    expect(record.salt).toBeTruthy();
    // Raw code must not be stored anywhere on the record.
    const serialized = JSON.stringify(record.toObject());
    expect(serialized).not.toContain(raw);
    expect(serialized).not.toContain(`"${raw}"`);
  });

  it('resets the password with a valid OTP and revokes old sessions', async () => {
    const user = await createUser({ username: 'valid_reset', email: 'valid@example.com' });

    const otp = await passwordService.createResetOtpForTests(user._id);
    await RefreshToken.create({
      user: user._id,
      tokenHash: 'b'.repeat(64),
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    });

    const res = await api.post('/api/v1/password/reset').send({
      email: 'valid@example.com',
      otp,
      newPassword: 'BrandNew123',
    });

    expect(res.status).toBe(200);
    expect(res.body.data.sessionsRevoked).toBe(true);

    const login = await api.post('/api/v1/auth/login').send({
      identifier: 'valid_reset',
      password: 'BrandNew123',
    });
    expect(login.status).toBe(200);

    // Old sessions are gone.
    const stillValid = await RefreshToken.findOne({ tokenHash: 'b'.repeat(64) });
    expect(stillValid.revokedAt).toBeTruthy();
  });

  it('rejects an invalid OTP code', async () => {
    const user = await createUser({ username: 'bad_otp', email: 'badotp@example.com' });
    await passwordService.createResetOtpForTests(user._id);

    const res = await api.post('/api/v1/password/reset').send({
      email: 'badotp@example.com',
      otp: '000000', // almost certainly wrong
      newPassword: 'BrandNew123',
    });

    expect(res.status).toBe(400);
  });

  it('rejects an OTP for the wrong user', async () => {
    const userA = await createUser({ username: 'user_a', email: 'a@example.com' });
    const userB = await createUser({ username: 'user_b', email: 'b@example.com' });

    const otpForA = await passwordService.createResetOtpForTests(userA._id);

    // Try user A's OTP against user B's account.
    const res = await api.post('/api/v1/password/reset').send({
      email: 'b@example.com',
      otp: otpForA,
      newPassword: 'BrandNew123',
    });

    expect(res.status).toBe(400);
  });

  it('rejects reuse of an already used OTP', async () => {
    const user = await createUser({ username: 'reuse_reset', email: 'reuse@example.com' });
    const otp = await passwordService.createResetOtpForTests(user._id);

    const first = await api.post('/api/v1/password/reset').send({
      email: 'reuse@example.com',
      otp,
      newPassword: 'BrandNew123',
    });
    expect(first.status).toBe(200);

    const second = await api.post('/api/v1/password/reset').send({
      email: 'reuse@example.com',
      otp,
      newPassword: 'AnotherPass456',
    });

    expect(second.status).toBe(400);
  });

  it('rejects a weak new password', async () => {
    const user = await createUser({ username: 'weak_reset', email: 'weak@example.com' });
    const otp = await passwordService.createResetOtpForTests(user._id);

    const res = await api.post('/api/v1/password/reset').send({
      email: 'weak@example.com',
      otp,
      newPassword: '123',
    });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('invalidates the previous OTP when a new one is requested', async () => {
    const user = await createUser({ username: 'rotate_otp', email: 'rotate@example.com' });

    const firstOtp = await passwordService.createResetOtpForTests(user._id);
    const secondOtp = await passwordService.createResetOtpForTests(user._id);

    // There should be exactly one live (unused) OTP — the second one.
    const liveRecords = await EmailOtp.find({ user: user._id, purpose: 'password_reset', usedAt: null });
    expect(liveRecords.length).toBe(1);

    // The second OTP still works.
    const res = await api.post('/api/v1/password/reset').send({
      email: 'rotate@example.com',
      otp: secondOtp,
      newPassword: 'BrandNew123',
    });
    expect(res.status).toBe(200);
  });

  it('rejects a malformed OTP (wrong length)', async () => {
    const res = await api.post('/api/v1/password/reset').send({
      email: 'x@example.com',
      otp: '12345', // 5 digits
      newPassword: 'BrandNew123',
    });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });
});

/**
 * The /forgot endpoint must answer every account type identically:
 * Google or local, with a password or without one, existing or not.
 */
describe('Password reset for Google-linked accounts (OTP)', () => {
  const bearer = (user) => `Bearer ${signTokenFor(user)}`;

  it('answers 202 for a Google-only account', async () => {
    const user = await createUser({
      username: 'g_only_forgot',
      email: 'gonly@example.com',
      authProvider: 'google',
      password: undefined,
    });

    const res = await api.post('/api/v1/password/forgot').send({ email: 'gonly@example.com' });

    expect(res.status).toBe(202);
    expect(res.body.success).toBe(true);
  });

  it('completes the reset and signs in with the new password', async () => {
    const user = await createUser({
      username: 'g_adopted_reset',
      email: 'greset@example.com',
      authProvider: 'google',
      password: undefined,
    });

    await api
      .patch('/api/v1/users/me/password')
      .set('Authorization', bearer(user))
      .send({ newPassword: 'FirstPass123' });

    const otp = await passwordService.createResetOtpForTests(user._id);

    const res = await api.post('/api/v1/password/reset').send({
      email: 'greset@example.com',
      otp,
      newPassword: 'ResetPass123',
    });
    expect(res.status).toBe(200);

    const login = await api
      .post('/api/v1/auth/login')
      .send({ identifier: 'greset@example.com', password: 'ResetPass123' });
    expect(login.status).toBe(200);
    expect(login.body.data.user.authProvider).toBe('google');
  });
});
