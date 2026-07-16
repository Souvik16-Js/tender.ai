const express = require('express');
const { getTenders, getTenderById, triggerCrawl } = require('./tenderController');
const { protect, adminOnly } = require('../middlewares/authMiddleware');
const router = express.Router();
// Public routes for tender searches
router.get('/', getTenders);
router.get('/:id', getTenderById);
// Admin-only crawler commands
router.post('/trigger-crawl', protect, adminOnly, triggerCrawl);
module.exports = router;
