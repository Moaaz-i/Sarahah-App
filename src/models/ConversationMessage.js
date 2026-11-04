import mongoose from 'mongoose';

/**
 * Message sent inside an authorized 1-on-1 conversation.
 */
const conversationMessageSchema = new mongoose.Schema(
  {
    conversation: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Conversation',
      required: [true, 'Conversation reference is required'],
      index: true,
    },

    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Sender is required'],
      index: true,
    },

    content: {
      type: String,
      required: [true, 'Message content is required'],
      trim: true,
      minlength: [1, 'Message cannot be empty'],
      maxlength: [2000, 'Message cannot exceed 2000 characters'],
    },

    readBy: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
  },
  {
    timestamps: true,
  },
);

conversationMessageSchema.index({ conversation: 1, createdAt: 1 });

const ConversationMessage = mongoose.model(
  'ConversationMessage',
  conversationMessageSchema,
);

export default ConversationMessage;

