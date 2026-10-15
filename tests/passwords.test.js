import { describe, it, expect } from 'vitest';
import { api, createUser, signTokenFor } from './helpers.js';
import PasswordResetToken from '../src/models/PasswordResetToken.js';
import { hashToken } from '../src/utils/hashToken.js';
import { generateResetToken } from '../src/utils/generateToken.js';
import * as passwordService from '../src/services/passwordService.js';
import RefreshToken from '../src/models/RefreshToken.js';

describe('Password reset', () => {
  it('is disabled: always answers 503, whether or not the account exists', async () => {
    await createUser({ username: 'reset_user', email: 'reset@example.com' });

    const existing = await api.post('/api/v1/password/forgot').send({ email: 'reset@example.com' });
    const missing = await api.post('/api/v1/password/forgot').send({ email: 'ghost@example.com' });

    // Byte-identical answer for both, so even the disabled endpoint cannot be
    // used to discover which accounts exist.
    expect(existing.status).toBe(503);
    expect(missing.status).toBe(503);
    expect(existing.body.code).toBe('PASSWORD_RESET_DISABLED');
    expect(missing.body.code).toBe('PASSWORD_RESET_DISABLED');
    expect(existing.body.message).toBe(missing.body.message);
    expect(JSON.stringify(existing.body)).not.toContain('token');
  });

  it('stores only the hash of the reset token, never the raw token', async () => {
    const user = await createUser({ username: 'hash_only', email: 'hash@example.com' });

    const before = await PasswordResetToken.countDocuments({});
    const res = await api.post('/api/v1/password/forgot').send({ email: 'hash@example.com' });
    const after = await PasswordResetToken.countDocuments({});

    // Nothing is delivered, so nothing is written — not even a hash.
    expect(res.status).toBe(503);
    expect(after).toBe(before);

    const raw = await passwordService.createResetTokenRecordForTests(user._id);
    const record = await PasswordResetToken.findOne({ tokenHash: hashToken(raw) }).select(
      '+tokenHash',
    );

    expect(record).toBeTruthy();
    expect(JSON.stringify(record.toObject())).not.toContain(raw);
  });

  it('resets the password with a valid token and revokes old sessions', async () => {
    const user = await createUser({ username: 'valid_reset', email: 'valid@example.com' });

    const raw = await passwordService.createResetTokenRecordForTests(user._id);
    await RefreshToken.create({
      user: user._id,
      tokenHash: 'b'.repeat(64),
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    });

    const res = await api.post('/api/v1/password/reset').send({
      token: raw,
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

  it('rejects an invalid token', async () => {
    const res = await api.post('/api/v1/password/reset').send({
      token: generateResetToken(),
      newPassword: 'BrandNew123',
    });

    expect(res.status).toBe(401);
    expect(res.body.code).toBe('INVALID_TOKEN');
  });

  it('rejects an expired token', async () => {
    const user = await createUser({ username: 'expired_reset', email: 'expired@example.com' });

    // Token that expired 1 minute ago.
    const raw = await passwordService.createResetTokenRecordForTests(user._id, {
      ttlMs: -60 * 1000,
    });

    const res = await api.post('/api/v1/password/reset').send({
      token: raw,
      newPassword: 'BrandNew123',
    });

    expect(res.status).toBe(401);
    expect(res.body.code).toBe('TOKEN_EXPIRED');
  });

  it('rejects reuse of an already used token', async () => {
    const user = await createUser({ username: 'reuse_reset', email: 'reuse@example.com' });

    const raw = await passwordService.createResetTokenRecordForTests(user._id);

    const first = await api.post('/api/v1/password/reset').send({
      token: raw,
      newPassword: 'BrandNew123',
    });
    expect(first.status).toBe(200);

    const second = await api.post('/api/v1/password/reset').send({
      token: raw,
      newPassword: 'AnotherPass456',
    });

    expect(second.status).toBe(401);
    expect(second.body.code).toBe('TOKEN_ALREADY_USED');
  });

  it('rejects a weak new password', async () => {
    const user = await createUser({ username: 'weak_reset', email: 'weak@example.com' });
    const raw = await passwordService.createResetTokenRecordForTests(user._id);

    const res = await api.post('/api/v1/password/reset').send({
      token: raw,
      newPassword: '123',
    });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('leaves an outstanding token untouched — a disabled request writes nothing', async () => {
    const user = await createUser({ username: 'rotate_reset', email: 'rotate@example.com' });

    const firstRaw = await passwordService.createResetTokenRecordForTests(user._id);
    const res = await api.post('/api/v1/password/forgot').send({ email: 'rotate@example.com' });

    expect(res.status).toBe(503);

    // The refusal happens before the store is touched: the existing token is
    // neither minted over nor invalidated.
    const firstRecord = await PasswordResetToken.findOne({ tokenHash: hashToken(firstRaw) });
    expect(firstRecord.usedAt).toBeFalsy();

    // And the consuming half still works on it.
    const reset = await api.post('/api/v1/password/reset').send({
      token: firstRaw,
      newPassword: 'BrandNew123',
    });
    expect(reset.status).toBe(200);
  });
});

/**
 * The disabled endpoint must answer every account type identically: Google or
 * local, with a password or without one, existing or not. If any of those
 * produced a different status or body it would become an oracle.
 *
 * (`requestPasswordReset` used to filter on `authProvider: 'local'`; that
 * filter is gone along with the email channel.)
 */
describe('Password reset for Google-linked accounts', () => {
  const bearer = (user) => `Bearer ${signTokenFor(user)}`;

  it('answers 503 for a Google-only account without minting anything', async () => {
    const user = await createUser({
      username: 'g_only_forgot',
      email: 'gonly@example.com',
      authProvider: 'google',
      password: undefined,
    });

    const res = await api.post('/api/v1/password/forgot').send({ email: 'gonly@example.com' });

    expect(res.status).toBe(503);
    expect(res.body.code).toBe('PASSWORD_RESET_DISABLED');
    expect(await PasswordResetToken.countDocuments({ user: user._id })).toBe(0);
  });

  it('answers 503 the same way once it has adopted a password', async () => {
    const user = await createUser({
      username: 'g_adopted_forgot',
      email: 'gadopted@example.com',
      authProvider: 'google',
      password: undefined,
    });

    const adopt = await api
      .patch('/api/v1/users/me/password')
      .set('Authorization', bearer(user))
      .send({ newPassword: 'FirstPass123' });
    expect(adopt.status).toBe(200);

    const res = await api
      .post('/api/v1/password/forgot')
      .send({ email: 'gadopted@example.com' });

    const body = res.body;
    expect(res.status).toBe(503);
    expect(body.code).toBe('PASSWORD_RESET_DISABLED');
    // Same shape as the Google-only case above — the account's shape is
    // still not observable through this endpoint.
    expect(body).not.toHaveProperty('data');
    expect(await PasswordResetToken.countDocuments({ user: user._id })).toBe(0);
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

    const raw = await passwordService.createResetTokenRecordForTests(user._id);

    const res = await api.post('/api/v1/password/reset').send({
      token: raw,
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
