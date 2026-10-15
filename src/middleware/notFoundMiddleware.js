import AppError from '../utils/AppError.js';

/** 404 handler for unknown routes. Registered before the error middleware. */
const notFoundMiddleware = (req, res, next) => {
  next(AppError.notFound(`Route ${req.method} ${req.originalUrl} not found`));
};

export default notFoundMiddleware;
