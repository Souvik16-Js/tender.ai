const Tender = require('../models/Tender');
const { runCrawlJob } = require('../services/scheduler');
const logger = require('../utils/logger');
/**
 * @desc    Get all tenders with advanced filters, pagination, and search
 * @route   GET /api/tenders
 * @access  Public
 */
const getTenders = async (req, res, next) => {
  try {
    const {
      search,
      source,
      category,
      minValue,
      maxValue,
      closingBefore,
      closingAfter,
      status,
      sort,
      page = 1,
      limit = 10
    } = req.query;
    const mongoQuery = {};
    // 1. Full-Text Search
    if (search) {
      mongoQuery.$text = { $search: search };
    }
    // 2. Source Filter
    if (source) {
      mongoQuery.source = source;
    }
    // 3. Category Filter
    if (category) {
      mongoQuery.category = category;
    }
    // 4. Status Filter (default to Active if not specified)
    if (status) {
      mongoQuery.status = status;
    } else {
      mongoQuery.status = 'Active';
    }
    // 5. Value Range Filter
    if (minValue || maxValue) {
      mongoQuery.estimatedValue = {};
      if (minValue) mongoQuery.estimatedValue.$gte = parseFloat(minValue);
      if (maxValue) mongoQuery.estimatedValue.$lte = parseFloat(maxValue);
    }
    // 6. Timeline Closing Date Filters
    if (closingBefore || closingAfter) {
      mongoQuery.bidSubmissionEndDate = {};
      if (closingBefore) mongoQuery.bidSubmissionEndDate.$lte = new Date(closingBefore);
      if (closingAfter) mongoQuery.bidSubmissionEndDate.$gte = new Date(closingAfter);
    }
    // Determine Sort Options
    let sortOption = { publishDate: -1 }; // default: newest published first
    if (sort) {
      const parts = sort.split(':');
      if (parts.length === 2) {
        const field = parts[0];
        const order = parts[1] === 'desc' ? -1 : 1;
        
        // If sorting by text score for relevance search
        if (field === 'relevance' && search) {
          sortOption = { score: { $meta: 'textScore' } };
        } else {
          sortOption = { [field]: order };
        }
      }
    }
    // Execute query with pagination
    const pageNum = parseInt(page, 10);
    const limitNum = parseInt(limit, 10);
    const skip = (pageNum - 1) * limitNum;
    // Project text score if searching and sorting by relevance
    const projection = search ? { score: { $meta: 'textScore' } } : {};
    const tenders = await Tender.find(mongoQuery, projection)
      .sort(sortOption)
      .skip(skip)
      .limit(limitNum);
    const total = await Tender.countDocuments(mongoQuery);
    res.json({
      success: true,
      count: tenders.length,
      pagination: {
        total,
        page: pageNum,
        pages: Math.ceil(total / limitNum),
        limit: limitNum
      },
      data: tenders
    });
  } catch (error) {
    next(error);
  }
};
/**
 * @desc    Get single tender detail by custom ID or Mongo ID
 * @route   GET /api/tenders/:id
 * @access  Public
 */
const getTenderById = async (req, res, next) => {
  try {
    const { id } = req.params;
    
    // Check both unique tenderId field and standard Mongo ID
    let tender = await Tender.findOne({ tenderId: id });
    if (!tender && id.match(/^[0-9a-fA-F]{24}$/)) {
      tender = await Tender.findById(id);
    }
    if (!tender) {
      res.status(404);
      throw new Error(`Tender not found with key: ${id}`);
    }
    res.json({
      success: true,
      data: tender
    });
  } catch (error) {
    next(error);
  }
};
/**
 * @desc    Trigger scrapers on-demand
 * @route   POST /api/tenders/trigger-crawl
 * @access  Private/Admin
 */
const triggerCrawl = async (req, res, next) => {
  try {
    logger.info(`On-demand crawl triggered by admin user: ${req.user.email}`);
    
    // Trigger crawl run in the background (sends output async or waits)
    const crawlSummary = await runCrawlJob();
    
    if (crawlSummary.success) {
      res.json({
        success: true,
        message: 'On-demand crawl completed successfully.',
        summary: crawlSummary
      });
    } else {
      res.status(500).json({
        success: false,
        message: 'On-demand crawl job failed.',
        error: crawlSummary.error
      });
    }
  } catch (error) {
    next(error);
  }
};
module.exports = {
  getTenders,
  getTenderById,
  triggerCrawl
};
