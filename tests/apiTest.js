const { fork } = require('child_process');
const path = require('path');
const axios = require('axios');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

// Models
const User = require('../models/User');
const Tender = require('../models/Tender');
const Alert = require('../models/Alert');
const { generateMockTender } = require('../services/mockDataGenerator');

const TEST_PORT = 5001;
const BASE_URL = `http://localhost:${TEST_PORT}`;

// Test configuration
const testUser = {
  name: 'Test API User',
  email: `testuser_${Date.now()}@test.com`,
  password: 'testpassword123'
};

let mongoServer;
let mongoUri;
let serverProcess;
let userToken = '';
let tenderCustomId = '';
let createdAlertId = '';

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function startMongo() {
  console.log('Starting in-memory MongoDB server...');
  mongoServer = await MongoMemoryServer.create();
  mongoUri = mongoServer.getUri();
  console.log(`In-memory MongoDB started at: ${mongoUri}`);
}

async function seedDatabase() {
  console.log('Connecting to in-memory DB and seeding...');
  await mongoose.connect(mongoUri);

  // Clear existing
  await User.deleteMany({});
  await Tender.deleteMany({});
  await Alert.deleteMany({});

  // Create Test Admin User
  const adminUser = await User.create({
    name: 'Rohan Das',
    email: 'rohan@tender.ai',
    password: 'password123',
    role: 'admin',
    emailAlertsEnabled: true
  });
  console.log(`Test admin user created: ${adminUser.email} / password123`);

  // Create alert preferences
  await Alert.create({
    user: adminUser._id,
    name: 'Brahmaputra construction alerts',
    keywords: ['Brahmaputra', 'Bridge', 'Road', 'Highway'],
    minVal: 5000000,
    categories: ['Works'],
    sources: ['Assam Tenders']
  });

  await Alert.create({
    user: adminUser._id,
    name: 'School computer hardware alerts',
    keywords: ['Laptops', 'Desktops', 'Computer', 'IT'],
    categories: ['Goods'],
    sources: ['GeM']
  });

  // Seed Tenders
  const mockTenders = [];
  for (let i = 0; i < 10; i++) {
    mockTenders.push(generateMockTender('Assam Tenders'));
  }
  for (let i = 0; i < 10; i++) {
    mockTenders.push(generateMockTender('GeM'));
  }
  await Tender.insertMany(mockTenders);
  console.log(`Successfully seeded ${mockTenders.length} mock tenders.`);

  await mongoose.disconnect();
}

async function startServer() {
  console.log('Starting Express server process...');
  serverProcess = fork(path.join(__dirname, '../server.js'), {
    env: {
      ...process.env,
      PORT: TEST_PORT,
      MONGODB_URI: mongoUri,
      NODE_ENV: 'test',
      SCRAPER_SIMULATION_MODE: 'true',
      SCRAPER_CRON_SCHEDULE: '0 0 * * *'
    }
  });

  // Give the server time to start up
  await sleep(4000);
}

function stopAll() {
  if (serverProcess) {
    console.log('Stopping test Express server...');
    serverProcess.kill();
  }
  if (mongoServer) {
    console.log('Stopping in-memory MongoDB...');
    mongoServer.stop();
  }
}

async function runTests() {
  let passed = 0;
  let failed = 0;

  async function assertRoute(name, fn) {
    try {
      console.log(`\n[TEST] Running: ${name}`);
      await fn();
      console.log(`[PASS] ${name}`);
      passed++;
    } catch (error) {
      console.error(`[FAIL] ${name}`);
      if (error.response) {
        console.error(`Status: ${error.response.status}`);
        console.error(`Response Data:`, error.response.data);
      } else {
        console.error(error.message);
      }
      failed++;
    }
  }

  // 1. Health Check
  await assertRoute('GET / (Health Check)', async () => {
    const res = await axios.get(`${BASE_URL}/`);
    if (!res.data.success || !res.data.message.includes('API is running')) {
      throw new Error('Invalid health check response');
    }
  });

  // 2. Register User
  await assertRoute('POST /api/auth/register (User Registration)', async () => {
    const res = await axios.post(`${BASE_URL}/api/auth/register`, testUser);
    if (!res.data.success || !res.data.data.token) {
      throw new Error('Registration failed');
    }
    userToken = res.data.data.token;
  });

  // 3. Login User
  await assertRoute('POST /api/auth/login (User Login)', async () => {
    const res = await axios.post(`${BASE_URL}/api/auth/login`, {
      email: testUser.email,
      password: testUser.password
    });
    if (!res.data.success || !res.data.data.token) {
      throw new Error('Login failed');
    }
    userToken = res.data.data.token;
  });

  // 4. Get Current User (Me)
  await assertRoute('GET /api/auth/me (User Profile)', async () => {
    const res = await axios.get(`${BASE_URL}/api/auth/me`, {
      headers: { Authorization: `Bearer ${userToken}` }
    });
    if (!res.data.success || res.data.data.email !== testUser.email) {
      throw new Error('Fetch profile failed');
    }
  });

  // 5. Get Tenders List
  await assertRoute('GET /api/tenders (Search Tenders)', async () => {
    const res = await axios.get(`${BASE_URL}/api/tenders`);
    if (!res.data.success || !Array.isArray(res.data.data)) {
      throw new Error('Fetch tenders list failed');
    }
    if (res.data.data.length > 0) {
      tenderCustomId = res.data.data[0].tenderId;
    }
  });

  // 6. Get Single Tender Detail
  await assertRoute('GET /api/tenders/:id (Get Tender by Custom ID)', async () => {
    if (!tenderCustomId) {
      throw new Error('No tenders found in DB to fetch detail');
    }
    const res = await axios.get(`${BASE_URL}/api/tenders/${tenderCustomId}`);
    if (!res.data.success || res.data.data.tenderId !== tenderCustomId) {
      throw new Error('Fetch tender by Custom ID failed');
    }
  });

  // 7. Toggle Save Tender (Add to watchlist)
  await assertRoute('POST /api/user/saved-tenders/:id (Save Tender)', async () => {
    if (!tenderCustomId) {
      throw new Error('No tenders found in DB to save');
    }
    const res = await axios.post(`${BASE_URL}/api/user/saved-tenders/${tenderCustomId}`, {}, {
      headers: { Authorization: `Bearer ${userToken}` }
    });
    if (!res.data.success || res.data.saved !== true) {
      throw new Error('Saving tender failed');
    }
  });

  // 8. Get Saved Tenders List
  await assertRoute('GET /api/user/saved-tenders (Watchlist)', async () => {
    const res = await axios.get(`${BASE_URL}/api/user/saved-tenders`, {
      headers: { Authorization: `Bearer ${userToken}` }
    });
    if (!res.data.success || res.data.count < 1) {
      throw new Error('Watchlist check failed');
    }
  });

  // 9. Create Custom Alert Configuration
  await assertRoute('POST /api/user/alerts (Create Alert)', async () => {
    const res = await axios.post(`${BASE_URL}/api/user/alerts`, {
      name: 'Test Alert Pattern',
      keywords: ['bridge', 'road'],
      minVal: 1000000,
      categories: ['Works'],
      sources: ['Assam Tenders']
    }, {
      headers: { Authorization: `Bearer ${userToken}` }
    });
    if (!res.data.success || !res.data.data._id) {
      throw new Error('Alert creation failed');
    }
    createdAlertId = res.data.data._id;
  });

  // 10. Get Active Alerts List
  await assertRoute('GET /api/user/alerts (Get Alerts)', async () => {
    const res = await axios.get(`${BASE_URL}/api/user/alerts`, {
      headers: { Authorization: `Bearer ${userToken}` }
    });
    if (!res.data.success || res.data.count < 1) {
      throw new Error('Get alerts list failed');
    }
  });

  // 11. Delete Alert Configuration
  await assertRoute('DELETE /api/user/alerts/:id (Delete Alert)', async () => {
    if (!createdAlertId) {
      throw new Error('Alert was not created');
    }
    const res = await axios.delete(`${BASE_URL}/api/user/alerts/${createdAlertId}`, {
      headers: { Authorization: `Bearer ${userToken}` }
    });
    if (!res.data.success) {
      throw new Error('Alert deletion failed');
    }
  });

  // 12. Try triggering crawl (Non-admin User: Should Fail with 403)
  await assertRoute('POST /api/tenders/trigger-crawl (Non-admin trigger crawl: Should fail)', async () => {
    try {
      await axios.post(`${BASE_URL}/api/tenders/trigger-crawl`, {}, {
        headers: { Authorization: `Bearer ${userToken}` }
      });
      throw new Error('Non-admin user successfully triggered crawl (Access control bug!)');
    } catch (err) {
      if (err.response && err.response.status === 403) {
        return;
      }
      throw err;
    }
  });

  // 13. Login as Admin and Trigger Crawl
  await assertRoute('POST /api/tenders/trigger-crawl (Admin trigger crawl)', async () => {
    const adminCredentials = {
      email: 'rohan@tender.ai',
      password: 'password123'
    };

    let adminToken;
    try {
      const loginRes = await axios.post(`${BASE_URL}/api/auth/login`, adminCredentials);
      adminToken = loginRes.data.data.token;
    } catch (err) {
      throw new Error(`Admin login failed: ${err.message}`);
    }

    const crawlRes = await axios.post(`${BASE_URL}/api/tenders/trigger-crawl`, {}, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });

    if (!crawlRes.data.success || !crawlRes.data.summary) {
      throw new Error('Admin trigger crawl failed');
    }
  });

  console.log(`\n========================================`);
  console.log(`API Integration Test Suite Results:`);
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  console.log(`========================================`);

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

async function main() {
  try {
    await startMongo();
    await seedDatabase();
    await startServer();
    await runTests();
  } catch (error) {
    console.error('Test runner exception: %O', error);
    process.exit(1);
  } finally {
    stopAll();
  }
}

main();
