import { createHmac, timingSafeEqual } from 'node:crypto'

/** Verify the exact body before parsing JSON. Accept any signature during secret rotation. */
export function verifyWebhookSignature(
  rawBody: string | Uint8Array,
  headers: Record<string, string | undefined>,
  secret: string,
  options: { toleranceSeconds?: number; now?: number } = {}
): boolean {
  const normalized = Object.fromEntries(Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value]))
  const timestamp = normalized['wazapi-timestamp'] ?? ''
  const now = options.now ?? Date.now() / 1000
  const tolerance = options.toleranceSeconds ?? 300
  if (!secret || !/^\d+$/.test(timestamp) || !Number.isFinite(now) || !Number.isFinite(tolerance) || tolerance < 0 || Math.abs(now - Number(timestamp)) > tolerance) return false
  const expected = createHmac('sha256', secret).update(`${timestamp}.`).update(rawBody).digest()
  const signatures = (normalized['wazapi-signature'] ?? '').split(',')
  return signatures.some((part) => {
    const match = /^v1=([a-f0-9]{64})$/.exec(part.trim())
    return match ? timingSafeEqual(expected, Buffer.from(match[1], 'hex')) : false
  })
}
