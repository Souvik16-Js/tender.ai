const jwt = require('jsonwebtoken');
const User = require('../models/User');
const logger = require('../utils/logger');
/**
 * Protect routes: Authenticates user using Bearer Token
 */
const protect = async (req, res, next) => {
  let token;
  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith('Bearer')
  ) {
    try {
      // Extract token from header
      token = req.headers.authorization.split(' ')[1];
      // Verify token
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      // Get user from DB (excluding password)
      req.user = await User.findById(decoded.id).select('-password');
      
      if (!req.user) {
        return res.status(401).json({ success: false, message: 'Not authorized, user not found' });
      }
      next();
    } catch (error) {
      logger.error('Authentication JWT token verification failed: %O', error);
      res.status(401).json({ success: false, message: 'Not authorized, token validation failed' });
    }
  }
  if (!token) {
    res.status(401).json({ success: false, message: 'Not authorized, token missing in request headers' });
  }
};
/**
 * Admin role access verification middleware
 */
const adminOnly = (req, res, next) => {
  if (req.user && req.user.role === 'admin') {
    next();
  } else {
    res.status(403).json({ success: false, message: 'Access denied: Admin permissions required' });
  }
};
module.exports = {
  protect,
  adminOnly
};
