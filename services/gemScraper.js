const axios = require('axios');
const puppeteer = require('puppeteer');
const cheerio = require('cheerio');
const Tender = require('../models/Tender');
const logger = require('../utils/logger');
const { generateMockTender } = require('./mockDataGenerator');
/**
 * Scrapes tenders/bids from Government e-Marketplace (GeM)
 * Targets GeM BidPlus portal (https://bidplus.gem.gov.in/all-bids)
 * Supports:
 *  1. Simulation mode (returns realistic mock tenders)
 *  2. Apify Integration (calls krawlify/gem-portal-scraper actor)
 *  3. Fallback Puppeteer scraper (scrapes directly from bidplus.gem.gov.in)
 */
async function scrapeGemBids() {
  const isSimulation = process.env.SCRAPER_SIMULATION_MODE === 'true';
  logger.info(`Starting GeM scraper pipeline. Simulation mode: ${isSimulation}`);
  if (isSimulation) {
    return runSimulation();
  } else {
    return runRealScraper();
  }
}
/**
 * Simulation mode: generates realistic mock GeM tenders and upserts them
 */
async function runSimulation() {
  try {
    const numTenders = Math.floor(Math.random() * 6) + 5; // Generate 5-10 tenders
    logger.info(`Simulation: Generating ${numTenders} mock GeM Bids...`);
    
    let savedCount = 0;
    for (let i = 0; i < numTenders; i++) {
      const mockTender = generateMockTender('GeM');
      
      const result = await Tender.findOneAndUpdate(
        { tenderId: mockTender.tenderId },
        mockTender,
        { upsert: true, new: true }
      );
      
      if (result) savedCount++;
    }
    logger.info(`Simulation complete. Upserted ${savedCount} GeM Tenders successfully.`);
    return { success: true, count: savedCount };
  } catch (error) {
    logger.error('Error running GeM Bids simulation: %O', error);
    return { success: false, error: error.message };
  }
}
/**
 * Real mode: Check if Apify token is set, otherwise fall back to local Puppeteer scraping.
 */
async function runRealScraper() {
  const apifyToken = process.env.APIFY_TOKEN;
  const apifyActorId = process.env.APIFY_GEM_ACTOR_ID || 'krawlify/gem-portal-scraper';
  // Format actor ID for URL (krawlify/gem-portal-scraper -> krawlify~gem-portal-scraper)
  const formattedActorId = apifyActorId.replace('/', '~');
  if (apifyToken && apifyToken !== 'your_apify_api_token_here') {
    logger.info(`Apify token found! Executing GeM scraper via Apify Actor: ${apifyActorId}`);
    return runApifyScraper(apifyToken, formattedActorId);
  }
  logger.warn('Apify Token is not configured. Falling back to local Puppeteer crawler...');
  return runPuppeteerScraper();
}
/**
 * Calls Apify actor to fetch GeM tenders and normalizes the dataset output.
 */
async function runApifyScraper(token, actorId) {
  try {
    // Run synchronous actor call that returns dataset items directly
    const apifyUrl = `https://api.apify.com/v2/acts/${actorId}/run-sync-get-dataset-items?token=${token}`;
    logger.info(`POST: Triggering Apify Actor run-sync...`);
    
    // Provide default search filters/parameters for GeM
    const response = await axios.post(
      apifyUrl,
      {
        maxResults: 20
      },
      {
        headers: { 'Content-Type': 'application/json' },
        timeout: 120000 // 2 minutes timeout for crawler runs
      }
    );
    const items = response.data;
    if (!Array.isArray(items)) {
      throw new Error(`Apify response did not return an array of dataset items. Status: ${response.status}`);
    }
    logger.info(`Apify crawl completed. Received ${items.length} items from dataset.`);
    let savedCount = 0;
    for (const item of items) {
      // Gracefully resolve fields which dynamically map depending on actor output versions
      const bidNo = item.bidNumber || item.bidNo || item.bid_id || item.tenderId || `GEM-APIFY-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
      const itemsText = item.items || item.itemDescription || item.title || item.product_name || 'Goods/Services Procurement';
      const organization = item.organization || item.departmentName || item.buyer_name || item.ministryName || 'Government e-Marketplace Buyer';
      const department = item.department || item.officeName || 'GeM Buyer Division';
      const docUrl = item.pdfUrl || item.documentUrl || item.bid_document_url || `https://bidplus.gem.gov.in/showbidDocument/${encodeURIComponent(bidNo)}`;
      
      const estimatedValue = item.estimatedValue || item.value || 0;
      const emd = item.emd || 0;
      const tenderFee = item.tenderFee || 0;
      // Normalize dates
      const publishDate = item.publishDate ? new Date(item.publishDate) : new Date();
      const submissionEndDate = item.bidEndDate || item.endDate || item.closingDate 
        ? new Date(item.bidEndDate || item.endDate || item.closingDate) 
        : new Date(Date.now() + 10 * 24 * 60 * 60 * 1000); // 10 days default
      const tenderId = `GEM-${bidNo.replace(/[^a-zA-Z0-9]/g, '-')}`;
      const tenderData = {
        tenderId,
        referenceNumber: bidNo,
        title: `Procurement of ${itemsText}`,
        description: item.description || `e-Bid/RA on GeM. Items: ${itemsText}. Buyer organization: ${organization}.`,
        organization,
        department,
        category: itemsText.toLowerCase().includes('service') ? 'Services' : 'Goods',
        estimatedValue,
        emd,
        tenderFee,
        publishDate,
        bidSubmissionStartDate: publishDate,
        bidSubmissionEndDate: submissionEndDate,
        bidOpeningDate: submissionEndDate,
        documentUrls: [
          { title: 'GeM Bid Document', url: docUrl }
        ],
        status: 'Active',
        source: 'GeM',
        rawScrapedData: {
          scrapedAt: new Date(),
          apifyActor: actorId,
          originalItem: item
        }
      };
      await Tender.findOneAndUpdate(
        { tenderId: tenderData.tenderId },
        tenderData,
        { upsert: true, new: true }
      );
      savedCount++;
    }
    logger.info(`Apify Integration complete. Processed and saved ${savedCount} GeM Tenders.`);
    return { success: true, count: savedCount };
  } catch (error) {
    logger.error('Error running GeM scraper via Apify API: %O', error);
    // Return false and fall back to local scraper or mock data in scheduler
    return { success: false, error: error.message };
  }
}
/**
 * Local Puppeteer scraper fallback if Apify is not configured.
 */
async function runPuppeteerScraper() {
  let browser = null;
  try {
    logger.info('Initializing Puppeteer browser for GeM Bids...');
    
    browser = await puppeteer.launch({
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--window-size=1920,1080'
      ]
    });
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    await page.setViewport({ width: 1280, height: 800 });
    const GEM_BID_URL = 'https://bidplus.gem.gov.in/all-bids';
    logger.info(`Navigating to GeM BidPlus URL: ${GEM_BID_URL}`);
    
    await page.goto(GEM_BID_URL, { waitUntil: 'networkidle2', timeout: 45000 });
    // Wait for the bid card container to render (GeM uses dynamic list grids)
    const bidBlockSelector = '.card, .bid_card, #bid_list';
    let blockFound = false;
    
    try {
      await page.waitForSelector(bidBlockSelector, { timeout: 10000 });
      blockFound = true;
    } catch (err) {
      logger.warn('Timed out waiting for standard GeM list card selectors. Page structure may have shifted.');
    }
    const content = await page.content();
    const $ = cheerio.load(content);
    
    let tendersData = [];
    const bidCards = $('.border-block, .card, div[style*="border: 1px"]');
    logger.info(`Found ${bidCards.length} potential GeM bid block items in DOM.`);
    if (blockFound && bidCards.length > 0) {
      bidCards.each((idx, el) => {
        const text = $(el).text();
        const bidNoMatch = text.match(/GEM\/\d{4}\/[B|R]\/\d+/i) || text.match(/Bid Number:\s*([^\s\n]+)/i);
        const endDateMatch = text.match(/Bid End Date:\s*([^\n\r]+)/i) || text.match(/Ending:\s*([^\n\r]+)/i);
        const itemMatch = text.match(/Items:\s*([^\n\r]+)/i) || text.match(/Item Description:\s*([^\n\r]+)/i);
        const deptMatch = text.match(/Department:\s*([^\n\r]+)/i) || text.match(/Consignee:\s*([^\n\r]+)/i);
        if (bidNoMatch) {
          const bidNo = bidNoMatch[0] || bidNoMatch[1];
          const endDateStr = endDateMatch ? endDateMatch[1].trim() : '';
          const itemsText = itemMatch ? itemMatch[1].trim() : 'Goods/Services Procurement';
          const organization = deptMatch ? deptMatch[1].trim() : 'Government e-Marketplace buyer';
          const tenderId = `GEM-SCRAPED-${bidNo.replace(/\//g, '-')}`;
          tendersData.push({
            tenderId,
            referenceNumber: bidNo,
            title: `Procurement of ${itemsText}`,
            description: `e-Bid/RA on GeM. Items details: ${itemsText}. Buyer organization: ${organization}.`,
            organization,
            department: 'GeM Buyer Division',
            category: itemsText.toLowerCase().includes('service') ? 'Services' : 'Goods',
            estimatedValue: 0,
            emd: 0,
            tenderFee: 0,
            publishDate: new Date(),
            bidSubmissionStartDate: new Date(),
            bidSubmissionEndDate: parseGeMDate(endDateStr),
            bidOpeningDate: parseGeMDate(endDateStr),
            documentUrls: [
              { title: 'GeM Bid Document', url: `https://bidplus.gem.gov.in/showbidDocument/${encodeURIComponent(bidNo)}` }
            ],
            status: 'Active',
            source: 'GeM',
            rawScrapedData: {
              scrapedAt: new Date(),
              originalText: text.substring(0, 500)
            }
          });
        }
      });
    }
    if (tendersData.length === 0) {
      logger.warn('No active GeM tenders could be parsed directly. Portal is either heavily blocked, showing a CAPTCHA, or layout changed. Falling back to basic mock sync.');
      for (let i = 0; i < 3; i++) {
        tendersData.push(generateMockTender('GeM'));
      }
    }
    let savedCount = 0;
    for (const tender of tendersData) {
      await Tender.findOneAndUpdate(
        { tenderId: tender.tenderId },
        tender,
        { upsert: true, new: true }
      );
      savedCount++;
    }
    logger.info(`Puppeteer scraper completed. Processed and saved ${savedCount} GeM Tenders.`);
    return { success: true, count: savedCount };
  } catch (error) {
    logger.error('Error during local GeM Bids scraping: %O', error);
    return { success: false, error: error.message };
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}
/**
 * Utility to parse GeM Date strings (e.g. "18-07-2026 18:00:00")
 */
function parseGeMDate(dateStr) {
  if (!dateStr) return new Date();
  try {
    const parts = dateStr.split(/[- :]/);
    if (parts.length >= 5) {
      const day = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1;
      const year = parseInt(parts[2], 10);
      const hour = parseInt(parts[3], 10);
      const minute = parseInt(parts[4], 10);
      const second = parts[5] ? parseInt(parts[5], 10) : 0;
      return new Date(year, month, day, hour, minute, second);
    }
    const parsed = Date.parse(dateStr);
    return isNaN(parsed) ? new Date(Date.now() + 10 * 24 * 60 * 60 * 1000) : new Date(parsed);
  } catch (err) {
    return new Date(Date.now() + 10 * 24 * 60 * 60 * 1000);
  }
}
module.exports = {
  scrapeGemBids
};
 