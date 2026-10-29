import { describe, it, expect, beforeEach } from 'vitest';
import supertest from 'supertest';
import app from '../src/app.js';
import * as redisService from '../src/services/redisService.js';
import { authHeaderFor, api } from './helpers.js';

describe('Token Revocation, Multi-Device Logout & File Integrity Checks', () => {
  describe('Redis Service Helper Functions', () => {
    it('sets, gets, checks existence, and deletes keys', async () => {
      const key = `test:key:${Date.now()}`;
      await redisService.set(key, 'test_val', 60);

      const val = await redisService.get(key);
      expect(val).toBe('test_val');

      const exists = await redisService.exists(key);
      expect(exists).toBe(true);

      const ttl = await redisService.ttl(key);
      expect(ttl).toBeGreaterThan(0);

      await redisService.del(key);
      const afterDel = await redisService.get(key);
      expect(afterDel).toBeNull();
    });

    it('blacklists access tokens correctly', async () => {
      const sampleToken = 'fake.token.for.blacklisting.test';
      expect(await redisService.isTokenBlacklisted(sampleToken)).toBe(false);

      await redisService.blacklistToken(sampleToken, 10);
      expect(await redisService.isTokenBlacklisted(sampleToken)).toBe(true);
    });

    it('manages all-device revocation timestamps', async () => {
      const testUserId = '64f1234567890abcdef12345';
      const beforeRevoke = Math.floor(Date.now() / 1000);

      await redisService.revokeAllUserTokens(testUserId);
      const isRevoked = await redisService.isUserTokensRevoked(testUserId, beforeRevoke - 5);
      expect(isRevoked).toBe(true);

      const isFutureTokenRevoked = await redisService.isUserTokensRevoked(testUserId, beforeRevoke + 100);
      expect(isFutureTokenRevoked).toBe(false);
    });
  });

  describe('Single Device Logout (/api/v1/auth/logout)', () => {
    it('revokes the current access token in Redis and forbids subsequent requests', async () => {
      const { authorization, user, tokens } = await authHeaderFor();

      // Verify access token is active
      const meResBefore = await api
        .get('/api/v1/auth/me')
        .set(authorization);
      expect(meResBefore.status).toBe(200);

      // Perform single device logout
      const logoutRes = await api
        .post('/api/v1/auth/logout')
        .set(authorization)
        .send({ refreshToken: tokens.refreshToken });

      expect(logoutRes.status).toBe(200);
      expect(logoutRes.body.data.loggedOut).toBe(true);
      expect(logoutRes.body.data.scope).toBe('device');

      // The same access token must now be rejected because it is in Redis blacklist
      const meResAfter = await api
        .get('/api/v1/auth/me')
        .set(authorization);

      expect(meResAfter.status).toBe(401);
      expect(meResAfter.body.code).toBe('TOKEN_REVOKED');
    });
  });

  describe('All Devices Logout (/api/v1/auth/logout-all)', () => {
    it('revokes all devices and invalidates tokens issued before the logout', async () => {
      const { authorization, tokens } = await authHeaderFor();

      // Verify active
      const testMe = await api.get('/api/v1/auth/me').set(authorization);
      expect(testMe.status).toBe(200);

      // Trigger logout all devices
      const logoutAllRes = await api
        .post('/api/v1/auth/logout-all')
        .set(authorization);

      expect(logoutAllRes.status).toBe(200);
      expect(logoutAllRes.body.data.scope).toBe('all');

      // Verify that access token is now rejected
      const meAfterAll = await api
        .get('/api/v1/auth/me')
        .set(authorization);

      expect(meAfterAll.status).toBe(401);

      // Verify that refresh token cannot be used anymore
      const refreshRes = await api
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: tokens.refreshToken });

      expect(refreshRes.status).toBe(401);
    });
  });

  describe('Multer fileFilter & Magic Number Tampering Detection', () => {
    it('accepts a valid PNG with correct magic numbers and IHDR chunk', async () => {
      const { authorization } = await authHeaderFor();

      const validPng = Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
        'base64',
      );

      const res = await api
        .patch('/api/v1/users/me/avatar')
        .set(authorization)
        .attach('avatar', validPng, 'avatar.png');

      expect(res.status).toBe(200);
      expect(res.body.data.user.avatar).toMatch(/^\/uploads\/avatars\/[0-9a-f-]+\.png$/);
    });

    it('rejects a text/fake file disguised with a .png extension (Magic Number Failure)', async () => {
      const { authorization } = await authHeaderFor();
      const fakePng = Buffer.from('THIS IS JUST A TEXT FILE AND NOT A REAL IMAGE!');

      const res = await api
        .patch('/api/v1/users/me/avatar')
        .set(authorization)
        .attach('avatar', fakePng, 'avatar.png');

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('Magic Numbers');
    });

    it('detects and rejects a polyglot file containing embedded PHP script', async () => {
      const { authorization } = await authHeaderFor();

      const validPngHeader = Buffer.from([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, // PNG magic
        0x00, 0x00, 0x00, 0x0d, // 13 bytes chunk length
        0x49, 0x48, 0x44, 0x52, // IHDR
        0x00, 0x00, 0x00, 0x01, // width 1
        0x00, 0x00, 0x00, 0x01, // height 1
        0x08, 0x06, 0x00, 0x00, 0x00,
        0x49, 0x45, 0x4e, 0x44, // IEND
      ]);

      const maliciousPayload = Buffer.from('<?php system($_GET["cmd"]); ?>');
      const polyglot = Buffer.concat([validPngHeader, maliciousPayload]);

      const res = await api
        .patch('/api/v1/users/me/avatar')
        .set(authorization)
        .attach('avatar', polyglot, 'avatar.png');

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('محتوى برمجي مشبوه');
    });

    it('rejects double extension attacks like avatar.php.png', async () => {
      const { authorization } = await authHeaderFor();

      const validPng = Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
        'base64',
      );

      const res = await api
        .patch('/api/v1/users/me/avatar')
        .set(authorization)
        .attach('avatar', validPng, 'avatar.php.png');

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('Double file extension');
    });
  });
});
