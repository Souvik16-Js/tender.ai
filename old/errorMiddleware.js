const logger = require('../utils/logger');
/**
 * Unified global error handling middleware for JSON API responders
 */
const errorHandler = (err, req, res, next) => {
  const statusCode = res.statusCode === 200 ? 500 : res.statusCode;
  
  // Log full error stack details using winston
  logger.error(`Error processing path [${req.method}] ${req.originalUrl}: %O`, err);
  res.status(statusCode).json({
    success: false,
    message: err.message || 'Internal Server Error',
    stack: process.env.NODE_ENV === 'production' ? null : err.stack
  });
};
/**
 * 404 Route handler for unregistered API endpoints
 */
const notFoundHandler = (req, res, next) => {
  const error = new Error(`Resource not found - ${req.originalUrl}`);
  res.status(404);
  next(error);
};
module.exports = {
  errorHandler,
  notFoundHandler
};
