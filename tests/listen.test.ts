import { createServer, type Server } from 'node:net'
import { afterEach, describe, expect, it } from 'vitest'
import { listenWithFallback } from '../server/listen.ts'

const open: Server[] = []

function occupy(): Promise<number> {
  return new Promise((resolve) => {
    const blocker = createServer()
    open.push(blocker)
    blocker.listen(0, '127.0.0.1', () => {
      const address = blocker.address()
      resolve(typeof address === 'object' && address ? address.port : 0)
    })
  })
}

afterEach(async () => {
  await Promise.all(open.splice(0).map((s) => new Promise((r) => s.close(r))))
})

describe('listenWithFallback', () => {
  it('moves to a later port when the wanted one is taken', async () => {
    const taken = await occupy()
    const { server, port } = await listenWithFallback(() => createServer(), taken)
    open.push(server)
    expect(port).toBeGreaterThan(taken)
  })

  it('gives up with EADDRINUSE after the last try', async () => {
    const taken = await occupy()
    await expect(listenWithFallback(() => createServer(), taken, '127.0.0.1', 1)).rejects.toMatchObject({ code: 'EADDRINUSE' })
  })
})
