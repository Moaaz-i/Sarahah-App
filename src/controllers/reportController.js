import asyncHandler from '../utils/asyncHandler.js';
import * as reportService from '../services/reportService.js';
import { fingerprintFromRequest } from '../utils/hashToken.js';

/** POST /api/v1/reports — anonymous or logged-in (optionalAuth). */
export const createReport = asyncHandler(async (req, res) => {
  const result = await reportService.createReport(req.body, {
    user: req.user ?? null,
    fingerprint: req.user ? null : fingerprintFromRequest(req),
    requestId: req.requestId,
  });

  res.status(201).json({
    success: true,
    message: 'Report submitted successfully',
    data: result,
  });
});

/** GET /api/v1/reports — admins only. */
export const listReports = asyncHandler(async (req, res) => {
  const { status, reason, page, limit } = req.query;

  const result = await reportService.listReports({ status, reason, page, limit });

  res.status(200).json({
    success: true,
    message: 'Reports fetched successfully',
    data: result,
  });
});

/** GET /api/v1/reports/:id — admins only. */
export const getReport = asyncHandler(async (req, res) => {
  const result = await reportService.getReport(req.params.id);

  res.status(200).json({
    success: true,
    message: 'Report fetched successfully',
    data: result,
  });
});

/** PATCH /api/v1/reports/:id/status — admins only, audited. */
export const updateReportStatus = asyncHandler(async (req, res) => {
  const result = await reportService.updateStatus(req.params.id, req.body.status, req.user, {
    requestId: req.requestId,
  });

  res.status(200).json({
    success: true,
    message: 'Report status updated',
    data: result,
  });
});

export default { createReport, listReports, getReport, updateReportStatus };
