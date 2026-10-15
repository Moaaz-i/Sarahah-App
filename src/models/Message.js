import mongoose from 'mongoose';

/**
 * Anonymous message delivered to a user.
 * SECURITY: this model intentionally stores NO sender identity, no IP,
 * and no device information.
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
