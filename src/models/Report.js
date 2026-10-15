import mongoose from 'mongoose';
import { REPORT_REASONS, REPORT_STATUSES } from '../constants/reportReasons.js';

/**
 * A report filed against an anonymous message.
 * - reporter is null for anonymous reports (no fake identity is created).
 * - reporterFingerprint is a salted hash used only for flood/duplicate
 *   control; it is never returned to any client.
 */
const reportSchema = new mongoose.Schema(
  {
    message: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Message',
      required: [true, 'Message is required'],
    },

    reporter: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },

    reporterFingerprint: {
      type: String,
      select: false,
      default: null,
    },

    reason: {
      type: String,
      required: [true, 'Report reason is required'],
      enum: {
        values: [...REPORT_REASONS],
        message: 'Invalid report reason',
      },
    },

    details: {
      type: String,
      trim: true,
      maxlength: [1000, 'Details cannot exceed 1000 characters'],
      default: '',
    },

    status: {
      type: String,
      enum: { values: [...REPORT_STATUSES], message: 'Invalid report status' },
      default: 'pending',
    },

    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },

    reviewedAt: {
      type: Date,
      default: null,
    },

    requestId: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: true,
  },
);

reportSchema.index({ status: 1, createdAt: -1 });
reportSchema.index({ message: 1, reporter: 1, createdAt: -1 });
reportSchema.index({ message: 1, reporterFingerprint: 1, createdAt: -1 });

const Report = mongoose.model('Report', reportSchema);

export default Report;
