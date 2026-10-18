import mongoose from 'mongoose';
import {
  MESSAGE_CATEGORY_VALUES,
  GOAL_STATUSES,
  GOAL_STATUS_VALUES,
} from '../constants/feedback.js';

/**
 * A "feedback goal": the recipient turning a note they received into something
 * they intend to act on. This is the pivot from "a place that receives messages"
 * to "a place that helps you do something with them".
 *
 * PRIVACY
 * - `message` is a reference to the recipient's OWN message, used only to
 *   display the original note back to them. It is never exposed to a sender.
 * - A goal is private to its owner: no public endpoint reads it.
 * - Nothing here identifies a sender, because nothing in `Message` does.
 *
 * HONESTY
 * A goal records the recipient's OWN intention and their OWN rating. It does
 * not assert that the underlying feedback was correct or that it "worked".
 */
const feedbackGoalSchema = new mongoose.Schema(
  {
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Goal owner is required'],
      index: true,
    },

    /** Optional link back to the note that triggered the goal. */
    message: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Message',
      default: null,
    },

    /** Free-text summary: what the recipient understood they should work on. */
    note: {
      type: String,
      required: [true, 'Goal note is required'],
      trim: true,
      minlength: [1, 'Goal note cannot be empty'],
      maxlength: [600, 'Goal note cannot exceed 600 characters'],
    },

    /** The concrete experiment: "I will let people finish before replying." */
    action: {
      type: String,
      trim: true,
      maxlength: [600, 'Action cannot exceed 600 characters'],
      default: '',
    },

    /** Optional self-chosen review moment. */
    reviewAt: {
      type: Date,
      default: null,
    },

    status: {
      type: String,
      enum: {
        values: GOAL_STATUS_VALUES,
        message: `Status must be one of: ${GOAL_STATUS_VALUES.join(', ')}`,
      },
      default: GOAL_STATUSES.ACTIVE,
    },

    /** The owner's OWN rating of their progress. 0 = not started, 5 = fully. */
    rating: {
      type: Number,
      min: [0, 'Rating must be between 0 and 5'],
      max: [5, 'Rating must be between 0 and 5'],
      default: 0,
    },

    /** Owner's private reflection. Never leaves their account. */
    reflection: {
      type: String,
      trim: true,
      maxlength: [1200, 'Reflection cannot exceed 1200 characters'],
      default: '',
    },

    completedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  },
);

// Newest-first list for the owner's dashboard.
feedbackGoalSchema.index({ owner: 1, createdAt: -1 });

const FeedbackGoal = mongoose.model('FeedbackGoal', feedbackGoalSchema);

export default FeedbackGoal;
