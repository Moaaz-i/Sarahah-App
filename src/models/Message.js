import mongoose from 'mongoose';
import { MESSAGE_CATEGORY_VALUES, HARM_LABEL_VALUES } from '../constants/feedback.js';

/**
 * Anonymous message delivered to a user.
 * SECURITY: this model intentionally stores NO sender identity, no IP,
 * and no device information.
 *
 * The feedback fields below (`category`, `harmLabel`, `isQuarantined`) are
 * derived from the message TEXT, never from who sent it. They add no sender
 * signal: a category is chosen by the sender from a public list, and the harm
 * label is computed locally by a rule engine over the same characters that are
 * already stored in `content`. Neither can identify anyone.
 */
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
     * This is the backbone of the inbox grouping and the feedback mirror.
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

    /** The guided-honesty prompt id the sender answered, if any. */
    promptId: {
      type: String,
      trim: true,
      maxlength: [64, 'Prompt id is too long'],
      default: null,
    },

    /**
     * Result of the local rule-based harm shield. null = nothing matched.
     * Probabilistic evidence, NOT a verdict: the recipient decides.
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
     * the recipient reads, releases or deletes it. The recipient can turn the
     * shield off entirely in reception settings.
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
