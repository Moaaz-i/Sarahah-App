import mongoose from 'mongoose';

/**
 * Request to reveal the identity of an anonymous message sender.
 *
 * Flow:
 * 1. User A sends an anonymous message to User B (sender is recorded internally, hidden from B).
 * 2. User B requests to know who sent the message (status: 'pending').
 * 3. User A views requests received from other users.
 * 4. User A accepts or rejects:
 *    - If rejected: status = 'rejected', identity remains hidden.
 *    - If accepted: status = 'accepted', identity revealed, conversation created.
 */
const identityRequestSchema = new mongoose.Schema(
  {
    message: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Message',
      required: [true, 'Message reference is required'],
    },

    sender: {
      // The user who sent the anonymous message (whose identity is being requested)
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Sender reference is required'],
      index: true,
    },

    receiver: {
      // The recipient of the message who is requesting to know the sender
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Receiver reference is required'],
      index: true,
    },

    status: {
      type: String,
      enum: {
        values: ['pending', 'accepted', 'rejected'],
        message: 'Status must be pending, accepted, or rejected',
      },
      default: 'pending',
      index: true,
    },

    conversation: {
      // Once accepted, links to the created Conversation
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Conversation',
      default: null,
    },

    respondedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  },
);

// Only one request per message
identityRequestSchema.index({ message: 1 }, { unique: true });
identityRequestSchema.index({ sender: 1, status: 1, createdAt: -1 });
identityRequestSchema.index({ receiver: 1, status: 1, createdAt: -1 });

const IdentityRequest = mongoose.model('IdentityRequest', identityRequestSchema);

export default IdentityRequest;
