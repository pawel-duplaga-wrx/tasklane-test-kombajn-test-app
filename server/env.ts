import { existsSync } from 'node:fs'
import path from 'node:path'

/** Loads `.env` from `dir` if there is one. Variables already set in the shell win. */
export function loadDotEnv(dir: string): void {
  const file = path.join(dir, '.env')
  if (existsSync(file)) process.loadEnvFile(file)
}
