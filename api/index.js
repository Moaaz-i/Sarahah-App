import mongoose from 'mongoose';
import app from '../src/app.js';
import connectDB from '../src/config/database.js';

export default async function handler(req, res) {
  if (mongoose.connection.readyState !== 1) {
    try {
      await connectDB();
    } catch (err) {
      console.error('Database connection error in Vercel function:', err);
      return res.status(500).json({
        success: false,
        message: 'Database connection failed: ' + (err?.message || err),
        code: 'DB_CONNECTION_ERROR',
      });
    }
  }
  return app(req, res);
}
