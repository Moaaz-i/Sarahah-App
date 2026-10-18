import asyncHandler from '../utils/asyncHandler.js';
import * as receptionService from '../services/receptionService.js';
import * as mirrorService from '../services/mirrorService.js';
import * as goalService from '../services/goalService.js';

/* ------------------------------------------------------------------ */
/* Reception policy — the recipient's own rules for what reaches them. */
/* ------------------------------------------------------------------ */

/** GET /api/v1/reception */
export const getReception = asyncHandler(async (req, res) => {
  const data = await receptionService.getReception(req.user._id);

  res.status(200).json({
    success: true,
    message: 'Reception policy fetched',
    data,
  });
});

/** PUT /api/v1/reception — partial update. */
export const updateReception = asyncHandler(async (req, res) => {
  const data = await receptionService.updateReception(req.user._id, req.body);

  res.status(200).json({
    success: true,
    message: 'Reception policy updated',
    data,
  });
});

/** PUT /api/v1/reception/prompts — wholesale replace. */
export const replacePrompts = asyncHandler(async (req, res) => {
  const data = await receptionService.replacePrompts(req.user._id, req.body.prompts);

  res.status(200).json({
    success: true,
    message: 'Prompts updated',
    data,
  });
});

/* ------------------------------------------------------------------ */
/* Feedback mirror — counts the user already owns, nothing inferred.   */
/* ------------------------------------------------------------------ */

/** GET /api/v1/mirror?period=30d|90d|all */
export const getMirror = asyncHandler(async (req, res) => {
  const data = await mirrorService.buildMirror(req.user._id, req.query.period);

  res.status(200).json({
    success: true,
    message: 'Feedback mirror fetched',
    data,
  });
});

/* ------------------------------------------------------------------ */
/* Goals — turning a note into the owner's own commitment.             */
/* ------------------------------------------------------------------ */

/** POST /api/v1/goals */
export const createGoal = asyncHandler(async (req, res) => {
  const data = await goalService.createGoal(req.user._id, {
    messageId: req.body.messageId ?? null,
    note: req.body.note,
    action: req.body.action ?? '',
    reviewAt: req.body.reviewAt,
  });

  res.status(201).json({
    success: true,
    message: 'Goal created',
    data,
  });
});

/** GET /api/v1/goals */
export const listGoals = asyncHandler(async (req, res) => {
  const data = await goalService.listGoals(req.user._id, {
    status: req.query.status,
    limit: req.query.limit,
  });

  res.status(200).json({
    success: true,
    message: 'Goals fetched',
    data,
  });
});

/** GET /api/v1/goals/due — self-chosen review dates that have arrived. */
export const dueGoals = asyncHandler(async (req, res) => {
  const data = await goalService.dueForReview(req.user._id);

  res.status(200).json({
    success: true,
    message: 'Goals due for review fetched',
    data,
  });
});

/** GET /api/v1/goals/:id */
export const getGoal = asyncHandler(async (req, res) => {
  const data = await goalService.getGoal(req.user._id, req.params.id);

  res.status(200).json({
    success: true,
    message: 'Goal fetched',
    data,
  });
});

/** PATCH /api/v1/goals/:id */
export const updateGoal = asyncHandler(async (req, res) => {
  const data = await goalService.updateGoal(req.user._id, req.params.id, req.body);

  res.status(200).json({
    success: true,
    message: 'Goal updated',
    data,
  });
});

/** DELETE /api/v1/goals/:id */
export const deleteGoal = asyncHandler(async (req, res) => {
  const data = await goalService.deleteGoal(req.user._id, req.params.id);

  res.status(200).json({
    success: true,
    message: 'Goal deleted',
    data,
  });
});

export default {
  getReception,
  updateReception,
  replacePrompts,
  getMirror,
  createGoal,
  listGoals,
  dueGoals,
  getGoal,
  updateGoal,
  deleteGoal,
};
