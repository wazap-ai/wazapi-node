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

  /**
   * True when the send was refused by a compliance gate (opt-out, frequency
   * cap, marketing policy, channel/template quality pause) rather than by a
   * malformed request. Retrying without changing the audience will not help —
   * fix the recipient list or the account policy instead.
   */
  get isComplianceBlocked(): boolean {
    return [
      'marketing_sends_disabled',
      'template_sends_disabled',
      'recipient_opted_out',
      'recipient_marketing_limit_reached',
      'duplicate_template_send',
      'template_frequency_cap_exceeded',
      'company_daily_marketing_cap_exceeded',
      'channel_marketing_paused',
      'template_quality_blocked',
    ].includes(this.code)
  }
}
