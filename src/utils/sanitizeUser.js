/**
 * Central helpers to strip sensitive fields from user output.
 * Nothing else in the app should hand a raw user document to res.json().
 */

const SENSITIVE_FIELDS = ['password', '__v', 'passwordResetToken', 'tokenHash', 'deletedAt'];

/** Remove sensitive fields from a user document/object. */
export const sanitizeUser = (user) => {
  if (!user) return null;
  const obj = typeof user.toObject === 'function' ? user.toObject() : { ...user };
  for (const field of SENSITIVE_FIELDS) delete obj[field];
  return obj;
};

/** Minimal public profile (what other users / anonymous senders may see). */
export const toPublicUser = (user) => {
  if (!user) return null;
  const obj = typeof user.toObject === 'function' ? user.toObject() : { ...user };
  return {
    username: obj.username,
    name: obj.name,
    bio: obj.bio ?? '',
    avatar: obj.avatar ?? '',
    createdAt: obj.createdAt,
  };
};

export default sanitizeUser;
