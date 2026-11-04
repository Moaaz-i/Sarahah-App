import IdentityRequest from '../models/IdentityRequest.js';
import Conversation from '../models/Conversation.js';
import Message from '../models/Message.js';
import User from '../models/User.js';
import AppError from '../utils/AppError.js';
import { ERROR_CODES } from '../constants/messages.js';
import {
  notifyIdentityRequest,
  notifyConversationCreated,
} from '../sockets/socketService.js';

/**
 * Sanitize identity request based on the caller's role.
 * If the caller is the receiver and the request is NOT accepted,
 * the sender's identity MUST NEVER be revealed.
 */
export const sanitizeIdentityRequest = (requestDoc, callerId) => {
  if (!requestDoc) return null;
  const obj = typeof requestDoc.toObject === 'function' ? requestDoc.toObject() : { ...requestDoc };
  const callerIdStr = String(callerId);
  const receiverIdStr = String(obj.receiver?._id || obj.receiver);

  // If caller is the receiver and status is NOT accepted, strip out sender
  if (callerIdStr === receiverIdStr && obj.status !== 'accepted') {
    delete obj.sender;
  }

  return obj;
};

/**
 * 2) Request Sender Identity
 * The receiver can request to know who sent a specific message.
 * Creates a request with status 'pending'.
 */
export const createIdentityRequest = async (receiverUser, messageId) => {
  const message = await Message.findOne({
    _id: messageId,
    recipient: receiverUser._id,
    isDeleted: false,
  });

  if (!message) {
    throw AppError.notFound('Message not found');
  }

  if (!message.sender) {
    throw AppError.badRequest(
      'This message was sent by an unregistered guest, so identity cannot be requested',
    );
  }

  if (String(message.sender) === String(receiverUser._id)) {
    throw AppError.badRequest('Cannot request identity for your own message');
  }

  // Check if request already exists for this message
  const existingRequest = await IdentityRequest.findOne({ message: message._id });
  if (existingRequest) {
    throw AppError.conflict(
      'IDENTITY_REQUEST_EXISTS',
      'An identity request for this message already exists',
      { requestId: existingRequest._id, status: existingRequest.status },
    );
  }

  const identityRequest = await IdentityRequest.create({
    message: message._id,
    sender: message.sender,
    receiver: receiverUser._id,
    status: 'pending',
  });

  // Notify the sender in real-time (without revealing receiver if not needed, but receiver is asking)
  notifyIdentityRequest(message.sender, {
    type: 'request_received',
    requestId: identityRequest._id,
    messageId: message._id,
    receiver: {
      _id: receiverUser._id,
      name: receiverUser.name,
      username: receiverUser.username,
      avatar: receiverUser.avatar,
    },
    createdAt: identityRequest.createdAt,
  });

  return sanitizeIdentityRequest(identityRequest, receiverUser._id);
};

/**
 * 3) Get Requests
 * The sender can view all requests received from other users.
 */
export const getReceivedRequests = async (
  userId,
  { status, limit = 20, page = 1 } = {},
) => {
  const query = { sender: userId };
  if (status) query.status = status;

  const parsedLimit = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100);
  const parsedPage = Math.max(parseInt(page, 10) || 1, 1);
  const skip = (parsedPage - 1) * parsedLimit;

  const [requests, total] = await Promise.all([
    IdentityRequest.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parsedLimit)
      .populate('receiver', 'name username avatar bio')
      .populate('message', 'content category createdAt')
      .populate('conversation', '_id'),
    IdentityRequest.countDocuments(query),
  ]);

  return {
    requests: requests.map((req) => sanitizeIdentityRequest(req, userId)),
    total,
    page: parsedPage,
    totalPages: Math.ceil(total / parsedLimit),
  };
};

/**
 * Get requests sent by the user (as the receiver of the anonymous message).
 */
export const getSentRequests = async (
  userId,
  { status, limit = 20, page = 1 } = {},
) => {
  const query = { receiver: userId };
  if (status) query.status = status;

  const parsedLimit = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100);
  const parsedPage = Math.max(parseInt(page, 10) || 1, 1);
  const skip = (parsedPage - 1) * parsedLimit;

  const [requests, total] = await Promise.all([
    IdentityRequest.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parsedLimit)
      .populate('sender', 'name username avatar bio')
      .populate('message', 'content category createdAt')
      .populate('conversation', '_id'),
    IdentityRequest.countDocuments(query),
  ]);

  return {
    requests: requests.map((req) => sanitizeIdentityRequest(req, userId)),
    total,
    page: parsedPage,
    totalPages: Math.ceil(total / parsedLimit),
  };
};

/**
 * Get request status for a specific message (for the receiver or sender).
 */
export const getRequestByMessageId = async (userId, messageId) => {
  const request = await IdentityRequest.findOne({
    message: messageId,
    $or: [{ receiver: userId }, { sender: userId }],
  })
    .populate('sender', 'name username avatar bio')
    .populate('receiver', 'name username avatar bio')
    .populate('message', 'content category createdAt')
    .populate('conversation', '_id');

  if (!request) return null;
  return sanitizeIdentityRequest(request, userId);
};

/**
 * 4) Accept or Reject Request
 * The sender can either accept or reject the request.
 * - If rejected: sender's identity remains hidden.
 * - If accepted: receiver can now know the sender's identity, change request status to accepted.
 * 5) Create Conversation
 * - After acceptance, create a conversation between sender and receiver.
 * - Link conversation to the original message.
 */
export const respondToIdentityRequest = async (senderUser, requestId, action) => {
  if (!['accept', 'reject'].includes(action)) {
    throw AppError.badRequest('Action must be either "accept" or "reject"');
  }

  const identityRequest = await IdentityRequest.findOne({
    _id: requestId,
    sender: senderUser._id,
  });

  if (!identityRequest) {
    throw AppError.notFound('Identity request not found');
  }

  if (identityRequest.status !== 'pending') {
    throw AppError.badRequest('Identity request has already been responded to');
  }

  identityRequest.respondedAt = new Date();

  if (action === 'reject') {
    identityRequest.status = 'rejected';
    await identityRequest.save();

    // Notify receiver that request was rejected (sender remains hidden)
    notifyIdentityRequest(identityRequest.receiver, {
      type: 'request_rejected',
      requestId: identityRequest._id,
      messageId: identityRequest.message,
    });

    return sanitizeIdentityRequest(identityRequest, senderUser._id);
  }

  // Action is 'accept'
  identityRequest.status = 'accepted';

  const pairKey = [String(identityRequest.sender), String(identityRequest.receiver)].sort().join(':');

  // Find or create conversation:
  // Check if conversation is already linked to this message OR between this pair of users
  let conversation = await Conversation.findOne({
    $or: [
      { message: identityRequest.message },
      { pairKey },
      { participants: { $all: [identityRequest.sender, identityRequest.receiver], $size: 2 } },
    ],
  });

  const origMessage = await Message.findById(identityRequest.message);

  if (!conversation) {
    conversation = await Conversation.create({
      message: identityRequest.message,
      identityRequest: identityRequest._id,
      pairKey,
      participants: [identityRequest.sender, identityRequest.receiver],
      lastMessage: {
        content: origMessage?.content || 'Conversation started',
        sender: identityRequest.sender,
        createdAt: new Date(),
      },
    });
  } else {
    // Re-use existing conversation between this pair without conflict
    if (!conversation.pairKey) {
      conversation.pairKey = pairKey;
    }
    if (origMessage?.content) {
      conversation.lastMessage = {
        content: origMessage.content,
        sender: identityRequest.sender,
        createdAt: new Date(),
      };
    }
    conversation.updatedAt = new Date();
    await conversation.save();
  }

  identityRequest.conversation = conversation._id;
  await identityRequest.save();

  // Populate for notification and response
  const populated = await IdentityRequest.findById(identityRequest._id)
    .populate('sender', 'name username avatar bio')
    .populate('receiver', 'name username avatar bio')
    .populate('message', 'content category createdAt')
    .populate('conversation');

  // Real-time notify receiver that identity was revealed!
  notifyIdentityRequest(identityRequest.receiver, {
    type: 'request_accepted',
    requestId: identityRequest._id,
    messageId: identityRequest.message,
    conversationId: conversation._id,
    sender: {
      _id: senderUser._id,
      name: senderUser.name,
      username: senderUser.username,
      avatar: senderUser.avatar,
      bio: senderUser.bio,
    },
  });

  notifyConversationCreated(identityRequest.receiver, {
    conversationId: conversation._id,
    messageId: identityRequest.message,
  });

  notifyConversationCreated(identityRequest.sender, {
    conversationId: conversation._id,
    messageId: identityRequest.message,
  });

  return sanitizeIdentityRequest(populated, senderUser._id);
};

export default {
  sanitizeIdentityRequest,
  createIdentityRequest,
  getReceivedRequests,
  getSentRequests,
  getRequestByMessageId,
  respondToIdentityRequest,
};

