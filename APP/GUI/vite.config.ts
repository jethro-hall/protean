import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

/** Backend engine origin for dev; the GUI itself never hardcodes API hosts (Law 2). */
const ENGINE_ORIGIN = process.env['PROTEAN_ENGINE_ORIGIN'] ?? 'http://localhost:8787';

/**
 * Hostnames Vite may serve (Host header check). Comma-separated via
 * PROTEAN_GUI_ALLOWED_HOSTS; use `true` / `*` to allow any (dev only).
 * Defaults cover the rideai public hostname + local loopback.
 */
function resolveAllowedHosts(): true | string[] {
  const raw = process.env['PROTEAN_GUI_ALLOWED_HOSTS']?.trim();
  if (raw === 'true' || raw === '*') return true;
  const hosts = (raw ?? 'protean.rideai.com.au,.rideai.com.au,localhost,127.0.0.1')
    .split(',')
    .map((host) => host.trim())
    .filter((host) => host.length > 0);
  return hosts;
}

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    allowedHosts: resolveAllowedHosts(),
    proxy: {
      '/api': { target: ENGINE_ORIGIN, changeOrigin: true },
    },
  },
});
