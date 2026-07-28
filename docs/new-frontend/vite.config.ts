import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

/** Backend engine origin for dev; the GUI itself never hardcodes API hosts (Law 2). */
const ENGINE_ORIGIN = process.env['PROTEAN_ENGINE_ORIGIN'] ?? 'http://localhost:8787';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/api': { target: ENGINE_ORIGIN, changeOrigin: true },
    },
  },
});
