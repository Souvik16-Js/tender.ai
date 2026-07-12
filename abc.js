const { MongoClient } = require('mongodb');
require('dotenv').config();

async function connectToDatabase() {
  const client = new MongoClient(process.env.MONGODB_URI);

  try {
    await client.connect();
    const adminDb = client.db().admin();
    const result = await adminDb.ping();
    console.log('MongoDB connection successful:', result);
  } catch (error) {
    console.error('MongoDB connection failed:', error.message);
  } finally {
    await client.close();
  }
}

connectToDatabase();