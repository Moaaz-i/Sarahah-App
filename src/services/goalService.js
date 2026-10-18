import FeedbackGoal from '../models/FeedbackGoal.js';
import Message from '../models/Message.js';
import AppError from '../utils/AppError.js';
import { GOAL_STATUSES } from '../constants/feedback.js';

/**
 * Goal service: turning a received note into the owner's own commitment.
 *
 * PRIVACY: a goal is readable only by its owner. Every query is scoped to
 * `owner: userId`, so a guessed id returns 404 rather than 403 — knowing an id
 * must never confirm that it exists.
 *
 * HONESTY: a goal records the owner's intention and their own rating. There is
 * no "effectiveness" score and no claim that the underlying feedback was true.
 */

const present = (goal) => ({
  _id: goal._id,
  message: goal.message ?? null,
  note: goal.note,
  action: goal.action ?? '',
  reviewAt: goal.reviewAt ?? null,
  status: goal.status,
  rating: goal.rating ?? 0,
  reflection: goal.reflection ?? '',
  completedAt: goal.completedAt ?? null,
  createdAt: goal.createdAt,
  updatedAt: goal.updatedAt,
});

/** Optional review date must be in the future and within a sane horizon. */
const assertReviewDate = (reviewAt) => {
  if (!reviewAt) return null;
  const date = new Date(reviewAt);
  if (Number.isNaN(date.getTime())) throw AppError.badRequest('Invalid review date');
  if (date.getTime() < Date.now()) throw AppError.badRequest('Review date must be in the future');
  if (date.getTime() > Date.now() + 365 * 24 * 60 * 60 * 1000) {
    throw AppError.badRequest('Review date cannot be more than a year away');
  }
  return date;
};

/** Creating from a message: the message must belong to the caller. */
const assertOwnMessage = async (userId, messageId) => {
  if (!messageId) return null;
  const message = await Message.findOne({ _id: messageId, recipient: userId, isDeleted: false });
  if (!message) throw AppError.notFound('Message not found');
  return message._id;
};

export const createGoal = async (userId, { messageId = null, note, action = '', reviewAt = null }) => {
  const messageRef = await assertOwnMessage(userId, messageId);
  const review = assertReviewDate(reviewAt);

  const goal = await FeedbackGoal.create({
    owner: userId,
    message: messageRef,
    note,
    action,
    reviewAt: review,
  });

  // Back-link so the inbox can show "you turned this into a goal".
  if (messageRef) {
    await Message.updateOne({ _id: messageRef, recipient: userId }, { $set: { goal: goal._id } });
  }

  return { goal: present(goal) };
};

export const listGoals = async (userId, { status, limit = 50 } = {}) => {
  const filter = { owner: userId };
  if (status) filter.status = status;

  const goals = await FeedbackGoal.find(filter)
    .sort({ createdAt: -1, _id: -1 })
    .limit(Math.min(limit, 100));

  return { goals: goals.map(present) };
};

export const getGoal = async (userId, goalId) => {
  const goal = await FeedbackGoal.findOne({ _id: goalId, owner: userId });
  if (!goal) throw AppError.notFound('Goal not found');
  return { goal: present(goal) };
};

/** Only whitelisted fields are ever written, so a client cannot set `owner`. */
export const updateGoal = async (userId, goalId, updates = {}) => {
  const goal = await FeedbackGoal.findOne({ _id: goalId, owner: userId });
  if (!goal) throw AppError.notFound('Goal not found');

  if (updates.note !== undefined) goal.note = updates.note;
  if (updates.action !== undefined) goal.action = updates.action;
  if (updates.reflection !== undefined) goal.reflection = updates.reflection;
  if (updates.rating !== undefined) goal.rating = updates.rating;
  if (updates.reviewAt !== undefined) goal.reviewAt = assertReviewDate(updates.reviewAt);

  if (updates.status !== undefined) {
    goal.status = updates.status;
    goal.completedAt = updates.status === GOAL_STATUSES.DONE ? new Date() : null;
  }

  await goal.save();
  return { goal: present(goal) };
};

/** Hard delete, and clear the back-link so the inbox does not dangle. */
export const deleteGoal = async (userId, goalId) => {
  const goal = await FeedbackGoal.findOneAndDelete({ _id: goalId, owner: userId });
  if (!goal) throw AppError.notFound('Goal not found');

  if (goal.message) {
    await Message.updateOne(
      { _id: goal.message, recipient: userId },
      { $set: { goal: null } },
    );
  }

  return { deleted: true, goalId: String(goal._id) };
};

/** Goals whose self-chosen review date has arrived. Used by the dashboard. */
export const dueForReview = async (userId, now = new Date()) => {
  const goals = await FeedbackGoal.find({
    owner: userId,
    status: GOAL_STATUSES.ACTIVE,
    reviewAt: { $lte: now },
  }).sort({ reviewAt: 1 }).limit(10);

  return { goals: goals.map(present) };
};

export default { createGoal, listGoals, getGoal, updateGoal, deleteGoal, dueForReview };
