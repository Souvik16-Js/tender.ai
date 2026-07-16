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
