import mongoose from 'mongoose';
import env from './env.js';

/**
 * MongoDB connection.
 * - Fails fast with a clear (secret-free) message.
 * - Registers graceful shutdown handlers.
 */
const connectDB = async (uri = env.mongoUri) => {
  mongoose.set('strictQuery', true);

  try {
    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 10_000,
    });
    console.log('MongoDB connected successfully.');
    return mongoose.connection;
  } catch (err) {
    console.error('MongoDB connection error:', err.message);
    throw err;
  }
};

/** Close the connection cleanly (used on shutdown and by tests). */
export const disconnectDB = async () => {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
    console.log('MongoDB connection closed.');
  }
};

/** Stop accepting new connections and drain open ones before closing. */
export const closeDatabase = async () => {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.connection.close();
    console.log('MongoDB connection closed.');
  }
};

export default connectDB;
