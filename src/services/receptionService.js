import crypto from 'node:crypto';
import User from '../models/User.js';
import AppError from '../utils/AppError.js';
import { MESSAGE_CATEGORY_VALUES, CATEGORY_META } from '../constants/feedback.js';

/**
 * Reception policy + guided-honesty prompts.
 *
 * These are the recipient's own rules for what reaches them. They are product
 * features, not a security boundary: the security boundary is that a sender is
 * never stored. A policy can therefore be changed freely and takes effect on
 * the next message.
 *
 * WHAT A SENDER MAY SEE
 * Only the policy the owner chose to publish (paused state, allowed categories,
 * policy text, prompts). Nothing here leaks account existence beyond the public
 * profile the sender already opened, and a paused inbox answers the send
 * endpoint exactly like a missing account.
 */

/** Never let a client push more categories than exist. */
const sanitizeCategories = (input) => {
  if (!Array.isArray(input)) return [];
  const seen = new Set();
  for (const raw of input) {
    if (MESSAGE_CATEGORY_VALUES.includes(raw)) seen.add(raw);
  }
  return [...seen];
};

/** Cap the number of custom prompts so a page cannot become a wall of text. */
const MAX_PROMPTS = 6;

/**
 * Update the caller's reception policy.
 * Only whitelisted keys are written; `isReceivingMessages` (the hard off
 * switch) is intentionally NOT settable here and stays in /users/me/password
 * style account settings.
 */
export const updateReception = async (userId, updates = {}) => {
  const user = await User.findById(userId);
  if (!user) throw AppError.notFound('User not found');

  const current = user.reception?.toObject?.() ?? user.reception ?? {};

  const next = {
    isPaused: updates.isPaused !== undefined ? Boolean(updates.isPaused) : current.isPaused ?? false,
    pauseReason:
      updates.pauseReason !== undefined
        ? String(updates.pauseReason).slice(0, 200)
        : current.pauseReason ?? '',
    allowedCategories:
      updates.allowedCategories !== undefined
        ? sanitizeCategories(updates.allowedCategories)
        : current.allowedCategories ?? [],
    policyMessage:
      updates.policyMessage !== undefined
        ? String(updates.policyMessage).slice(0, 400)
        : current.policyMessage ?? '',
    requireCategory:
      updates.requireCategory !== undefined
        ? Boolean(updates.requireCategory)
        : current.requireCategory ?? false,
    enableShield:
      updates.enableShield !== undefined ? Boolean(updates.enableShield) : current.enableShield ?? true,
    quarantineFlagged:
      updates.quarantineFlagged !== undefined
        ? Boolean(updates.quarantineFlagged)
        : current.quarantineFlagged ?? true,
  };

  // A paused inbox with a reason reads better than a silent refusal.
  if (!next.isPaused) next.pauseReason = '';

  user.reception = next;
  await user.save();

  return { reception: presentReception(user) };
};

export const getReception = async (userId) => {
  const user = await User.findById(userId);
  if (!user) throw AppError.notFound('User not found');
  return { reception: presentReception(user), prompts: presentPrompts(user.prompts) };
};

/**
 * The owner's view: full policy plus whether the hard off-switch is on, so the
 * settings screen can show one coherent state instead of two disconnected ones.
 */
export const presentReception = (user) => {
  const r = user.reception?.toObject?.() ?? user.reception ?? {};
  return {
    isPaused: Boolean(r.isPaused),
    pauseReason: r.pauseReason ?? '',
    allowedCategories: Array.isArray(r.allowedCategories) ? r.allowedCategories : [],
    policyMessage: r.policyMessage ?? '',
    requireCategory: Boolean(r.requireCategory),
    enableShield: r.enableShield !== false,
    quarantineFlagged: r.quarantineFlagged !== false,
    isReceivingMessages: user.isReceivingMessages !== false,
    availableCategories: MESSAGE_CATEGORY_VALUES.map((key) => ({
      key,
      label: CATEGORY_META[key].label,
      icon: CATEGORY_META[key].icon,
    })),
  };
};

export const presentPrompts = (prompts) =>
  (Array.isArray(prompts) ? prompts : []).map((p) => ({
    id: p.id,
    text: p.text,
    isActive: p.isActive !== false,
  }));

/**
 * Replace the caller's prompt list. Wholesale replace keeps the client simple
 * and avoids a second endpoint for reorder/toggle.
 */
export const replacePrompts = async (userId, prompts = []) => {
  if (!Array.isArray(prompts)) throw AppError.badRequest('prompts must be an array');
  if (prompts.length > MAX_PROMPTS) {
    throw AppError.badRequest(`You can publish at most ${MAX_PROMPTS} prompts`);
  }

  const user = await User.findById(userId);
  if (!user) throw AppError.notFound('User not found');

  user.prompts = prompts.map((p) => ({
    id: crypto.randomUUID(),
    text: String(p.text ?? '').trim(),
    isActive: p.isActive !== false,
  })).filter((p) => p.text.length >= 3);

  if (user.prompts.length > MAX_PROMPTS) {
    throw AppError.badRequest(`You can publish at most ${MAX_PROMPTS} prompts`);
  }

  await user.save();
  return { prompts: presentPrompts(user.prompts) };
};

/**
 * What a SENDER sees when they open a public profile.
 * Deliberately excludes anything the owner did not publish: a sender must not
 * be able to probe settings (e.g. the exact allow-list) when the owner kept the
 * policy private.
 */
export const presentPublicPolicy = (user) => {
  const r = user.reception?.toObject?.() ?? user.reception ?? {};
  const isPaused = Boolean(r.isPaused);
  const prompts = presentPrompts(user.prompts).filter((p) => p.isActive);

  return {
    isPaused,
    pauseReason: r.pauseReason ?? '',
    policyMessage: r.policyMessage ?? '',
    requireCategory: Boolean(r.requireCategory),
    // The allow-list is only disclosed when it actually constrains the sender,
    // because that constraint is about to be visible in the UI anyway.
    allowedCategories: Array.isArray(r.allowedCategories) && r.allowedCategories.length > 0
      ? r.allowedCategories.map((key) => ({ key, label: CATEGORY_META[key].label, icon: CATEGORY_META[key].icon }))
      : null,
    prompts,
  };
};

export default {
  updateReception,
  getReception,
  replacePrompts,
  presentReception,
  presentPublicPolicy,
  presentPrompts,
};
