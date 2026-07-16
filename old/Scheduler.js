const cron = require('node-cron');
const { scrapeAssamTenders } = require('./assamTenderScraper');
const { scrapeGemBids } = require('./gemScraper');
const { processNewTenders } = require('./services/notificationService');
const Tender = require('./models/Tender');
const logger = require('./utils/logger');
/**
 * Initializes and schedules the background crawler cron job
 */
function initScheduler() {
  const schedulePattern = process.env.SCRAPER_CRON_SCHEDULE || '0 2 * * *';
  logger.info(`Scheduler: Registering scraper cron job with schedule: "${schedulePattern}"`);
  cron.schedule(schedulePattern, async () => {
    logger.info('Scheduler: Triggering scheduled crawl job...');
    await runCrawlJob();
  });
}
/**
 * Executes scraping workflows for all targets sequentially,
 * records results, and triggers email alert evaluations.
 */
async function runCrawlJob() {
  logger.info('Crawl Job Started.');
  const startTime = Date.now();
  try {
    // 1. Run Assam Tenders scraper
    const assamResult = await scrapeAssamTenders();
    logger.info(`Assam Tenders crawl summary: Success=${assamResult.success}, Count=${assamResult.count || 0}`);
    // 2. Run GeM bids scraper
    const gemResult = await scrapeGemBids();
    logger.info(`GeM Bids crawl summary: Success=${gemResult.success}, Count=${gemResult.count || 0}`);
    // 3. Match new listings against keyword alert subscriptions
    // To identify "new" tenders for alerts, we'll fetch items created/updated in the last hour
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const newTenders = await Tender.find({
      createdAt: { $gte: oneHourAgo }
    });
    if (newTenders.length > 0) {
      await processNewTenders(newTenders);
    } else {
      logger.info('No new tenders found to match alerts in this crawl.');
    }
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    logger.info(`Crawl Job Completed successfully in ${duration}s.`);
    return {
      success: true,
      duration,
      assamCount: assamResult.count || 0,
      gemCount: gemResult.count || 0
    };
  } catch (error) {
    logger.error('Crawl Job Failed: %O', error);
    return {
      success: false,
      error: error.message
    };
  }
}
module.exports = {
  initScheduler,
  runCrawlJob
};
