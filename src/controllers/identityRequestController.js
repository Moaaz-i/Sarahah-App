import asyncHandler from '../utils/asyncHandler.js';
import * as identityRequestService from '../services/identityRequestService.js';

/** POST /api/v1/identity-requests — receiver requests sender identity */
export const createRequest = asyncHandler(async (req, res) => {
  const result = await identityRequestService.createIdentityRequest(
    req.user,
    req.body.messageId,
  );

  res.status(201).json({
    success: true,
    message: 'Identity request sent successfully',
    data: result,
  });
});

/** GET /api/v1/identity-requests/received — sender views requests received from recipients */
export const getReceivedRequests = asyncHandler(async (req, res) => {
  const { status, limit, page } = req.query;
  const result = await identityRequestService.getReceivedRequests(req.user._id, {
    status,
    limit,
    page,
  });

  res.status(200).json({
    success: true,
    message: 'Received identity requests fetched successfully',
    data: result,
  });
});

/** GET /api/v1/identity-requests/sent — receiver views requests they sent */
export const getSentRequests = asyncHandler(async (req, res) => {
  const { status, limit, page } = req.query;
  const result = await identityRequestService.getSentRequests(req.user._id, {
    status,
    limit,
    page,
  });

  res.status(200).json({
    success: true,
    message: 'Sent identity requests fetched successfully',
    data: result,
  });
});

/** GET /api/v1/identity-requests/message/:messageId — check request status for a message */
export const getRequestByMessage = asyncHandler(async (req, res) => {
  const result = await identityRequestService.getRequestByMessageId(
    req.user._id,
    req.params.messageId,
  );

  res.status(200).json({
    success: true,
    message: 'Identity request fetched successfully',
    data: result,
  });
});

/** PATCH /api/v1/identity-requests/:id/respond — sender accepts or rejects request */
export const respondToRequest = asyncHandler(async (req, res) => {
  const result = await identityRequestService.respondToIdentityRequest(
    req.user,
    req.params.id,
    req.body.action,
  );

  res.status(200).json({
    success: true,
    message: `Identity request ${req.body.action === 'accept' ? 'accepted' : 'rejected'} successfully`,
    data: result,
  });
});

export default {
  createRequest,
  getReceivedRequests,
  getSentRequests,
  getRequestByMessage,
  respondToRequest,
};

