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

/**
 * When the GUI is reached via HTTPS reverse proxy (e.g. protean.rideai.com.au → :5173),
 * HMR / module URLs must use the public origin — otherwise the client gets a blank page
 * after the HTML shell loads.
 */
function resolvePublicHmr():
  | { protocol: 'wss' | 'ws'; host: string; clientPort: number }
  | undefined {
  const raw = process.env['PROTEAN_GUI_PUBLIC_ORIGIN']?.trim();
  if (!raw) return undefined;
  try {
    const url = new URL(raw);
    const protocol = url.protocol === 'https:' ? 'wss' : 'ws';
    const clientPort = url.port ? Number(url.port) : protocol === 'wss' ? 443 : 80;
    return { protocol, host: url.hostname, clientPort };
  } catch {
    return undefined;
  }
}

const publicOrigin = process.env['PROTEAN_GUI_PUBLIC_ORIGIN']?.trim();
const hmr = resolvePublicHmr();

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    allowedHosts: resolveAllowedHosts(),
    ...(publicOrigin ? { origin: publicOrigin } : {}),
    ...(hmr ? { hmr } : {}),
    proxy: {
      '/api': { target: ENGINE_ORIGIN, changeOrigin: true },
    },
  },
});
