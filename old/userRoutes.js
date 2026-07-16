const express = require('express');
const {
  getSavedTenders,
  toggleSaveTender,
  getAlerts,
  createAlert,
  deleteAlert
} = require('./userController');
const { protect } = require('../middlewares/authMiddleware');
const router = express.Router();
// Watchlist routes
router.get('/saved-tenders', protect, getSavedTenders);
router.post('/saved-tenders/:id', protect, toggleSaveTender);
// Custom alerts preferences routes
router.get('/alerts', protect, getAlerts);
router.post('/alerts', protect, createAlert);
router.delete('/alerts/:id', protect, deleteAlert);
module.exports = router;
