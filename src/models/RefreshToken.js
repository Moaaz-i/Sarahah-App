import mongoose from 'mongoose';

/**
 * Refresh token record.
 * - Only the SHA-256 digest of the opaque token is stored.
 * - Rotation: on every successful use the token is marked revoked and
 *   replacedBy points to the new token.
 * - Reuse detection: if a REVOLVED token is presented again, the whole
 *   session chain of that user is revoked (see tokenService).
 */
const refreshTokenSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User is required'],
      index: true,
    },

    tokenHash: {
      type: String,
      required: [true, 'Token hash is required'],
      unique: true,
      select: false,
    },

    expiresAt: {
      type: Date,
      required: [true, 'Expiration date is required'],
      expires: 0,
    },

    revokedAt: {
      type: Date,
      default: null,
    },

    replacedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'RefreshToken',
      default: null,
    },

    /** Best-effort client metadata for the "manage sessions" view (no secrets). */
    userAgent: {
      type: String,
      maxlength: 300,
      default: '',
    },
  },
  {
    timestamps: true,
  },
);

refreshTokenSchema.index({ user: 1, revokedAt: 1 });

refreshTokenSchema.methods.isUsable = function isUsable() {
  return !this.revokedAt && this.expiresAt > new Date();
};

const RefreshToken = mongoose.model('RefreshToken', refreshTokenSchema);

export default RefreshToken;
