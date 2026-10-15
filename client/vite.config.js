import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The client talks to the API on its own origin (CORS allow-list in the
// backend already includes CLIENT_ORIGIN). There is deliberately NO dev
// proxy: the Google OAuth flow cookie is scoped to the API host, so sending
// the browser straight to the API origin is what keeps `state` verifiable.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
  },
  preview: {
    port: 5174,
  },
});
