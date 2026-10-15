import Report from '../models/Report.js';
import Message from '../models/Message.js';
import AuditLog from '../models/AuditLog.js';
import AppError from '../utils/AppError.js';
import { ERROR_CODES } from '../constants/messages.js';
import { pageMeta } from '../utils/pagination.js';

const auditRetention = () => new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);

/**
 * Report service.
 * - Creating a report: allowed for logged-in users AND anonymous visitors.
 *   An anonymous report keeps reporter=null - no fake identity is invented.
 *   A salted fingerprint is used ONLY for duplicate/flood control and is
 *   never returned to any client.
 * - Reviewing reports: admin only, enforced by the route (adminMiddleware)
 *   AND re-checked here so a service-level call cannot bypass it.
 */

/** Strip private fields before any report leaves the service. */
const presentReport = (report) => ({
  id: String(report._id),
  message: report.message ? String(report.message._id ?? report.message) : null,
  // Populated on the admin list/detail endpoints so moderators can actually
  // read what was reported. Absent (null) when the report was just created
  // or when the target message no longer exists.
  messageContent: report.message?.content ?? null,
  messageCreatedAt: report.message?.createdAt ?? null,
  reason: report.reason,
  details: report.details || '',
  status: report.status,
  reporter: report.reporter ? String(report.reporter) : null,
  reviewedBy: report.reviewedBy ? String(report.reviewedBy) : null,
  reviewedAt: report.reviewedAt,
  createdAt: report.createdAt,
  updatedAt: report.updatedAt,
});

export const createReport = async (
  { messageId, reason, details = '' },
  { user = null, fingerprint = null, requestId = null, now = new Date() } = {},
) => {
  const message = await Message.findOne({ _id: messageId, isDeleted: false });
  if (!message) throw AppError.notFound('Message not found');

  // Duplicate control: same reporter (or same anonymous fingerprint)
  // reporting the same message within 24h is rejected.
  const since = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const duplicateFilter = {
    message: message._id,
    createdAt: { $gte: since },
    ...(user
      ? { reporter: user._id }
      : fingerprint
        ? { $or: [{ reporter: null, reporterFingerprint: fingerprint }] }
        : { reporter: null, reporterFingerprint: null }),
  };

  const duplicate = await Report.findOne(duplicateFilter).select('+reporterFingerprint');
  if (duplicate) {
    throw AppError.conflict(ERROR_CODES.DUPLICATE_REPORT, 'You already reported this message');
  }

  const report = await Report.create({
    message: message._id,
    reporter: user ? user._id : null,
    reporterFingerprint: user ? null : fingerprint,
    reason,
    details,
    status: 'pending',
    requestId,
  });

  return { report: presentReport(report) };
};

/** Admin: list reports with optional status/reason filters + pagination. */
export const listReports = async ({ status, reason, page = 1, limit = 20 } = {}) => {
  const filter = {};
  if (status) filter.status = status;
  if (reason) filter.reason = reason;

  const [total, reports] = await Promise.all([
    Report.countDocuments(filter),
    Report.find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('message', 'content createdAt'),
  ]);

  return {
    reports: reports.map(presentReport),
    pagination: pageMeta({ page, limit, total }),
  };
};

/** Admin: single report (message content included for moderation). */
export const getReport = async (reportId) => {
  const report = await Report.findById(reportId).populate('message', 'content createdAt');
  if (!report) throw AppError.notFound('Report not found');
  return { report: presentReport(report) };
};

/** Admin: update status + record reviewedBy/reviewedAt + write an audit entry. */
export const updateStatus = async (reportId, status, admin, { requestId = null } = {}) => {
  if (!admin || admin.role !== 'admin') {
    throw AppError.forbidden('Administrator privileges are required');
  }

  const report = await Report.findById(reportId);
  if (!report) throw AppError.notFound('Report not found');

  const previousStatus = report.status;
  report.status = status;
  report.reviewedBy = admin._id;
  report.reviewedAt = new Date();
  await report.save();

  await AuditLog.create({
    actor: admin._id,
    action: 'report.status_changed',
    targetType: 'Report',
    targetId: String(report._id),
    requestId,
    metadata: { from: previousStatus, to: status },
    expiresAt: auditRetention(),
  });

  return { report: presentReport(report) };
};

export default { createReport, listReports, getReport, updateStatus };
