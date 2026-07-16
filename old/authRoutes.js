const express = require('express');
const { registerUser, loginUser, getMe } = require('./authController');
const { protect } = require('../middlewares/authMiddleware');
const router = express.Router();
// Public routes
router.post('/register', registerUser);
router.post('/login', loginUser);
// Private protected routes
router.get('/me', protect, getMe);
module.exports = router;
