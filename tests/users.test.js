import { describe, it, expect } from 'vitest';
import { api, createUser, signTokenFor, authHeaderFor, User } from './helpers.js';
import RefreshToken from '../src/models/RefreshToken.js';

describe('Users', () => {
  describe('GET /api/v1/users/:username', () => {
    it('returns the public profile only', async () => {
      const user = await createUser({
        username: 'public_user',
        name: 'Public User',
        bio: 'hello there',
      });

      const res = await api.get('/api/v1/users/public_user');

      expect(res.status).toBe(200);
      expect(res.body.data.user).toEqual({
        username: 'public_user',
        name: 'Public User',
        bio: 'hello there',
        avatar: '',
        createdAt: user.createdAt.toISOString(),
        // Sender-visible reception policy: defaults publish nothing restrictive.
        policy: {
          isPaused: false,
          pauseReason: '',
          policyMessage: '',
          requireCategory: false,
          allowedCategories: null,
          prompts: [],
        },
      });
    });

    it('does not expose email, role or password', async () => {
      await createUser({ username: 'private_fields', email: 'private@example.com' });

      const res = await api.get('/api/v1/users/private_fields');
      const raw = JSON.stringify(res.body);

      expect(res.status).toBe(200);
      expect(raw).not.toContain('private@example.com');
      expect(raw).not.toContain('password');
      expect(raw).not.toContain('role');
    });

    it('returns 404 for an unknown or deactivated user', async () => {
      expect((await api.get('/api/v1/users/nobody_here')).status).toBe(404);

      await createUser({ username: 'deactivated', isActive: false });
      expect((await api.get('/api/v1/users/deactivated')).status).toBe(404);
    });
  });

  describe('PATCH /api/v1/users/me', () => {
    it('updates name, bio and avatar', async () => {
      const { authorization, user } = await authHeaderFor();

      const res = await api
        .patch('/api/v1/users/me')
        .set(authorization)
        .send({ name: 'New Name', bio: 'new bio', avatar: 'https://example.com/a.png' });

      expect(res.status).toBe(200);
      expect(res.body.data.user.name).toBe('New Name');
      expect(res.body.data.user.bio).toBe('new bio');
      expect(res.body.data.user.avatar).toBe('https://example.com/a.png');
      expect(String(res.body.data.user._id)).toBe(String(user._id));
    });

    it('rejects attempts to change role or verification state', async () => {
      const { authorization } = await authHeaderFor();

      const res = await api
        .patch('/api/v1/users/me')
        .set(authorization)
        .send({ role: 'admin', isVerified: true, name: 'X' });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
    });

    it('requires authentication', async () => {
      const res = await api.patch('/api/v1/users/me').send({ name: 'Nope' });
      expect(res.status).toBe(401);
    });
  });

  describe('PATCH /api/v1/users/me/password', () => {
    it('changes the password after verifying the current one and revokes sessions', async () => {
      const { authorization, tokens } = await authHeaderFor();

      // Create a session that should be revoked afterwards.
      await RefreshToken.create({
        user: (await api.get('/api/v1/auth/me').set(authorization)).body.data.user._id,
        tokenHash: 'a'.repeat(64),
        expiresAt: new Date(Date.now() + 1000 * 60 * 60),
      });

      const res = await api
        .patch('/api/v1/users/me/password')
        .set(authorization)
        .send({ currentPassword: 'Password123', newPassword: 'NewPass456' });

      expect(res.status).toBe(200);

      // Old refresh token is dead.
      const refresh = await api.post('/api/v1/auth/refresh').send({ refreshToken: tokens.refreshToken });
      expect(refresh.status).toBe(401);

      // New password works.
      const me = await api.get('/api/v1/auth/me').set(authorization);
      const login = await api.post('/api/v1/auth/login').send({
        identifier: me.body.data.user.username,
        password: 'NewPass456',
      });
      expect(login.status).toBe(200);
    });

    it('rejects a wrong current password', async () => {
      const { authorization } = await authHeaderFor();

      const res = await api
        .patch('/api/v1/users/me/password')
        .set(authorization)
        .send({ currentPassword: 'WrongPass1', newPassword: 'NewPass456' });

      expect(res.status).toBe(401);
      expect(res.body.code).toBe('INVALID_CREDENTIALS');
    });
  });

  describe('DELETE /api/v1/users/me', () => {
    it('deletes the account, wipes personal data and hides received messages', async () => {
      const { authorization, user } = await authHeaderFor();

      await api
        .post(`/api/v1/messages/${user.username}`)
        .send({ content: 'A message for the soon-deleted user' });

      const res = await api.delete('/api/v1/users/me').set(authorization).send({
        password: 'Password123',
      });

      expect(res.status).toBe(200);
      expect(res.body.data.deleted).toBe(true);
      expect(res.body.data.policy).toBeTruthy();

      // The user can no longer authenticate.
      const login = await api.post('/api/v1/auth/login').send({
        identifier: user.username,
        password: 'Password123',
      });
      expect(login.status).toBe(401);

      // Personal data is gone from the DB.
      const { default: User } = await import('../src/models/User.js');
      const { default: Message } = await import('../src/models/Message.js');
      const doc = await User.findById(user._id).select('+password +deletedAt');
      expect(doc.email).toBeNull();
      expect(doc.deletedAt).toBeTruthy();
      expect(doc.isActive).toBe(false);
      expect(doc.password).not.toContain('Password123');

      // Received messages are hidden.
      const messages = await Message.find({ recipient: user._id });
      expect(messages.every((m) => m.isDeleted)).toBe(true);
    });

    it('requires the correct password', async () => {
      const { authorization } = await authHeaderFor();

      const res = await api
        .delete('/api/v1/users/me')
        .set(authorization)
        .send({ password: 'Nope123456' });

      expect(res.status).toBe(401);
    });
  });

  describe('access control', () => {
    it('does not let a user read another user private data', async () => {
      const victim = await createUser({ username: 'victim_user', email: 'victim@example.com' });
      const attacker = await createUser({ username: 'attacker_user' });

      // There is no endpoint that returns another user's private data,
      // and the auth /me endpoint only ever returns the token owner.
      const res = await api
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${signTokenFor(attacker)}`);

      expect(res.status).toBe(200);
      expect(String(res.body.data.user._id)).toBe(String(attacker._id));
      expect(JSON.stringify(res.body)).not.toContain('victim@example.com');
      expect(String(res.body.data.user._id)).not.toBe(String(victim._id));
    });
  });
});

/**
 * Google-only accounts have no `password` field at all (absent, not empty).
 * Requiring one made "change password" and "delete account" impossible for
 * them — bcrypt.compare against `undefined` always fails — so both accept
 * the session as proof for callers that have no password, while every
 * account that DOES have one must still present it.
 */
describe('Google-only accounts (no local password)', () => {
  const bearer = (user) => `Bearer ${signTokenFor(user)}`;

  const googleOnly = (username) =>
    createUser({ username, authProvider: 'google', password: undefined });

  it('really has no password hash stored', async () => {
    const user = await googleOnly('g_no_hash');

    const stored = await User.findById(user._id).select('+password');
    expect(stored.password).toBeFalsy();
    expect(stored.authProvider).toBe('google');
  });

  it('adopts a first password without presenting a current one', async () => {
    const user = await googleOnly('g_adopt');

    const res = await api
      .patch('/api/v1/users/me/password')
      .set('Authorization', bearer(user))
      .send({ newPassword: 'BrandNew123' });

    expect(res.status).toBe(200);

    // The password it just chose really works.
    const login = await api
      .post('/api/v1/auth/login')
      .send({ identifier: 'g_adopt', password: 'BrandNew123' });
    expect(login.status).toBe(200);
  });

  it('must present the password once it has one', async () => {
    const user = await googleOnly('g_then_guarded');

    await api
      .patch('/api/v1/users/me/password')
      .set('Authorization', bearer(user))
      .send({ newPassword: 'BrandNew123' });

    const without = await api
      .patch('/api/v1/users/me/password')
      .set('Authorization', bearer(user))
      .send({ newPassword: 'AnotherPass1' });
    expect(without.status).toBe(401);
    expect(without.body.code).toBe('INVALID_CREDENTIALS');

    const withIt = await api
      .patch('/api/v1/users/me/password')
      .set('Authorization', bearer(user))
      .send({ currentPassword: 'BrandNew123', newPassword: 'AnotherPass1' });
    expect(withIt.status).toBe(200);
  });

  it('deletes its own account without a password', async () => {
    const user = await googleOnly('g_delete');

    const res = await api.delete('/api/v1/users/me').set('Authorization', bearer(user)).send({});

    expect(res.status).toBe(200);

    const stored = await User.findById(user._id).select('+password +deletedAt');
    expect(stored.deletedAt).toBeInstanceOf(Date);
    expect(stored.isActive).toBe(false);
    expect(stored.avatar).toBe('');
  });

  it('still demands the correct password from an account that has one', async () => {
    const local = await createUser({ username: 'local_stays_guarded' });

    const wrong = await api
      .delete('/api/v1/users/me')
      .set('Authorization', bearer(local))
      .send({ password: 'not-the-password' });
    expect(wrong.status).toBe(401);
    expect(wrong.body.code).toBe('INVALID_CREDENTIALS');

    const right = await api
      .delete('/api/v1/users/me')
      .set('Authorization', bearer(local))
      .send({ password: 'Password123' });
    expect(right.status).toBe(200);
  });

  it('rejects an empty currentPassword rather than treating it as absent', async () => {
    const local = await createUser({ username: 'local_empty_guard' });

    const res = await api
      .patch('/api/v1/users/me/password')
      .set('Authorization', bearer(local))
      .send({ currentPassword: '', newPassword: 'Something1' });

    // Caught by the validator (min(1)), so no bcrypt round-trip happens.
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });
});
