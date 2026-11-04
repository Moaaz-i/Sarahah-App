import { Server } from 'socket.io';
import { verifyAccessToken } from '../utils/generateToken.js';
import env from '../config/env.js';

let io = null;

/**
 * Initialize Socket.io attached to the HTTP server.
 */
export const initSocket = (httpServer) => {
  io = new Server(httpServer, {
    cors: {
      origin: env.corsOrigins && env.corsOrigins.length > 0 ? env.corsOrigins : '*',
      methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'],
      credentials: true,
    },
  });

  io.on('connection', (socket) => {
    // 1. Authenticate user if token provided in auth handshake
    const token = socket.handshake.auth?.token;
    if (token) {
      try {
        const payload = verifyAccessToken(token);
        if (payload?.sub) {
          socket.userId = String(payload.sub);
          socket.join(`user:${socket.userId}`);
        }
      } catch {
        // Handshake auth failed; socket remains unauthenticated
      }
    }

    // 2. Allow re-auth after initial connection (e.g. user logs in)
    socket.on('auth', (authToken) => {
      if (authToken) {
        try {
          const payload = verifyAccessToken(authToken);
          if (payload?.sub) {
            socket.userId = String(payload.sub);
            socket.join(`user:${socket.userId}`);
          }
        } catch {
          // ignore invalid token
        }
      }
    });

    // 3. Join anonymous thread room for real-time conversation
    socket.on('join_thread', (conversationKey) => {
      if (conversationKey && typeof conversationKey === 'string') {
        socket.join(`thread:${conversationKey.trim()}`);
      }
    });

    // 4. Leave anonymous thread room
    socket.on('leave_thread', (conversationKey) => {
      if (conversationKey && typeof conversationKey === 'string') {
        socket.leave(`thread:${conversationKey.trim()}`);
      }
    });

    // 5. Join direct conversation room
    socket.on('join_conversation', (conversationId) => {
      if (conversationId && typeof conversationId === 'string') {
        socket.join(`conversation:${conversationId.trim()}`);
      }
    });

    // 6. Leave direct conversation room
    socket.on('leave_conversation', (conversationId) => {
      if (conversationId && typeof conversationId === 'string') {
        socket.leave(`conversation:${conversationId.trim()}`);
      }
    });
  });

  return io;
};

export const getIO = () => io;

/**
 * Notify a user in real-time that a new message has arrived.
 */
export const notifyUserNewMessage = (recipientId, messagePayload) => {
  if (!io || !recipientId) return;
  io.to(`user:${String(recipientId)}`).emit('new_message', messagePayload);
};

/**
 * Notify all participants in an anonymous thread that a new reply has arrived.
 */
export const notifyThreadNewReply = (conversationKey, replyPayload) => {
  if (!io || !conversationKey) return;
  io.to(`thread:${String(conversationKey).trim()}`).emit('new_reply', replyPayload);
};

/**
 * Notify all participants in a direct conversation of a new message.
 */
export const notifyConversationMessage = (conversationId, messagePayload) => {
  if (!io || !conversationId) return;
  io.to(`conversation:${String(conversationId).trim()}`).emit('conversation_message', messagePayload);
};

/**
 * Notify a user about an identity request event (new request, accepted, rejected).
 */
export const notifyIdentityRequest = (userId, requestPayload) => {
  if (!io || !userId) return;
  io.to(`user:${String(userId)}`).emit('identity_request', requestPayload);
};

/**
 * Notify a user that a new direct conversation was created.
 */
export const notifyConversationCreated = (userId, conversationPayload) => {
  if (!io || !userId) return;
  io.to(`user:${String(userId)}`).emit('conversation_created', conversationPayload);
};

export default {
  initSocket,
  getIO,
  notifyUserNewMessage,
  notifyThreadNewReply,
  notifyConversationMessage,
  notifyIdentityRequest,
  notifyConversationCreated,
};
