import mongoose from 'mongoose';
import { ROLES } from '../constants/roles.js';

/**
 * User account.
 * Notes:
 * - role is NEVER accepted from the client on public routes.
 * - password is select:false so it never leaves the DB layer by accident.
 * - email is optional (OAuth users may not have one) and uses a partial
 *   unique index so empty emails do not collide with each other.
 */
const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
      minlength: [2, 'Name must be at least 2 characters'],
      maxlength: [100, 'Name cannot exceed 100 characters'],
    },

    username: {
      type: String,
      required: [true, 'Username is required'],
      lowercase: true,
      trim: true,
      minlength: [3, 'Username must be at least 3 characters'],
      maxlength: [30, 'Username cannot exceed 30 characters'],
      match: [/^[a-z0-9_]+$/, 'Username can only contain letters, numbers and underscores'],
    },

    email: {
      type: String,
      trim: true,
      lowercase: true,
      maxlength: [254, 'Email is too long'],
      match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Invalid email format'],
      default: null,
    },

    password: {
      type: String,
      // Google-only accounts have no local password. The hash is required
      // only for accounts that can actually log in with a password.
      required: function requiredPassword() {
        return this.authProvider !== 'google';
      },
      select: false,
    },

    role: {
      type: String,
      enum: { values: Object.values(ROLES), message: 'Role must be user or admin' },
      default: ROLES.USER,
    },

    bio: {
      type: String,
      trim: true,
      maxlength: [300, 'Bio cannot exceed 300 characters'],
      default: '',
    },

    avatar: {
      type: String,
      trim: true,
      // Embedded images (the built-in presets) are data URIs, which are far
      // longer than a URL. `validateAvatarRef` is what actually constrains the
      // value's shape; this is only a backstop against an unbounded column.
      maxlength: [65536, 'Avatar reference is too long'],
      default: '',
    },

    isActive: {
      type: Boolean,
      default: true,
    },

    isVerified: {
      type: Boolean,
      default: false,
    },

    isReceivingMessages: {
      type: Boolean,
      default: true,
    },

    authProvider: {
      type: String,
      enum: ['local', 'google'],
      default: 'local',
    },

    lastLoginAt: {
      type: Date,
      default: null,
    },

    tokensRevokedAt: {
      type: Date,
      default: null,
    },

    /**
     * Reception policy: the recipient's own rules for what reaches them.
     * This is a product feature, not a security boundary — the security
     * boundary is that a sender is never stored.
     */
    reception: {
      /** Pause the inbox without deleting the account. */
      isPaused: {
        type: Boolean,
        default: false,
      },

      /** Human-readable reason shown to senders while paused. */
      pauseReason: {
        type: String,
        trim: true,
        maxlength: [200, 'Pause reason cannot exceed 200 characters'],
        default: '',
      },

      /**
       * Categories the recipient wants. Empty array means "everything",
       * which is also the default — a new user is never silently filtered.
       */
      allowedCategories: {
        type: [String],
        default: [],
      },

      /** Public policy text shown to senders before they write. */
      policyMessage: {
        type: String,
        trim: true,
        maxlength: [400, 'Policy message cannot exceed 400 characters'],
        default: '',
      },

      /** Ask senders to pick a category before writing. */
      requireCategory: {
        type: Boolean,
        default: false,
      },

      /** Show the pre-send kindness nudge when the shield flags the text. */
      enableShield: {
        type: Boolean,
        default: true,
      },

      /** Auto-quarantine flagged messages instead of showing them inline. */
      quarantineFlagged: {
        type: Boolean,
        default: true,
      },
    },

    /**
     * Guided-honesty prompts: questions the owner publishes on their page so
     * senders answer something useful instead of staring at a blank box.
     */
    prompts: [
      {
        _id: false,
        id: {
          type: String,
          required: true,
          maxlength: 64,
        },
        text: {
          type: String,
          required: true,
          trim: true,
          minlength: [3, 'Prompt text must be at least 3 characters'],
          maxlength: [160, 'Prompt text cannot exceed 160 characters'],
        },
        isActive: {
          type: Boolean,
          default: true,
        },
      },
    ],

    /** Soft-delete marker; personal data is wiped at delete time (see userService). */
    deletedAt: {
      type: Date,
      default: null,
      select: false,
    },
  },
  {
    timestamps: true,
  },
);

// Real unique index on username (case-normalized by the lowercase setter).
userSchema.index({ username: 1 }, { unique: true });

// Partial unique index on email: only rows with a real email are indexed,
// so accounts without an email never conflict with each other.
userSchema.index(
  { email: 1 },
  {
    unique: true,
    partialFilterExpression: { email: { $type: 'string' } },
  },
);

userSchema.methods.isAccountActive = function isAccountActive() {
  return this.isActive && !this.deletedAt;
};

const User = mongoose.model('User', userSchema);

export default User;
