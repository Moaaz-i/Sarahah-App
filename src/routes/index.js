import { Router } from 'express';
import oauthRoutes from './oauthRoutes.js';
import authRoutes from './authRoutes.js';
import userRoutes from './userRoutes.js';
import messageRoutes from './messageRoutes.js';
import reportRoutes from './reportRoutes.js';
import passwordRoutes from './passwordRoutes.js';
import confirmEmailRoutes from './confirmEmailRoutes.js';
import feedbackRoutes from './feedbackRoutes.js';
import adminRoutes from './adminRoutes.js';
import identityRequestRoutes from './identityRequestRoutes.js';
import conversationRoutes from './conversationRoutes.js';

/** All API routers, mounted under /api/v1 in app.js. */
const apiRouter = Router();

// OAuth lives under /auth/google and must be declared before the generic
// /auth router so its paths are claimed unambiguously.
apiRouter.use('/auth/google', oauthRoutes);
apiRouter.use('/auth', authRoutes);
apiRouter.use('/users', userRoutes);
apiRouter.use('/messages', messageRoutes);
apiRouter.use('/identity-requests', identityRequestRoutes);
apiRouter.use('/conversations', conversationRoutes);
apiRouter.use('/reports', reportRoutes);
apiRouter.use('/password', passwordRoutes);
apiRouter.use('/confirm-email', confirmEmailRoutes);
// The feedback router declares its own absolute paths (/reception, /mirror,
// /goals), so it is mounted once at the API root, plus an alias under /feedback.
apiRouter.use('/', feedbackRoutes);
apiRouter.use('/feedback', feedbackRoutes);
apiRouter.use('/admin', adminRoutes);

export default apiRouter;
