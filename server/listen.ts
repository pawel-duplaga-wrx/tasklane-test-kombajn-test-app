import type { Server } from 'node:net'

/**
 * Listens on `port`, or on the next free port if it's taken. Tries `tries` ports in a row,
 * then rejects with the last EADDRINUSE error.
 */
export function listenWithFallback(
  create: () => Server,
  port: number,
  host = '127.0.0.1',
  tries = 10,
): Promise<{ server: Server; port: number }> {
  return new Promise((resolve, reject) => {
    const attempt = (p: number, left: number) => {
      const server = create()
      server.once('error', (err: NodeJS.ErrnoException) => {
        if (err.code === 'EADDRINUSE' && left > 1) attempt(p + 1, left - 1)
        else reject(err)
      })
      server.listen(p, host, () => resolve({ server, port: p }))
    }
    attempt(port, tries)
  })
}
