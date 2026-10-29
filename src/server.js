import http from 'http';
import env from './config/env.js';
import connectDB, { closeDatabase } from './config/database.js';
import app from './app.js';
import { initSocket } from './sockets/socketService.js';

let server = null;
let shuttingDown = false;

const start = async () => {
  try {
    await connectDB();
  } catch (err) {
    console.error('Startup failed: could not connect to the database.');
    console.error(err.message);
    process.exit(1);
  }

  // Create standard HTTP server and attach Socket.io
  server = http.createServer(app);
  initSocket(server);

  server.listen(env.port, () => {
    console.log(`Server listening on http://localhost:${env.port} [${env.nodeEnv}] (Socket.io active)`);
  });

  // If the HTTP server itself fails to start, exit non-zero.
  server.on('error', (err) => {
    console.error('Startup failed:', err.message);
    process.exit(1);
  });
};

const shutdown = (signal) => async () => {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`${signal} received: starting graceful shutdown...`);

  const forceExit = setTimeout(() => {
    console.error('Graceful shutdown timed out, forcing exit.');
    process.exit(1);
  }, 10_000);
  forceExit.unref();

  try {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
      console.log('HTTP server closed, no new connections accepted.');
    }
    await closeDatabase();
    clearTimeout(forceExit);
    process.exit(0);
  } catch (err) {
    console.error('Error during shutdown:', err.message);
    process.exit(1);
  }
};

process.on('SIGTERM', shutdown('SIGTERM'));
process.on('SIGINT', shutdown('SIGINT'));

// Last-resort safety nets: log and exit (a broken process must not keep
// serving traffic with unknown state).
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled promise rejection:', reason?.message || reason);
  process.exit(1);
});
process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err.message);
  process.exit(1);
});

start();
