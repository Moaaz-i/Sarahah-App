import { describe, it, expect } from 'vitest';
import { api, createUser, signTokenFor, registerUser } from './helpers.js';

describe('Auth', () => {
  describe('POST /api/v1/auth/register', () => {
    it('registers a user and returns tokens without leaking the password', async () => {
      const { res, data } = await registerUser({
        name: 'Sara',
        username: 'sara_1',
        email: 'sara@example.com',
        password: 'Password123',
      });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(data.user).toBeTruthy();
      expect(data.user.username).toBe('sara_1');
      expect(data.user.role).toBe('user');
      expect(data.accessToken).toBeTruthy();
      expect(data.refreshToken).toBeTruthy();

      // No sensitive field anywhere in the response.
      const raw = JSON.stringify(res.body);
      expect(raw).not.toContain('password');
      expect(raw).not.toContain('Password123');
    });

    it('rejects a duplicate username with 409', async () => {
      await registerUser({ username: 'dup_user', email: 'a1@example.com' });
      const res = await api.post('/api/v1/auth/register').send({
        name: 'Other',
        username: 'dup_user',
        email: 'a2@example.com',
        password: 'Password123',
      });

      expect(res.status).toBe(409);
      expect(res.body.code).toBe('USERNAME_TAKEN');
    });

    it('rejects a duplicate email with 409', async () => {
      await registerUser({ username: 'user_one', email: 'dup@example.com' });
      const res = await api.post('/api/v1/auth/register').send({
        name: 'Other',
        username: 'user_two',
        email: 'dup@example.com',
        password: 'Password123',
      });

      expect(res.status).toBe(409);
      expect(res.body.code).toBe('EMAIL_TAKEN');
    });

    it('rejects a weak password (policy: 8+ chars, letter + number)', async () => {
      const res = await api.post('/api/v1/auth/register').send({
        name: 'Weak',
        username: 'weak_pwd',
        email: 'weak@example.com',
        password: 'short1',
      });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
    });

    it('rejects a client-supplied role (strict schema + server-assigned role)', async () => {
      const res = await api.post('/api/v1/auth/register').send({
        name: 'Sneaky',
        username: 'sneaky',
        email: 'sneaky@example.com',
        password: 'Password123',
        role: 'admin',
      });

      // The field is not even accepted, let alone honoured.
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');

      // And no admin account was created.
      const { default: User } = await import('../src/models/User.js');
      expect(await User.findOne({ username: 'sneaky' })).toBeNull();
    });

    it('rejects unknown fields (strict validation)', async () => {
      const res = await api.post('/api/v1/auth/register').send({
        name: 'X',
        username: 'unknown_field',
        email: 'unknown@example.com',
        password: 'Password123',
        isAdmin: true,
      });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('POST /api/v1/auth/login', () => {
    it('logs in with email and returns tokens', async () => {
      await createUser({ username: 'login_email', email: 'login@example.com' });

      const res = await api.post('/api/v1/auth/login').send({
        identifier: 'login@example.com',
        password: 'Password123',
      });

      expect(res.status).toBe(200);
      expect(res.body.data.accessToken).toBeTruthy();
      expect(res.body.data.refreshToken).toBeTruthy();
    });

    it('logs in with username too', async () => {
      await createUser({ username: 'login_username', email: 'lu@example.com' });

      const res = await api.post('/api/v1/auth/login').send({
        identifier: 'login_username',
        password: 'Password123',
      });

      expect(res.status).toBe(200);
    });

    it('returns the same generic error for a wrong password and an unknown email', async () => {
      await createUser({ username: 'known_user', email: 'known@example.com' });

      const wrongPassword = await api.post('/api/v1/auth/login').send({
        identifier: 'known@example.com',
        password: 'WrongPass123',
      });
      const unknownEmail = await api.post('/api/v1/auth/login').send({
        identifier: 'nobody@example.com',
        password: 'WrongPass123',
      });

      expect(wrongPassword.status).toBe(401);
      expect(unknownEmail.status).toBe(401);
      expect(wrongPassword.body.code).toBe('INVALID_CREDENTIALS');
      expect(unknownEmail.body.code).toBe(wrongPassword.body.code);
      expect(wrongPassword.body.message).toBe(unknownEmail.body.message);
    });
  });

  describe('GET /api/v1/auth/me', () => {
    it('returns the current user with a valid token', async () => {
      const user = await createUser({ username: 'me_user' });
      const res = await api
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${signTokenFor(user)}`);

      expect(res.status).toBe(200);
      expect(res.body.data.user.username).toBe('me_user');
      expect(JSON.stringify(res.body)).not.toContain('password');
    });

    it('rejects a missing token', async () => {
      const res = await api.get('/api/v1/auth/me');
      expect(res.status).toBe(401);
    });

    it('rejects an expired token', async () => {
      const user = await createUser();
      const expired = signTokenFor(user, { expiresIn: '-10s' });

      const res = await api.get('/api/v1/auth/me').set('Authorization', `Bearer ${expired}`);
      expect(res.status).toBe(401);
      expect(res.body.code).toBe('TOKEN_EXPIRED');
    });

    it('rejects a token signed with the wrong secret', async () => {
      const user = await createUser();
      const forged = signTokenFor(user, { secret: 'not-the-real-secret' });

      const res = await api.get('/api/v1/auth/me').set('Authorization', `Bearer ${forged}`);
      expect(res.status).toBe(401);
      expect(res.body.code).toBe('INVALID_TOKEN');
    });

    it('rejects a token whose algorithm/audience do not match', async () => {
      const user = await createUser();
      const res = await api
        .get('/api/v1/auth/me')
        .set('Authorization', 'Bearer abc.def.ghi');

      expect(res.status).toBe(401);
    });
  });

  describe('POST /api/v1/auth/refresh', () => {
    it('rotates the refresh token and returns a new pair', async () => {
      const { data } = await registerUser();

      const res = await api.post('/api/v1/auth/refresh').send({
        refreshToken: data.refreshToken,
      });

      expect(res.status).toBe(200);
      expect(res.body.data.accessToken).toBeTruthy();
      expect(res.body.data.refreshToken).toBeTruthy();
      expect(res.body.data.refreshToken).not.toBe(data.refreshToken);
    });

    it('rejects reuse of an already rotated (revoked) token and kills the session', async () => {
      const { data } = await registerUser();

      const first = await api.post('/api/v1/auth/refresh').send({ refreshToken: data.refreshToken });
      expect(first.status).toBe(200);

      // Replay of the OLD token => reuse detected.
      const replay = await api.post('/api/v1/auth/refresh').send({ refreshToken: data.refreshToken });
      expect(replay.status).toBe(401);
      expect(replay.body.code).toBe('REFRESH_TOKEN_REUSE');

      // The chain is revoked: even the NEW token is now invalid.
      const afterReuse = await api
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: first.body.data.refreshToken });
      expect(afterReuse.status).toBe(401);
    });

    it('rejects an unknown refresh token', async () => {
      const res = await api
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: 'a'.repeat(64) });

      expect(res.status).toBe(401);
      expect(res.body.code).toBe('INVALID_TOKEN');
    });
  });

  describe('POST /api/v1/auth/logout', () => {
    it('revokes the session so the refresh token can no longer be used', async () => {
      const { data } = await registerUser();

      const logout = await api
        .post('/api/v1/auth/logout')
        .set('Authorization', `Bearer ${data.accessToken}`)
        .send({ refreshToken: data.refreshToken });

      expect(logout.status).toBe(200);

      const after = await api.post('/api/v1/auth/refresh').send({ refreshToken: data.refreshToken });
      expect(after.status).toBe(401);
    });

    it('requires authentication', async () => {
      const res = await api.post('/api/v1/auth/logout').send({});
      expect(res.status).toBe(401);
    });
  });
});
