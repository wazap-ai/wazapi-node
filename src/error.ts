/**
 * Error thrown for any non-2xx response from the Wazapi API. Carries the stable
 * error envelope (`code`, `message`, `request_id`) so callers can branch on
 * `error.code` — e.g. `template_parameter_count_mismatch` — and quote `request_id`
 * to support.
 */
export class WazapiError extends Error {
  readonly status: number
  readonly code: string
  readonly requestId: string | null
  readonly details: unknown
  /** Value of the `Retry-After` header on a 429, in seconds, when present. */
  readonly retryAfter: number | null

  constructor(input: {
    status: number
    code: string
    message: string
    requestId?: string | null
    details?: unknown
    retryAfter?: number | null
  }) {
    super(input.message)
    this.name = 'WazapiError'
    this.status = input.status
    this.code = input.code
    this.requestId = input.requestId ?? null
    this.details = input.details ?? null
    this.retryAfter = input.retryAfter ?? null
  }

  /** True for 429 rate-limit responses. */
  get isRateLimited(): boolean {
    return this.status === 429
  }
}
