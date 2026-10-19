// Production server: the built UI from dist/ plus the API, on one port. Run `pnpm build` first.
import { existsSync } from 'node:fs'
import path from 'node:path'
import { createAdaptorServer } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { Hono } from 'hono'
import { createApp } from './app.ts'
import { loadDotEnv } from './env.ts'
import { listenWithFallback } from './listen.ts'

loadDotEnv(path.join(import.meta.dirname, '..'))

if (!existsSync('dist/index.html')) {
  console.error('dist/ is missing. Run `pnpm build` first, or use `pnpm serve`.')
  process.exit(1)
}

const wanted = Number(process.env.PORT ?? 5180)
const root = new Hono()
root.route('/', createApp())
root.use('/*', serveStatic({ root: './dist' }))
root.get('*', serveStatic({ path: './dist/index.html' }))

const { port } = await listenWithFallback(() => createAdaptorServer({ fetch: root.fetch }), wanted)
if (port !== wanted) console.log(`Port ${wanted} is in use, using ${port} instead.`)
console.log(`Tasklane on http://127.0.0.1:${port}`)
