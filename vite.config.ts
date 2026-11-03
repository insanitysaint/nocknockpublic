import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// In dev the app proxies n8n's webhooks, so the browser only ever talks to one origin.
// In production Caddy does the same job (see ../deploy/Caddyfile).
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const target = env.N8N_URL || 'http://localhost:5678'
  return {
    plugins: [react()],
    server: {
      port: 5173,
      proxy: {
        '/webhook': { target, changeOrigin: true },
        '/form': { target, changeOrigin: true },
      },
    },
  }
})
