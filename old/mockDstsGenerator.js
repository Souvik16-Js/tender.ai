const crypto = require('crypto');
const ASSAM_ORGANIZATIONS = [
  'Public Works Department (PWD) Assam',
  'Public Health Engineering Department (PHED) Assam',
  'Assam Power Distribution Company Limited (APDCL)',
  'Directorate of Agriculture Assam',
  'Guwahati Municipal Corporation (GMC)',
  'Water Resources Department Assam',
  'Assam State Disaster Management Authority'
];
const GEM_ORGANIZATIONS = [
  'Ministry of Defence, Indian Army',
  'Ministry of Railways, Northern Railway',
  'Bharat Heavy Electricals Limited (BHEL)',
  'Indian Institute of Technology Guwahati',
  'Oil and Natural Gas Corporation (ONGC)',
  'Assam University Silchar',
  'Employees State Insurance Corporation (ESIC)'
];
const TENDER_TITLES = {
  Works: [
    'Construction of RCC Bridge over River Brahmaputra at Location X',
    'Improvement and Widening of State Highway SH-12 (Guwahati to Tezpur)',
    'Construction of Multi-Storeyed Administrative Block at Assam Secretariat',
    'Renovation and Modernization of Government Hospital Buildings in Dibrugarh',
    'Drilling and Commissioning of Deep Tube Wells for Rural Water Supply Scheme',
    'Installation and Commissioning of 10MW Ground Mounted Solar Power Plant'
  ],
  Goods: [
    'Supply and Delivery of Medical Equipment and ICU Beds',
    'Procurement of Laptops and Desktops for Government Higher Secondary Schools',
    'Supply of Uniforms and Safety Boots for State Police Force',
    'Supply of High-Density Polyethylene (HDPE) Pipes for Jal Jeevan Mission',
    'Procurement of Scientific Lab Equipment for State Universities',
    'Supply of Office Furniture and Modular Workstations for New GMC Building'
  ],
  Services: [
    'Engagement of Security Agency for Secretariat Campus (1 Year)',
    'Hiring of Agency for IT Helpdesk Support and Facility Management Services',
    'Annual Maintenance Contract (AMC) of Central HVAC Systems',
    'Consultancy Services for Environmental Impact Assessment (EIA) of Highway Project',
    'Outsourcing of Housekeeping and Sanitation Services for Government Hospitals',
    'Third-Party Quality Monitoring Audit of State Highway Infrastructure Projects'
  ]
};
function getRandomElement(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}
function getRandomRange(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
function generateMockTender(source) {
  const category = getRandomElement(['Works', 'Goods', 'Services']);
  const titlesList = TENDER_TITLES[category];
  const baseTitle = getRandomElement(titlesList);
  
  const value = getRandomRange(50000, 50000000); // 50k to 5Cr INR
  const emd = Math.round(value * 0.02); // 2% EMD
  const fee = getRandomRange(500, 10000);
  
  const org = source === 'Assam Tenders' 
    ? getRandomElement(ASSAM_ORGANIZATIONS) 
    : getRandomElement(GEM_ORGANIZATIONS);
  const dept = source === 'Assam Tenders'
    ? 'State Procurement Cell'
    : 'Central Procurement Board';
  // Generate timeline
  const now = new Date();
  const publishOffset = getRandomRange(-15, -1);
  const publishDate = new Date(now.getTime() + publishOffset * 24 * 60 * 60 * 1000);
  
  const submitStartOffset = publishOffset + getRandomRange(1, 3);
  const submitStartDate = new Date(now.getTime() + submitStartOffset * 24 * 60 * 60 * 1000);
  
  const submitEndOffset = submitStartOffset + getRandomRange(10, 30);
  const submitEndDate = new Date(now.getTime() + submitEndOffset * 24 * 60 * 60 * 1000);
  
  const openingOffset = submitEndOffset + getRandomRange(1, 3);
  const openingDate = new Date(now.getTime() + openingOffset * 24 * 60 * 60 * 1000);
  const idSuffix = crypto.randomBytes(3).toString('hex').toUpperCase();
  const year = now.getFullYear();
  const tenderId = source === 'Assam Tenders'
    ? `ASSAM-${year}-${idSuffix}-${getRandomRange(100, 999)}`
    : `GEM-${year}-B-${getRandomRange(100000, 999999)}`;
  const refNo = source === 'Assam Tenders'
    ? `NIT/GMC/ENGG/${year}/${getRandomRange(10, 99)}`
    : `GEM/BID/${year}/R/${getRandomRange(10000, 99999)}`;
  return {
    tenderId,
    referenceNumber: refNo,
    title: `${baseTitle} - Phase ${getRandomRange(1, 5)}`,
    description: `Detailed description for: ${baseTitle}. The work must be executed in accordance with general conditions of contract and engineering guidelines. Eligible contractors are invited to submit competitive bids.`,
    organization: org,
    department: dept,
    category,
    estimatedValue: value,
    emd,
    tenderFee: fee,
    publishDate,
    bidSubmissionStartDate: submitStartDate,
    bidSubmissionEndDate: submitEndDate,
    bidOpeningDate: openingDate,
    documentUrls: [
      {
        title: 'Tender Notice (NIT)',
        url: source === 'Assam Tenders'
          ? `https://assamtenders.gov.in/tenders/notice_${idSuffix}.pdf`
          : `https://bidplus.gem.gov.in/showbiddocument/${idSuffix}.pdf`
      },
      {
        title: 'Tender BOQ (Bill of Quantities)',
        url: source === 'Assam Tenders'
          ? `https://assamtenders.gov.in/tenders/boq_${idSuffix}.xls`
          : `https://bidplus.gem.gov.in/showboqdocument/${idSuffix}.xls`
      }
    ],
    status: 'Active',
    source,
    rawScrapedData: {
      generatedAt: new Date(),
      hash: crypto.createHash('md5').update(tenderId).digest('hex')
    }
  };
}
module.exports = {
  generateMockTender
};
const Alert = require('../models/Alert');
const logger = require('../utils/logger');
/**
 * Service to process newly scraped tenders and dispatch notifications
 * based on user keyword alerts.
 */
async function processNewTenders(tenders) {
  if (!tenders || tenders.length === 0) return;
  logger.info(`Notification Service: Matching ${tenders.length} new tenders against user alerts...`);
  try {
    // Fetch all alert configurations populated with user details
    const activeAlerts = await Alert.find().populate('user');
    logger.info(`Found ${activeAlerts.length} active alerts in database.`);
    for (const alert of activeAlerts) {
      if (!alert.user || !alert.user.emailAlertsEnabled) continue;
      const matchingTenders = [];
      for (const tender of tenders) {
        // 1. Source Check
        if (alert.sources && alert.sources.length > 0) {
          if (!alert.sources.includes(tender.source)) continue;
        }
        // 2. Category Check
        if (alert.categories && alert.categories.length > 0) {
          if (!alert.categories.includes(tender.category)) continue;
        }
        // 3. Estimated Value Check
        if (alert.minVal && tender.estimatedValue < alert.minVal) continue;
        if (alert.maxVal && tender.estimatedValue > alert.maxVal) continue;
        // 4. Keywords matching (Title, Description, or Org)
        if (alert.keywords && alert.keywords.length > 0) {
          const contentToSearch = `${tender.title} ${tender.description} ${tender.organization}`.toLowerCase();
          const keywordMatched = alert.keywords.some(kw => contentToSearch.includes(kw.toLowerCase()));
          
          if (!keywordMatched) continue;
        }
        // If it passed all criteria, it's a match!
        matchingTenders.push(tender);
      }
      if (matchingTenders.length > 0) {
        logger.info(`Alert Alert! "${alert.name}" triggered for user ${alert.user.email} with ${matchingTenders.length} tenders.`);
        await sendSimulatedEmail(alert.user, alert.name, matchingTenders);
        
        // Update alert trigger date
        alert.lastTriggered = new Date();
        await alert.save();
      }
    }
  } catch (error) {
    logger.error('Error processing notifications for tenders: %O', error);
  }
}
/**
 * Simulates sending an email alert using Winston logs
 */
async function sendSimulatedEmail(user, alertName, tenders) {
  const tenderListHtml = tenders
    .map(t => `<li><strong>[${t.source}]</strong> ${t.title} - Est. Value: ₹${t.estimatedValue.toLocaleString()} (ID: ${t.tenderId})</li>`)
    .join('\n');
  const emailSubject = `Tender.ai Alert: New tenders matching your filter "${alertName}"`;
  
  const emailBody = `
=========================================
EMAIL DISPATCH SIMULATION
To: ${user.name} (${user.email})
Subject: ${emailSubject}
-----------------------------------------
Hello ${user.name},
The following new tenders matching your alert settings have been crawled:
${tenders.map(t => `- [${t.source}] ${t.title} (Value: INR ${t.estimatedValue})`).join('\n')}
Log in to your Tender.ai dashboard to view more details.
Best,
Tender.ai Automation Team
=========================================
  `;
  // Log the email instead of sending (in production, integrate with SendGrid, Mailgun, or AWS SES)
  logger.info(emailBody);
}
module.exports = {
  processNewTenders
};
const cron = require('node-cron');
const { scrapeAssamTenders } = require('./assamTendersScraper');
const { scrapeGemBids } = require('./gemScraper');
const { processNewTenders } = require('./notificationService');
const Tender = require('../models/Tender');
const logger = require('../utils/logger');
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
const winston = require('winston');
const path = require('path');
// Define log format
const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.splat(),
  winston.format.json()
);
// Create logger
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: logFormat,
  defaultMeta: { service: 'tender-ai-backend' },
  transports: [
    // Write all logs with importance level of `error` or less to `error.log`
    new winston.transports.File({ 
      filename: path.join(__dirname, '../logs/error.log'), 
      level: 'error' 
    }),
    // Write all logs with importance level of `info` or less to `combined.log`
    new winston.transports.File({ 
      filename: path.join(__dirname, '../logs/combined.log') 
    })
  ]
});
// If we are in development, also log to the console with colorized formats
if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.simple()
    )
  }));
}
module.exports = logger;
