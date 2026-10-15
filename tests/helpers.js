import bcrypt from 'bcryptjs';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../src/app.js';
import User from '../src/models/User.js';
import Message from '../src/models/Message.js';
import env from '../src/config/env.js';

/** Supertest instance of the app (no port is opened). */
export const api = request(app);

export { app, User, Message };

/** Create a user directly in the DB (bypassing the API) and return it. */
export const createUser = async (overrides = {}) => {
  const data = {
    name: 'Test User',
    username: `user_${Math.random().toString(36).slice(2, 10)}`,
    email: `${Math.random().toString(36).slice(2, 10)}@example.com`,
    password: await bcrypt.hash('Password123', 4),
    role: 'user',
    isActive: true,
    isVerified: false,
    isReceivingMessages: true,
    authProvider: 'local',
    ...overrides,
  };

  return User.create(data);
};

/** Sign a valid access token for a user id. */
export const signTokenFor = (user, { expiresIn = '15m', secret = env.jwt.accessSecret } = {}) =>
  jwt.sign(
    { sub: String(user._id), role: user.role, type: 'access' },
    secret,
    { expiresIn, issuer: env.jwt.issuer, audience: env.jwt.audience, algorithm: 'HS256' },
  );

/** Register through the API and return the auth payload (user + tokens). */
export const registerUser = async (overrides = {}) => {
  const body = {
    name: 'Api User',
    username: `api_${Math.random().toString(36).slice(2, 10)}`,
    email: `${Math.random().toString(36).slice(2, 10)}@example.com`,
    password: 'Password123',
    ...overrides,
  };

  const res = await api.post('/api/v1/auth/register').send(body);
  return { res, body, data: res.body.data };
};

/** Register + return an Authorization header object. */
export const authHeaderFor = async (overrides = {}) => {
  const { data, body } = await registerUser(overrides);
  return {
    authorization: { Authorization: `Bearer ${data.accessToken}` },
    user: data.user,
    tokens: {
      accessToken: data.accessToken,
      refreshToken: data.refreshToken,
    },
    registered: body,
  };
};

/** Insert a message for a recipient directly in the DB. */
export const createMessage = async (recipientId, overrides = {}) =>
  Message.create({
    recipient: recipientId,
    content: 'Hello there, this is a test message',
    ...overrides,
  });

/** Make an admin user directly in the DB. */
export const createAdmin = async (overrides = {}) =>
  createUser({ role: 'admin', username: `admin_${Math.random().toString(36).slice(2, 8)}`, ...overrides });

export default api;
