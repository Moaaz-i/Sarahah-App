import mongoose from 'mongoose';

/**
 * One-time handoff code used by the OAuth REDIRECT mode.
 *
 * When OAUTH_REDIRECT_URL is configured the browser callback must never
 * receive the token pair in the URL (leaks via Referer, history, logs).
 * Instead the API issues a random code here, redirects the SPA with
 * `?handoff=<code>`, and the SPA posts it to
 * POST /api/v1/auth/google/exchange to receive the real tokens.
 *
 * Only the SHA-256 hash of the code is stored, the code is single-use
 * (claimed atomically) and expires after a few seconds.
 */
const oauthHandoffSchema = new mongoose.Schema(
  {
    codeHash: {
      type: String,
      required: [true, 'Code hash is required'],
      unique: true,
      index: true,
    },

    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User is required'],
      index: true,
    },

    /** 'login' hands back tokens; 'link' only confirms the link succeeded. */
    purpose: {
      type: String,
      enum: ['login', 'link'],
      default: 'login',
    },

    /** Payload handed to the client once, then forgotten. */
    payload: {
      type: Object,
      default: null,
    },

    usedAt: {
      type: Date,
      default: null,
    },

    expiresAt: {
      type: Date,
      required: true,
    },
  },
  {
    timestamps: true,
  },
);

// Purge expired codes automatically (TTL index, evaluated every 60s).
oauthHandoffSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const OAuthHandoff = mongoose.model('OAuthHandoff', oauthHandoffSchema);

export default OAuthHandoff;
