import { defineConfig } from 'vite';
import { attachOnline } from './server/online.mjs';

export default defineConfig({
  base: './',
  server: { host: '0.0.0.0' },
  plugins: [{
    name: 'billiard-online',
    configureServer(server) { if (server.httpServer) attachOnline(server.httpServer); },
    configurePreviewServer(server) { if (server.httpServer) attachOnline(server.httpServer); },
  }],
});
