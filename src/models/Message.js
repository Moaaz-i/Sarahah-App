import mongoose from 'mongoose';
import {
  MESSAGE_CATEGORY_VALUES,
  HARM_LABEL_VALUES,
  IDENTITY_CLUE_VALUES,
  SENTIMENT_VALUES,
} from '../constants/feedback.js';

/**
 * Anonymous message delivered to a user.
 * SECURITY: this model intentionally stores NO sender identity, no IP,
 * and no device information.
 *
 * The feedback fields below (`category`, `harmLabel`, `isQuarantined`, `sentiment`) are
 * derived from the message TEXT or declared intent, never from who sent it.
 */
const replySchema = new mongoose.Schema(
  {
    authorType: {
      type: String,
      enum: ['recipient', 'sender'],
      required: true,
    },
    content: {
      type: String,
      required: true,
      trim: true,
      maxlength: [1000, 'Reply cannot exceed 1000 characters'],
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: true },
);

const messageSchema = new mongoose.Schema(
  {
    recipient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Recipient is required'],
    },

    content: {
      type: String,
      required: [true, 'Message content is required'],
      trim: true,
      minlength: [1, 'Message cannot be empty'],
      maxlength: [2000, 'Message cannot exceed 2000 characters'],
    },

    isRead: {
      type: Boolean,
      default: false,
    },

    readAt: {
      type: Date,
      default: null,
    },

    isArchived: {
      type: Boolean,
      default: false,
    },

    archivedAt: {
      type: Date,
      default: null,
    },

    /** Logical delete: the message stays in the DB but is hidden from the user. */
    isDeleted: {
      type: Boolean,
      default: false,
    },

    deletedAt: {
      type: Date,
      default: null,
    },

    /**
     * The sender's declared intent, chosen from a fixed public list.
     * `general` is the fallback so an unlabelled message is never rejected.
     */
    category: {
      type: String,
      enum: {
        values: MESSAGE_CATEGORY_VALUES,
        message: `Category must be one of: ${MESSAGE_CATEGORY_VALUES.join(', ')}`,
      },
      default: 'general',
      index: true,
    },

    /** Optional relationship tag declared by the sender (e.g. friend, colleague). */
    identityClue: {
      type: String,
      enum: {
        values: IDENTITY_CLUE_VALUES,
        message: `Identity clue must be one of: ${IDENTITY_CLUE_VALUES.join(', ')}`,
      },
      default: 'none',
      index: true,
    },

    /** The guided-honesty prompt id the sender answered, if any. */
    promptId: {
      type: String,
      trim: true,
      maxlength: [64, 'Prompt id is too long'],
      default: null,
    },

    /** Heuristic sentiment classification of the note. */
    sentiment: {
      type: String,
      enum: {
        values: SENTIMENT_VALUES,
        message: `Sentiment must be one of: ${SENTIMENT_VALUES.join(', ')}`,
      },
      default: 'neutral',
      index: true,
    },

    /**
     * Result of the local rule-based harm shield. null = nothing matched.
     */
    harmLabel: {
      type: String,
      enum: {
        values: HARM_LABEL_VALUES,
        message: 'Unknown harm label',
      },
      default: null,
      index: true,
    },

    /** 0..1 heuristic confidence from the shield, for UI prioritisation only. */
    harmConfidence: {
      type: Number,
      min: 0,
      max: 1,
      default: 0,
    },

    /**
     * Soft-quarantine: hidden behind an explicit section in the inbox until
     * the recipient reads, releases or deletes it.
     */
    isQuarantined: {
      type: Boolean,
      default: false,
      index: true,
    },

    /** When the recipient released a quarantined message into the inbox. */
    releasedAt: {
      type: Date,
      default: null,
    },

    /** Optional link to the goal the recipient created from this note. */
    goal: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'FeedbackGoal',
      default: null,
    },

    /**
     * Secret key given to the anonymous sender at creation time to access
     * and participate in a two-way anonymous conversation thread.
     */
    conversationKey: {
      type: String,
      unique: true,
      sparse: true,
      index: true,
    },

    /** Public response written by recipient (for Story Card and profile showcase). */
    publicReply: {
      type: String,
      trim: true,
      maxlength: [1000, 'Public reply cannot exceed 1000 characters'],
      default: null,
    },

    publicReplyAt: {
      type: Date,
      default: null,
    },

    /** Two-way private thread replies between recipient and the anonymous sender. */
    replies: [replySchema],

    /** Optional base64 or audio URL for anonymous voice note. */
    voiceUrl: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: true,
  },
);

// Newest-first retrieval of a user's inbox (with pagination support).
messageSchema.index({ recipient: 1, isDeleted: 1, createdAt: -1, _id: -1 });

// Fast lookup when checking duplicate anonymous reports.
messageSchema.index({ recipient: 1, isRead: 1, createdAt: -1 });

const Message = mongoose.model('Message', messageSchema);

export default Message;
