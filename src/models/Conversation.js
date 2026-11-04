import mongoose from 'mongoose';

/**
 * 1-on-1 Direct Conversation created between sender and receiver
 * after the sender accepts an identity request.
 * Linked to the original anonymous message.
 */
const conversationSchema = new mongoose.Schema(
  {
    message: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Message',
      required: [true, 'Original message reference is required'],
    },

    identityRequest: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'IdentityRequest',
      default: null,
    },

    pairKey: {
      type: String,
      default: null,
      index: true,
    },

    participants: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
      },
    ],

    lastMessage: {
      content: { type: String, default: null },
      sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
      createdAt: { type: Date, default: null },
    },
  },
  {
    timestamps: true,
  },
);

conversationSchema.pre('validate', function (next) {
  if (this.participants && this.participants.length === 2 && !this.pairKey) {
    const [p1, p2] = this.participants.map((p) => String(p._id || p)).sort();
    this.pairKey = `${p1}:${p2}`;
  }
  next();
});

conversationSchema.index({ participants: 1, updatedAt: -1 });
conversationSchema.index({ message: 1 });

const Conversation = mongoose.model('Conversation', conversationSchema);

export default Conversation;
