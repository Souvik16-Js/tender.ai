const User = require('../models/User');
const Alert = require('../models/Alert');
const Tender = require('../models/Tender');
/**
 * @desc    Get user's saved tenders watchlist
 * @route   GET /api/user/saved-tenders
 * @access  Private
 */
const getSavedTenders = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id).populate('savedTenders');
    res.json({
      success: true,
      count: user.savedTenders.length,
      data: user.savedTenders
    });
  } catch (error) {
    next(error);
  }
};
/**
 * @desc    Toggle saving a tender in user's watchlist
 * @route   POST /api/user/saved-tenders/:id
 * @access  Private
 */
const toggleSaveTender = async (req, res, next) => {
  try {
    const { id } = req.params;
    // Find the tender to ensure it exists
    let tender = await Tender.findOne({ tenderId: id });
    if (!tender && id.match(/^[0-9a-fA-F]{24}$/)) {
      tender = await Tender.findById(id);
    }
    if (!tender) {
      res.status(404);
      throw new Error(`Tender not found with key: ${id}`);
    }
    const user = await User.findById(req.user._id);
    const isAlreadySaved = user.savedTenders.includes(tender._id);
    
    if (isAlreadySaved) {
      // Remove
      user.savedTenders = user.savedTenders.filter(t => t.toString() !== tender._id.toString());
      await user.save();
      res.json({
        success: true,
        message: 'Tender removed from watchlist',
        saved: false
      });
    } else {
      // Add
      user.savedTenders.push(tender._id);
      await user.save();
      res.json({
        success: true,
        message: 'Tender saved to watchlist',
        saved: true
      });
    }
  } catch (error) {
    next(error);
  }
};
/**
 * @desc    Get user's active keyword alerts
 * @route   GET /api/user/alerts
 * @access  Private
 */
const getAlerts = async (req, res, next) => {
  try {
    const alerts = await Alert.find({ user: req.user._id });
    res.json({
      success: true,
      count: alerts.length,
      data: alerts
    });
  } catch (error) {
    next(error);
  }
};
/**
 * @desc    Create a new keyword/value alert configuration
 * @route   POST /api/user/alerts
 * @access  Private
 */
const createAlert = async (req, res, next) => {
  try {
    const { name, keywords, minVal, maxVal, categories, sources } = req.body;
    if (!name) {
      res.status(400);
      throw new Error('Please provide a name for this alert');
    }
    const newAlert = await Alert.create({
      user: req.user._id,
      name,
      keywords: keywords || [],
      minVal: minVal || 0,
      maxVal: maxVal || undefined,
      categories: categories || [],
      sources: sources || []
    });
    res.status(201).json({
      success: true,
      message: 'Alert preference created successfully',
      data: newAlert
    });
  } catch (error) {
    next(error);
  }
};
/**
 * @desc    Delete a keyword alert config
 * @route   DELETE /api/user/alerts/:id
 * @access  Private
 */
const deleteAlert = async (req, res, next) => {
  try {
    const alert = await Alert.findOne({ _id: req.params.id, user: req.user._id });
    if (!alert) {
      res.status(404);
      throw new Error('Alert not found or unauthorized');
    }
    await alert.deleteOne();
    res.json({
      success: true,
      message: 'Alert configuration deleted successfully'
    });
  } catch (error) {
    next(error);
  }
};
module.exports = {
  getSavedTenders,
  toggleSaveTender,
  getAlerts,
  createAlert,
  deleteAlert
};
