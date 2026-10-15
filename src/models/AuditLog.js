import mongoose from 'mongoose';

/**
 * Audit trail for admin/security relevant actions.
 * SECURITY: never store passwords, tokens, JWTs or message bodies here.
 * Retention is enforced through the TTL index on expiresAt.
 */
const auditLogSchema = new mongoose.Schema(
  {
    actor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },

    action: {
      type: String,
      required: [true, 'Action is required'],
      trim: true,
      maxlength: 100,
    },

    targetType: {
      type: String,
      required: [true, 'Target type is required'],
      trim: true,
      maxlength: 50,
    },

    targetId: {
      type: String,
      default: null,
      maxlength: 100,
    },

    requestId: {
      type: String,
      default: null,
      maxlength: 100,
    },

    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },

    /** TTL index enforces the retention policy (records auto-expire). */
    expiresAt: {
      type: Date,
      required: true,
    },
  },
  {
    timestamps: true,
  },
);

auditLogSchema.index({ action: 1, createdAt: -1 });
auditLogSchema.index({ targetType: 1, targetId: 1, createdAt: -1 });

const AuditLog = mongoose.model('AuditLog', auditLogSchema);

export default AuditLog;
