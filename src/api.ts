import type { ApiErrorBody } from '../shared/types.ts'
import { emit } from './events.ts'

export class ApiError extends Error {
  status: number
  fields: Record<string, string>
  retryAfter: number | undefined

  constructor(status: number, message: string, fields: Record<string, string> = {}, retryAfter?: number) {
    super(message)
    this.status = status
    this.fields = fields
    this.retryAfter = retryAfter
  }
}

export function toApiError(err: unknown): ApiError {
  if (err instanceof ApiError) return err
  return new ApiError(0, err instanceof Error ? err.message : String(err))
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'
  body?: unknown
  signal?: AbortSignal
}

export async function api<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, signal } = options
  let res: Response
  try {
    res = await fetch(`/api${path}`, {
      method,
      signal,
      credentials: 'same-origin',
      headers: body === undefined ? undefined : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch (err) {
    if (signal?.aborted) throw err
    throw new ApiError(0, "Can't reach Tasklane. Check your connection and try again.")
  }
  let data: unknown = null
  try {
    data = await res.json()
  } catch {
    data = null
  }
  if (!res.ok) {
    const b = (data ?? {}) as Partial<ApiErrorBody>
    if (res.status === 401 && !path.startsWith('/auth/')) emit('session-expired')
    throw new ApiError(res.status, b.error ?? `Request failed (${res.status}).`, b.fields ?? {}, b.retryAfter)
  }
  return data as T
}

/** Builds `?a=1&b=2` from the non-empty values. */
export function qs(params: Record<string, string | number | null | undefined>): string {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== null && value !== undefined && value !== '') search.set(key, String(value))
  }
  const s = search.toString()
  return s ? `?${s}` : ''
}
