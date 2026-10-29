import mongoose from 'mongoose';

/**
 * One-time numeric OTP code.
 * - purpose is a string so the same collection can serve password reset,
 *   email confirmation, and any future flow without a new model.
 * - codeHash is SHA-256 of the code + a per-code salt; the raw code is never
 *   stored. select:false so it never leaks by accident.
 * - TTL index deletes expired codes (belt); correctness is enforced in the
 *   service against expiresAt + usedAt (braces).
 */
const emailOtpSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User is required'],
      index: true,
    },

    purpose: {
      type: String,
      required: [true, 'Purpose is required'],
      enum: {
        values: [
          'password_reset',
          'email_confirm',
          'two_factor_enable',
          'two_factor_login',
        ],
        message: 'Invalid OTP purpose',
      },
      index: true,
    },

    /** SHA-256(salt + code). The raw code is never persisted. */
    codeHash: {
      type: String,
      required: [true, 'Code hash is required'],
      select: false,
    },

    /** Random per-code salt used as the HMAC/SHA-256 key prefix. */
    salt: {
      type: String,
      required: [true, 'Salt is required'],
      select: false,
    },

    attempts: {
      type: Number,
      default: 0,
      min: 0,
    },

    expiresAt: {
      type: Date,
      required: [true, 'Expiration is required'],
      index: { expireAfterSeconds: 0 },
    },

    usedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  },
);

// At most one live code per user per purpose at any time.
emailOtpSchema.index(
  { user: 1, purpose: 1 },
  { unique: true, partialFilterExpression: { usedAt: null } },
);

const EmailOtp = mongoose.model('EmailOtp', emailOtpSchema);

export default EmailOtp;
