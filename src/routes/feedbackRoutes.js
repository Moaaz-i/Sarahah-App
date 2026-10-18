import { Router } from 'express';
import feedbackController from '../controllers/feedbackController.js';
import authMiddleware from '../middleware/authMiddleware.js';
import validate from '../middleware/validateMiddleware.js';
import {
  updateReceptionSchema,
  replacePromptsSchema,
  mirrorQuerySchema,
  createGoalSchema,
  updateGoalSchema,
  listGoalsQuerySchema,
  goalIdParamSchema,
} from '../validators/feedbackValidator.js';

/**
 * The "useful honesty" surface: reception policy, guided prompts, the feedback
 * mirror, and personal goals. Everything here is authenticated and scoped to
 * the caller — no endpoint reads another user's data.
 */
const router = Router();

/* ---------------------------- Reception ---------------------------- */

router.get('/reception', authMiddleware, feedbackController.getReception);

router.put(
  '/reception',
  authMiddleware,
  validate({ body: updateReceptionSchema }),
  feedbackController.updateReception,
);

router.put(
  '/reception/prompts',
  authMiddleware,
  validate({ body: replacePromptsSchema }),
  feedbackController.replacePrompts,
);

/* ----------------------------- Mirror ------------------------------ */

router.get(
  '/mirror',
  authMiddleware,
  validate({ query: mirrorQuerySchema }),
  feedbackController.getMirror,
);

/* ------------------------------ Goals ------------------------------ */

router.get(
  '/goals',
  authMiddleware,
  validate({ query: listGoalsQuerySchema }),
  feedbackController.listGoals,
);

router.post(
  '/goals',
  authMiddleware,
  validate({ body: createGoalSchema }),
  feedbackController.createGoal,
);

// Declared before /goals/:id so "due" is never read as an ObjectId.
router.get('/goals/due', authMiddleware, feedbackController.dueGoals);

router.get(
  '/goals/:id',
  authMiddleware,
  validate({ params: goalIdParamSchema }),
  feedbackController.getGoal,
);

router.patch(
  '/goals/:id',
  authMiddleware,
  validate({ params: goalIdParamSchema, body: updateGoalSchema }),
  feedbackController.updateGoal,
);

router.delete(
  '/goals/:id',
  authMiddleware,
  validate({ params: goalIdParamSchema }),
  feedbackController.deleteGoal,
);

export default router;
