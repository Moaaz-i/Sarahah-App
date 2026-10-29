import { io } from 'socket.io-client';
import { API_BASE, getAccessToken } from './api.js';

let socket = null;

/**
 * Get or initialize the Socket.io client singleton.
 */
export const getSocket = () => {
  if (!socket) {
    const token = getAccessToken();
    socket = io(API_BASE, {
      autoConnect: true,
      transports: ['websocket', 'polling'],
      auth: {
        token: token || undefined,
      },
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });

    socket.on('connect', () => {
      // Re-authenticate if token exists
      const currentToken = getAccessToken();
      if (currentToken) {
        socket.emit('auth', currentToken);
      }
    });
  }
  return socket;
};

/**
 * Re-authenticate socket connection (e.g. after login or token refresh).
 */
export const reauthSocket = (token) => {
  const s = getSocket();
  const tokenToUse = token || getAccessToken();
  if (tokenToUse) {
    s.auth = { token: tokenToUse };
    s.emit('auth', tokenToUse);
  }
};

/**
 * Join an anonymous thread room to receive real-time replies.
 */
export const joinThreadRoom = (conversationKey) => {
  const s = getSocket();
  if (conversationKey) {
    s.emit('join_thread', conversationKey);
  }
};

/**
 * Leave an anonymous thread room.
 */
export const leaveThreadRoom = (conversationKey) => {
  const s = getSocket();
  if (conversationKey) {
    s.emit('leave_thread', conversationKey);
  }
};
