import bcrypt from 'bcryptjs';
import User from '../src/models/User.js';
import connectDB, { closeDatabase } from '../src/config/database.js';
import env from '../src/config/env.js';
import { ROLES } from '../src/constants/roles.js';

/**
 * Create (or promote) the first administrator.
 *
 * Usage:
 *   ADMIN_NAME="Admin" ADMIN_USERNAME="admin" ADMIN_EMAIL="admin@example.com" \
 *   ADMIN_PASSWORD="..." npm run admin:create
 *
 * The password is read from the environment (never from argv, which would
 * leak it into the process list). The user is prompted-free and idempotent:
 * if the username already exists it is promoted to admin instead of failing.
 */

const required = ['ADMIN_NAME', 'ADMIN_USERNAME', 'ADMIN_EMAIL', 'ADMIN_PASSWORD'];
const missing = required.filter((name) => !process.env[name]);
if (missing.length) {
  console.error(`Missing environment variable(s): ${missing.join(', ')}`);
  process.exit(1);
}

const password = process.env.ADMIN_PASSWORD;
if (password.length < 8 || !/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
  console.error('ADMIN_PASSWORD must be at least 8 characters and contain a letter and a number.');
  process.exit(1);
}

const run = async () => {
  await connectDB();

  const username = process.env.ADMIN_USERNAME.toLowerCase().trim();
  const email = process.env.ADMIN_EMAIL.toLowerCase().trim();

  const existing = await User.findOne({ username }).select('+password');

  if (existing) {
    existing.role = ROLES.ADMIN;
    existing.isActive = true;
    existing.isVerified = true;
    await existing.save();
    console.log(`User "${username}" was promoted to admin.`);
  } else {
    const hashed = await bcrypt.hash(password, env.security.bcryptRounds);
    await User.create({
      name: process.env.ADMIN_NAME,
      username,
      email,
      password: hashed,
      role: ROLES.ADMIN,
      isActive: true,
      isVerified: true,
      authProvider: 'local',
    });
    console.log(`Admin account "${username}" created.`);
  }

  await closeDatabase();
};

run().catch((err) => {
  console.error('Failed to create admin:', err.message);
  process.exit(1);
});
