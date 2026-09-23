# @wazapi/sdk

Official Node.js SDK for the [Wazapi](https://wazapi.io) Public API v1 — a
server-to-server client for sending WhatsApp messages, triggering flows, and
managing contacts/templates.

- Zero runtime dependencies (uses the native `fetch` on Node 18+).
- Fully typed against the OpenAPI contract (`GET /api/openapi/v1.json`).
- Automatic `Idempotency-Key` generation for write operations.
- Built-in polling helper for asynchronous operations.

## Install

```bash
pnpm add @wazapi/sdk
```

## Quick start

```ts
import { WazapiClient } from '@wazapi/sdk'

const wazapi = new WazapiClient({ token: process.env.WAZAPI_API_TOKEN! })

// Fire a template and wait for the result. `null` = let the API pick the
// company's WhatsApp channel (it has one number per company).
const { operation } = await wazapi.sendTemplate(null, '+5511999998888', {
  name: 'order_confirmed',
  parameters: ['Maria', '1847'],
})
const final = await wazapi.waitForOperation(operation.uuid)
console.log(final.status) // 'succeeded' | 'failed'
```

### Channels

The token identifies the company; the channel is the WhatsApp number a send
goes out from. Since API 1.1 `channel_uuid` is optional: with a single channel
(or a single connected one) the API resolves it. With several connected
channels a send without it fails synchronously with `422 channel_required` —
discover the value and pass it explicitly:

```ts
const channels = await wazapi.listChannels()
const channel = channels.find((c) => c.capabilities.send_template)
if (!channel) throw new Error('No channel able to send templates')

await wazapi.sendTemplate(channel.uuid, '+5511999998888', { name: 'order_confirmed' })
```

The same `uuid` is shown with a copy button in the dashboard under
**Settings > API**.

## Sending a template (recommended flow)

Templates must be **APPROVED** and you must send exactly the number of body
parameters the template declares. Discover that shape first instead of guessing:

```ts
const template = await wazapi.getTemplate('order_confirmed')

// How many positional {{1}}..{{n}} the body expects:
const expected = template.variables.body_parameter_count

const { operation, replayed } = await wazapi.sendTemplate(
  channel.uuid,
  '+5511999998888',
  { name: template.name, language: template.language, parameters: ['Maria', '1847'] },
  // Optional: pass your own idempotency key (e.g. the order id) so retries
  // never send twice. Omit it and the SDK generates a UUID per call.
  'order-1847-confirmation'
)
```

### Header, media and buttons (API 1.9)

When `variables` asks for more than body values, send them in `components`.
`variables.header` tells you the header type; each entry of
`variables.buttons` with a non-null `parameter` needs a value under the same
`index`:

```ts
await wazapi.sendTemplate(null, '+5511999998888', {
  name: 'order_shipped',
  language: 'pt_BR',
  components: {
    // type = variables.header.format lowercased: text | image | video | document | location
    header: { type: 'image', link: 'https://store.example.com/p/1847.jpg' },
    body: ['Maria', '1847'], // same as `parameters` — send one or the other
    buttons: [
      { index: 0, url_suffix: 'tracking/1847' }, // URL button ending in {{1}}
      { index: 1, coupon_code: 'COMEBACK10' }, // copy-code button
    ],
  },
})
```

Media is sent by public `link`; Meta downloads it on delivery. A missing or
extra header or button answers `template_component_mismatch`. Templates whose
body uses named `{{name}}` placeholders are not sendable yet
(`template_format_unsupported`).

The send is asynchronous: the API returns `202 Accepted` with an operation you
poll (or receive via webhook). `waitForOperation` handles the polling:

```ts
const result = await wazapi.waitForOperation(operation.uuid, {
  intervalMs: 1000,
  timeoutMs: 60_000,
})
if (result.status === 'failed') {
  console.error(result.error?.code, result.error?.message)
}
```

## Error handling

Every non-2xx response throws a `WazapiError` carrying the stable error envelope:

```ts
import { WazapiError } from '@wazapi/sdk'

try {
  await wazapi.sendTemplate(channel.uuid, '+5511999998888', {
    name: 'order_confirmed',
    parameters: ['Maria'], // wrong count
  })
} catch (err) {
  if (err instanceof WazapiError) {
    console.error(err.code) // 'template_parameter_count_mismatch'
    console.error(err.requestId) // quote this to support
    if (err.isRateLimited) console.error('retry after', err.retryAfter, 's')
  }
}
```

Common template send error codes (all rejected synchronously, before an
operation is created):

| Code                                | Meaning                                              |
| ----------------------------------- | ---------------------------------------------------- |
| `template_not_found`                | No APPROVED template with that name.                 |
| `template_language_unavailable`     | No approved version in the requested `language`.     |
| `template_parameter_count_mismatch` | `parameters.length` ≠ `body_parameter_count`.        |
| `template_component_mismatch`       | `components` does not match the template (missing/extra header or button). |
| `template_format_unsupported`       | Body uses named `{{name}}` placeholders.             |
| `channel_required`                  | `channel_uuid` omitted and the company has several connected channels. |
| `channel_not_found`                 | Unknown `channel_uuid`, or no WhatsApp channel connected.              |

Compliance gates on template sends (rejected synchronously with 403/422, and
re-checked by the worker — the same codes can appear as `error.code` on the
polled operation):

| Code                                    | Meaning                                                                  |
| --------------------------------------- | ------------------------------------------------------------------------ |
| `marketing_sends_disabled`              | MARKETING sending is off for the company (an owner enables it in the dashboard) or platform-wide. |
| `recipient_opted_out`                   | The recipient opted out (reply keyword, native WhatsApp control, or manual suppression). Filter on `contact.marketing_opted_out`. |
| `recipient_marketing_limit_reached`     | API 1.4: a previous MARKETING send to this phone failed with Meta error 131049 (per-user marketing limit, counted across all businesses) in the last 24h. Meta asks for 24h before retrying; see `details.retry_after_seconds`. UTILITY and AUTHENTICATION are not affected. |
| `duplicate_template_send`               | Same template already sent to this phone in the last 24h.                |
| `template_frequency_cap_exceeded`       | Per-contact MARKETING cap (1/24h, 3/7 days). Sends made while the recipient's 24h customer service window is open do not count (API 1.4). |
| `company_daily_marketing_cap_exceeded`  | Company-wide daily MARKETING cap.                                        |
| `channel_marketing_paused`              | Meta flagged the number's quality; MARKETING is paused temporarily.      |
| `template_quality_blocked`              | This specific template dropped to RED quality on Meta.                   |
| `send_pacing_timeout`                   | Operation-only: delivery was deferred by per-channel pacing for too long. |

Delivery is paced per channel to protect number quality, so an accepted `202`
can take longer to complete under load — poll the operation instead of
re-sending. AUTHENTICATION (OTP) templates are exempt from opt-outs and caps.
Use `error.isComplianceBlocked` to branch on this whole family, and the
`SendComplianceErrorCode` type to narrow `operation.error.code`.

## Contacts

```ts
// Upsert by your own system's id — idempotent, safe to call repeatedly
await wazapi.upsertContactByExternalId('customer-1847', {
  phone: '+5511999998888',
  name: 'Maria Silva',
  custom_fields: { tier: 'gold' },
})
```

## Webhooks

Wazapi POSTs events to the HTTPS endpoint you register in **Settings → Wazapi API**.
The SDK ships the payload types; the union is discriminated on `type`, so narrowing
`event.type` narrows `event.data` with it.

```ts
import type { WazapiWebhookEvent } from '@wazapi/sdk'

function handle(event: WazapiWebhookEvent) {
  switch (event.type) {
    case 'message.received':
      return reply(event.data.contact_uuid, event.data.content)
    case 'message.status.updated':
      // `error` carries the provider's reason on `failed` (API 1.2), e.g. Meta 131042
      return event.data.status === 'failed'
        ? markFailed(event.data.message_uuid, event.data.error?.code ?? null)
        : markDelivered(event.data.message_uuid, event.data.status)
    case 'message.updated':
      // Opt-in (API 1.5): only the edited field, with its new value
      return updateText(event.data.message_uuid, event.data.text ?? event.data.caption)
    case 'message.deleted':
      // Opt-in (API 1.5): never carries content — drop your copy
      return forget(event.data.message_uuid)
    case 'flow.execution.updated':
      return event.data.error ? alert(event.data.error.code) : done()
  }
}
```

Verify the signature over the **raw** body, before parsing:

```ts
import { createHmac, timingSafeEqual } from 'node:crypto'

function verify(rawBody: string, headers: Record<string, string>, secret: string) {
  const expected = createHmac('sha256', secret)
    .update(`${headers['wazapi-timestamp']}.${rawBody}`)
    .digest('hex')
  const received = (headers['wazapi-signature'] ?? '').replace(/^v1=/, '')
  const a = Buffer.from(expected)
  const b = Buffer.from(received)
  return a.length === b.length && timingSafeEqual(a, b)
}
```

Delivery is at-least-once — deduplicate on `event.id` (also sent as the
`Wazapi-Event-Id` header). Wazapi treats only `2xx` as success and retries after
1min, 5min, 30min, 2h, 12h and 24h.

Two fields are added at delivery time when they apply: `data.external_id`, your own
identifier echoed back when the contact was linked via `upsertContactByExternalId`,
and `data.tracking`, the allowlisted attribution subset (`utm_*`, click IDs, ad
referral fields). No other custom field key is ever forwarded.

## Configuration

```ts
new WazapiClient({
  token: 'waz_api_...',
  baseUrl: 'https://wazapi.io/api/v1', // default
  timeoutMs: 30_000, // per-request timeout
  idempotencyKeyFactory: () => myKey(), // default: crypto.randomUUID()
})
```

## API surface

- `listChannels()`
- `listContacts(params)`, `getContact(uuid)`, `updateContact(uuid, input)`, `upsertContactByExternalId(externalId, input)`
- `listTemplates(params)`, `getTemplate(name)`
- `listFlows(params)`, `getFlow(uuid)`, `executeFlow(flowUuid, input, idempotencyKey?)`
- `listConversations(params)`, `getConversation(uuid)`, `listMessages(conversationUuid, params)`
- `sendMessage(input, idempotencyKey?)`, `sendText(...)`, `sendTemplate(...)`
- `getOperation(uuid)`, `waitForOperation(uuid, options?)`

See the OpenAPI contract at `https://wazapi.io/api/openapi/v1.json` for the full
schema.
