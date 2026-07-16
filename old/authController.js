const jwt = require('jsonwebtoken');
const User = require('../models/User');
const logger = require('../utils/logger');
// Generate JWT Token
const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d'
  });
};
/**
 * @desc    Register a new user
 * @route   POST /api/auth/register
 * @access  Public
 */
const registerUser = async (req, res, next) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password) {
      res.status(400);
      throw new Error('Please provide all registration fields: name, email, password');
    }
    // Check if user already exists
    const userExists = await User.findOne({ email });
    if (userExists) {
      res.status(400);
      throw new Error('User already registered with this email address');
    }
    // Check if this is the first user in the DB
    const isFirstUser = (await User.countDocuments({})) === 0;
    const role = isFirstUser ? 'admin' : 'user';
    // Create user (password hashing is done automatically by pre-save hook)
    const user = await User.create({
      name,
      email,
      role,
      password
    });
    if (user) {
      logger.info(`User registered successfully: ${user.email} with role: ${user.role}`);
      res.status(201).json({
        success: true,
        data: {
          _id: user._id,
          name: user.name,
          email: user.email,
          role: user.role,
          token: generateToken(user._id)
        }
      });
    } else {
      res.status(400);
      throw new Error('Invalid user data received');
    }
  } catch (error) {
    next(error);
  }
};
/**
 * @desc    Authenticate user & get token (Login)
 * @route   POST /api/auth/login
 * @access  Public
 */
const loginUser = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      res.status(400);
      throw new Error('Please enter both email and password');
    }
    // Find user by email
    const user = await User.findOne({ email });
    // Verify user and password
    if (user && (await user.comparePassword(password))) {
      logger.info(`User logged in successfully: ${user.email}`);
      res.json({
        success: true,
        data: {
          _id: user._id,
          name: user.name,
          email: user.email,
          role: user.role,
          token: generateToken(user._id)
        }
      });
    } else {
      res.status(401);
      throw new Error('Invalid email or password credentials');
    }
  } catch (error) {
    next(error);
  }
};
/**
 * @desc    Get current user profile (Verify session token)
 * @route   GET /api/auth/me
 * @access  Private
 */
const getMe = async (req, res, next) => {
  try {
    // req.user was populated by protect middleware
    res.json({
      success: true,
      data: req.user
    });
  } catch (error) {
    next(error);
  }
};
module.exports = {
  registerUser,
  loginUser,
  getMe
};