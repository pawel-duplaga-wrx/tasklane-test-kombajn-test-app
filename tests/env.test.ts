import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { loadDotEnv } from '../server/env.ts'

const dirs: string[] = []

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
  delete process.env.TL_TEST_BUGS
  delete process.env.TL_TEST_LATENCY
})

function dirWithEnv(content: string): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'tasklane-env-'))
  dirs.push(dir)
  writeFileSync(path.join(dir, '.env'), content)
  return dir
}

describe('loadDotEnv', () => {
  it('reads .env, including quoted values', () => {
    loadDotEnv(dirWithEnv("TL_TEST_BUGS='all'\nTL_TEST_LATENCY=0\n"))
    expect(process.env.TL_TEST_BUGS).toBe('all')
    expect(process.env.TL_TEST_LATENCY).toBe('0')
  })

  it('keeps a value already set in the shell', () => {
    process.env.TL_TEST_BUGS = 'visual'
    loadDotEnv(dirWithEnv('TL_TEST_BUGS=all\n'))
    expect(process.env.TL_TEST_BUGS).toBe('visual')
  })

  it('does nothing when there is no .env', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'tasklane-env-'))
    dirs.push(dir)
    expect(() => loadDotEnv(dir)).not.toThrow()
  })
})
