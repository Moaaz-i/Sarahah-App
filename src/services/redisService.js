import crypto from 'node:crypto';
import { Redis } from '@upstash/redis';
import env from '../config/env.js';

/**
 * Redis Service for Sar7ny.
 *
 * Provides a robust, easy-to-use client interface for Redis:
 * - Direct cloud connection using Upstash Redis REST (@upstash/redis).
 * - Comprehensive helper functions (get, set, setEx, del, exists, expire, hashes, sets, etc.).
 * - Automatic in-memory fallback if Redis is unavailable or unconfigured (dev/test safety).
 * - Specialized token revocation & blacklisting methods for device & multi-device logouts.
 */

let client = null;
const memoryStore = new Map();
const memoryExpiry = new Map();

// Helper to hash tokens for storage keys so raw tokens are never saved
const hashTokenKey = (token) =>
  crypto.createHash('sha256').update(String(token)).digest('hex');

// Check memory expiry
const isMemoryExpired = (key) => {
  const exp = memoryExpiry.get(key);
  if (exp && Date.now() > exp) {
    memoryStore.delete(key);
    memoryExpiry.delete(key);
    return true;
  }
  return false;
};

// Initialize Upstash Redis client if configured
if (env.redis.enabled) {
  try {
    client = new Redis({
      url: env.redis.url,
      token: env.redis.token,
    });
  } catch (err) {
    console.warn('[Redis] Failed to initialize Redis client, using in-memory fallback:', err.message);
    client = null;
  }
} else if (!env.isTest) {
  console.warn('[Redis] Redis credentials missing in env, using in-memory store.');
}

/**
 * Raw Redis client accessor.
 */
export const getClient = () => client;

/**
 * Check if Redis is connected and alive.
 */
export const ping = async () => {
  if (client) {
    try {
      return await client.ping();
    } catch (err) {
      console.warn('[Redis] Ping failed:', err.message);
    }
  }
  return 'PONG (in-memory)';
};

/* ------------------------------------------------------------------ Core Key/Value */

/**
 * Get a value by key.
 */
export const get = async (key) => {
  if (client) {
    try {
      return await client.get(key);
    } catch (err) {
      console.warn(`[Redis] get(${key}) error:`, err.message);
    }
  }
  if (isMemoryExpired(key)) return null;
  const val = memoryStore.get(key);
  return val !== undefined ? val : null;
};

/**
 * Set a key-value pair with optional TTL in seconds.
 */
export const set = async (key, value, ttlSeconds = null) => {
  if (client) {
    try {
      if (ttlSeconds && Number(ttlSeconds) > 0) {
        return await client.set(key, value, { ex: Math.floor(Number(ttlSeconds)) });
      }
      return await client.set(key, value);
    } catch (err) {
      console.warn(`[Redis] set(${key}) error:`, err.message);
    }
  }
  memoryStore.set(key, value);
  if (ttlSeconds && Number(ttlSeconds) > 0) {
    memoryExpiry.set(key, Date.now() + Number(ttlSeconds) * 1000);
  } else {
    memoryExpiry.delete(key);
  }
  return 'OK';
};

/**
 * Set a key with exact expiration time in seconds (standard setEx alias).
 */
export const setEx = async (key, ttlSeconds, value) => {
  return set(key, value, ttlSeconds);
};

/**
 * Delete one or more keys.
 */
export const del = async (...keys) => {
  if (keys.length === 0) return 0;
  if (client) {
    try {
      return await client.del(...keys);
    } catch (err) {
      console.warn(`[Redis] del error:`, err.message);
    }
  }
  let count = 0;
  for (const k of keys) {
    if (memoryStore.has(k)) {
      memoryStore.delete(k);
      memoryExpiry.delete(k);
      count++;
    }
  }
  return count;
};

/**
 * Check if a key exists.
 */
export const exists = async (key) => {
  if (client) {
    try {
      return (await client.exists(key)) > 0;
    } catch (err) {
      console.warn(`[Redis] exists(${key}) error:`, err.message);
    }
  }
  if (isMemoryExpired(key)) return false;
  return memoryStore.has(key);
};

/**
 * Set expiration on an existing key (in seconds).
 */
export const expire = async (key, seconds) => {
  if (client) {
    try {
      return await client.expire(key, Math.floor(seconds));
    } catch (err) {
      console.warn(`[Redis] expire(${key}) error:`, err.message);
    }
  }
  if (!memoryStore.has(key) || isMemoryExpired(key)) return 0;
  memoryExpiry.set(key, Date.now() + seconds * 1000);
  return 1;
};

/**
 * Get remaining TTL of a key in seconds (-1 if no expire, -2 if not exists).
 */
export const ttl = async (key) => {
  if (client) {
    try {
      return await client.ttl(key);
    } catch (err) {
      console.warn(`[Redis] ttl(${key}) error:`, err.message);
    }
  }
  if (!memoryStore.has(key) || isMemoryExpired(key)) return -2;
  const exp = memoryExpiry.get(key);
  if (!exp) return -1;
  const remaining = Math.floor((exp - Date.now()) / 1000);
  return remaining > 0 ? remaining : -2;
};

/**
 * Increment a numerical key.
 */
export const incr = async (key) => {
  if (client) {
    try {
      return await client.incr(key);
    } catch (err) {
      console.warn(`[Redis] incr(${key}) error:`, err.message);
    }
  }
  const current = Number(memoryStore.get(key) || 0) + 1;
  memoryStore.set(key, current);
  return current;
};

/**
 * Decrement a numerical key.
 */
export const decr = async (key) => {
  if (client) {
    try {
      return await client.decr(key);
    } catch (err) {
      console.warn(`[Redis] decr(${key}) error:`, err.message);
    }
  }
  const current = Number(memoryStore.get(key) || 0) - 1;
  memoryStore.set(key, current);
  return current;
};

/* ------------------------------------------------------------------ Hash Operations */

export const hget = async (key, field) => {
  if (client) {
    try {
      return await client.hget(key, field);
    } catch (err) {
      console.warn(`[Redis] hget error:`, err.message);
    }
  }
  const hash = memoryStore.get(key);
  return hash && typeof hash === 'object' ? hash[field] ?? null : null;
};

export const hset = async (key, field, value) => {
  if (client) {
    try {
      return await client.hset(key, { [field]: value });
    } catch (err) {
      console.warn(`[Redis] hset error:`, err.message);
    }
  }
  let hash = memoryStore.get(key);
  if (!hash || typeof hash !== 'object') {
    hash = {};
    memoryStore.set(key, hash);
  }
  hash[field] = value;
  return 1;
};

export const hdel = async (key, ...fields) => {
  if (client) {
    try {
      return await client.hdel(key, ...fields);
    } catch (err) {
      console.warn(`[Redis] hdel error:`, err.message);
    }
  }
  const hash = memoryStore.get(key);
  if (!hash || typeof hash !== 'object') return 0;
  let count = 0;
  for (const f of fields) {
    if (f in hash) {
      delete hash[f];
      count++;
    }
  }
  return count;
};

export const hgetall = async (key) => {
  if (client) {
    try {
      return await client.hgetall(key);
    } catch (err) {
      console.warn(`[Redis] hgetall error:`, err.message);
    }
  }
  const hash = memoryStore.get(key);
  return hash && typeof hash === 'object' ? { ...hash } : null;
};

/* ------------------------------------------------------------------ Utility */

export const flushAll = async () => {
  if (client) {
    try {
      await client.flushall();
    } catch (err) {
      console.warn(`[Redis] flushall error:`, err.message);
    }
  }
  memoryStore.clear();
  memoryExpiry.clear();
  return 'OK';
};

/* ------------------------------------------------ Token Revocation & Blacklist */

/**
 * Blacklist an access token until its expiration time.
 * @param {string} token - The raw access token string.
 * @param {number} expiresInSeconds - Remaining lifetime in seconds.
 */
export const blacklistToken = async (token, expiresInSeconds = 900) => {
  if (!token) return false;
  const hash = hashTokenKey(token);
  const key = `blacklist:token:${hash}`;
  const ttlSec = Math.max(1, Math.floor(expiresInSeconds));
  await set(key, 'revoked', ttlSec);
  return true;
};

/**
 * Check if an access token has been blacklisted.
 * @param {string} token - The raw access token string.
 */
export const isTokenBlacklisted = async (token) => {
  if (!token) return false;
  const hash = hashTokenKey(token);
  const key = `blacklist:token:${hash}`;
  return await exists(key);
};

/**
 * Record that all tokens for a user have been revoked (logout from all devices).
 * @param {string} userId - User ID.
 * @param {number} ttlSeconds - Duration to maintain the revocation flag (default: 7 days).
 */
export const revokeAllUserTokens = async (userId, ttlSeconds = 7 * 24 * 3600) => {
  if (!userId) return false;
  const key = `user:logout_all:${String(userId)}`;
  const now = Math.floor(Date.now() / 1000);
  await set(key, String(now), ttlSeconds);
  return true;
};

/**
 * Get the timestamp (in seconds) when the user revoked all sessions.
 */
export const getUserRevokedAt = async (userId) => {
  if (!userId) return 0;
  const key = `user:logout_all:${String(userId)}`;
  const val = await get(key);
  return val ? Number(val) : 0;
};

/**
 * Check if a token issued at `tokenIatInSeconds` was invalidated by an "all devices logout".
 */
export const isUserTokensRevoked = async (userId, tokenIatInSeconds) => {
  if (!userId) return false;
  const revokedAtSec = await getUserRevokedAt(userId);
  if (revokedAtSec && Number(tokenIatInSeconds) <= revokedAtSec) {
    return true;
  }
  return false;
};

export default {
  getClient,
  ping,
  get,
  set,
  setEx,
  del,
  exists,
  expire,
  ttl,
  incr,
  decr,
  hget,
  hset,
  hdel,
  hgetall,
  flushAll,
  blacklistToken,
  isTokenBlacklisted,
  revokeAllUserTokens,
  getUserRevokedAt,
  isUserTokensRevoked,
};
