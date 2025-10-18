const mongoose = require('mongoose');

let isConnected = false;

async function connectToMongo() {
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!uri) {
    console.warn('MongoDB: MONGO_URI not set; DB features disabled');
    return null;
  }
  if (isConnected) return mongoose.connection;
  try {
    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 5000,
    });
    isConnected = true;
    console.log('✓ Connected to MongoDB');
    return mongoose.connection;
  } catch (err) {
    console.error('MongoDB connection error:', err.message);
    return null;
  }
}

module.exports = { connectToMongo };
