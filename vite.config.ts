import { fileURLToPath } from 'node:url'
import { getRequestListener } from '@hono/node-server'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'
import { createApp } from './server/app.ts'
import { loadDotEnv } from './server/env.ts'

loadDotEnv(fileURLToPath(new URL('.', import.meta.url)))

// Mounts the Hono API on the Vite dev server, so `pnpm dev` is one process on one port.
function api(): Plugin {
  return {
    name: 'tasklane-api',
    configureServer(server) {
      const listener = getRequestListener(createApp().fetch)
      server.middlewares.use((req, res, next) => {
        if (req.url?.startsWith('/api/')) {
          void listener(req, res)
          return
        }
        next()
      })
    },
  }
}

const port = Number(process.env.PORT ?? 5180)

export default defineConfig({
  plugins: [react(), api()],
  // If the port is taken, Vite moves to the next free one and prints the URL it used.
  server: { host: '127.0.0.1', port, strictPort: false },
})
