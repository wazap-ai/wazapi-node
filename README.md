# @wazapi/sdk

Official Node.js SDK for the [Wazapi](https://wazapi.io) Public API v1 — a
server-to-server client for sending WhatsApp messages, triggering flows, and
managing contacts, templates and the store (products and orders).

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
// company's WhatsApp channel (works when only one channel is connected).
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

Media is sent by public `link` (Meta downloads it on delivery) or, since API
1.10, by `media_uuid` — the ID of a file in the dashboard's Files library:
`header: { type: 'image', media_uuid: '5f0c2b1e-…' }`. An unknown ID answers
`media_not_found`; a file of the wrong type or size, `media_invalid`.

Quick reply buttons take an optional `payload`
(`{ index: 2, payload: 'confirm_1847' }`). When the recipient taps it, the
`message.received` webhook arrives with `type: 'interactive'` and
`content.reply.id` equal to your payload. A missing or
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

Error messages are always in English (API 1.7) and are meant for logs and
humans; branch on `err.code`, which is stable.

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
const contact = await wazapi.upsertContactByExternalId('customer-1847', {
  phone: '+5511999998888',
  name: 'Maria Silva',
  custom_fields: { tier: 'gold' },
  // Lead attribution (API 1.18): built in, first touch — a key already set on
  // the contact (e.g. a Click-to-WhatsApp ad) is never overwritten
  tracking: { utm_source: 'google', utm_campaign: 'black-friday', gclid: 'Cj0KCQ...' },
})
contact.tracking // { utm_source: 'google', ... } — only the filled keys

// Block a contact (API 1.13, scope `contacts:block`): their messages are dropped
// and every send to them fails with `contact_blocked`
const blocked = await wazapi.blockContact(contact.uuid)
blocked.meta_blocked // false when Meta refused (only people who wrote in the last 24h)
await wazapi.unblockContact(contact.uuid)
```

## Store (API 1.6)

Products and orders of the company's Wazapi store. Product writes are
synchronous (no operation to poll); `updateStoreProduct` is a partial update.

```ts
const store = await wazapi.getStore()
const { data: products } = await wazapi.listStoreProducts({ limit: 50 })

const product = await wazapi.createStoreProduct({
  name: 'Camiseta básica',
  price_cents: 4990,
  image_urls: ['https://cdn.example.com/camiseta.jpg'],
})
await wazapi.updateStoreProduct(product.uuid, { promo_price_cents: 3990 })

// Bulk import; `import_handle` dedupes on re-import instead of duplicating
const batch = await wazapi.batchStoreProducts(products)

const { data: orders } = await wazapi.listStoreOrders({ status: 'novo' })
await wazapi.updateStoreOrderStatus(orders[0].uuid, 'confirmado')
```

New orders also arrive as the `order.created` webhook event, and every status
change as `order.status.updated` (API 1.19). The two are not ordered: upsert by
`order_uuid` and compare `updated_at`.

### CRM with your own ids (API 1.20–1.22)

Stages and opportunities take your system's `external_id`, and writes accept
`stage_external_id`, `contact_external_id` and `assigned_user_external_id`
instead of Wazapi uuids. Scopes: `crm:read` / `crm:write`.

```ts
await wazapi.createCrmOpportunity({
  group_uuid: boardUuid,
  contact_external_id: 'cli-42',
  stage_external_id: 'qualified',
  assigned_user_external_id: 'rep-9',
  title: 'Annual plan',
  value_cents: 120000,
  external_id: 'deal-7',
})

// Incremental sync: archived ones included, so deletions reach you too
const since = lastSyncStartedAt
const page = await wazapi.listCrmOpportunities({ updated_after: since, include_archived: true })
```

The `crm.opportunity.created`, `.updated`, `.stage_changed` and `.archived`
webhook events (API 1.22, opt-in per webhook) carry the opportunity as
`getCrmOpportunity` returns it. Skip the echo of your own API writes:

```ts
if (event.type.startsWith('crm.opportunity.') && 'origin' in event.data) {
  if (event.data.origin === 'api' && event.data.origin_integration_uuid === myIntegrationUuid) return
}
```

### Recording a sale from your system (API 1.19)

`createStoreOrder` needs the `store:orders` scope, which `store:write` does not
grant: the order runs the store automation, so the buyer may receive WhatsApp
messages. Prices come from the catalog and stock is reserved. Pass your own
order id as the idempotency key so a retry never creates a second order.

```ts
const { data: shipping } = await wazapi.listStoreShippingOptions()
const { order, replayed } = await wazapi.createStoreOrder(
  {
    customer_name: 'Maria Souza',
    customer_phone: '+5511999990000',
    items: [{ product_uuid: product.uuid, quantity: 2 }],
    shipping_option_uuid: shipping[0]?.uuid,
    payment_method: 'pix',
    mark_paid: true,
  },
  'erp-order-1847'
)
// order.source === 'api', order.currency === 'BRL'

// Incremental sync of everything that changed since the last run
const changed = await wazapi.listStoreOrders({ updated_after: lastSync })
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
    case 'message.transcribed':
      // Audio transcript, when the company has transcription on
      return attachTranscript(event.data.message_uuid, event.data.transcript)
    case 'conversation.created':
    case 'conversation.updated':
      return syncConversation(event.data)
    case 'flow.execution.updated':
      return event.data.error ? alert(event.data.error.code) : done()
    case 'order.created':
      return createOrder(event.data)
    case 'webhook.test':
      return
  }
}
```

Verify the signature over the **raw** body, before parsing:

```ts
import { verifyWebhookSignature } from '@wazapi/sdk'

if (!verifyWebhookSignature(rawBody, headers, webhookSecret)) {
  throw new Error('Invalid webhook signature or timestamp')
}
```

API 1.8 sends comma-separated `v1` signatures during the 24-hour secret rotation window. The verifier accepts either secret and rejects timestamps more than five minutes old or in the future. Upgrade the verifier before rotating secrets.

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
- `listContacts(params)` (filters `query`, `email`, `phone`), `getContact(uuid)`, `createContact(input)`, `updateContact(uuid, input)`, `blockContact(uuid)`, `unblockContact(uuid)`, `upsertContactByExternalId(externalId, input)`
- `listTemplates(params)`, `getTemplate(name)`
- `listFlows(params)`, `getFlow(uuid)`, `executeFlow(flowUuid, input, idempotencyKey?)`
- `listConversations(params)`, `getConversation(uuid)`, `listMessages(conversationUuid, params)`
- `sendMessage(input, idempotencyKey?)`, `sendText(...)`, `sendTemplate(...)`
- `getStore()`, `listStoreProducts(params)`, `getStoreProduct(uuid)`, `createStoreProduct(input)`, `updateStoreProduct(uuid, patch)`, `deleteStoreProduct(uuid)`, `batchStoreProducts(products)`, `listStoreCategories()`
- `listStoreOrders(params)` (filters `status`, `source`, `payment_method`, `query`, `updated_after`), `getStoreOrder(uuid)`, `updateStoreOrderStatus(uuid, status)`, `createStoreOrder(input, idempotencyKey?)`, `listStoreShippingOptions()` (API 1.19)
- `listCrmStages(params?)` (filters `group_uuid`, `external_id`), `createCrmStage(input)`, `updateCrmStage(uuid, patch)` (API 1.20), `deleteCrmStage(uuid, replacementStageUuid?)`, `reorderCrmStages(groupUuid, stageUuids)` (API 1.21) — scopes `crm:read` / `crm:write`
- `listCrmOpportunities(params)` (filters `group_uuid`, `stage_uuid`, `contact_uuid`, `contact_external_id`, `external_id`; sync with `updated_after` + `include_archived`), `getCrmOpportunity(uuid)`, `createCrmOpportunity(input)`, `updateCrmOpportunity(uuid, patch)` (moves with `stage_uuid`/`stage_external_id`), `archiveCrmOpportunity(uuid)` — opportunities with your system's `external_id`, assignee by `assigned_user_external_id` or `assigned_user_email` (API 1.21)
- `getOperation(uuid)`, `waitForOperation(uuid, options?)`
- `listStoreProducts(params)` (filter `external_id`, API 1.14; `category_uuid` and `active`, API 1.19), `getStoreProduct(uuid)`, `createStoreProduct(input)`, `updateStoreProduct(uuid, input)`, `deleteStoreProduct(uuid)`, `batchStoreProducts(items)` (matches by `import_handle`, else by `external_id` since API 1.16), `listStoreCategories(params?)`, `createStoreCategory(input)`, `updateStoreCategory(uuid, input)`, `deleteStoreCategory(uuid)` (API 1.15), `listStoreOrders(params)`

See the OpenAPI contract at `https://wazapi.io/api/openapi/v1.json` for the full
schema.

### Coupons and AI discount policies (API 1.17)

`listStoreCoupons`, `createStoreCoupon`, `updateStoreCoupon`, `getAgentDiscountPolicy` and
`saveAgentDiscountPolicy` use the API's camelCase financial contract. Coupon writes require
`store:coupons`; policy writes require `store:discounts`. The token creator must still have
the matching company financial permission. Existing generic store access does not authorize
these writes.

```ts
await wazapi.createStoreCoupon({
  code: 'WELCOME5', name: 'Welcome', status: 'draft',
  rules: { kind: 'percent', value: 500, maxDiscountCents: 1000 },
})
```

Percent values are basis points (500 = 5%); fixed amounts and caps are cents. Use the current
version when updating a coupon or policy (version 0 creates a policy). Archive coupons rather
than deleting them. Orders expose immutable `discount_cents` and `discount`; item `net_cents`
is the amount after its allocated discount. A reserved use counts toward coupon limits;
confirmed payment consumes it. Refunds do not automatically restore a use.

<<<<<<< HEAD
### Team reply (API 1.29 draft)

`getInboxResponseSettings()` and `updateInboxResponseSettings({unansweredMode: "team_reply"})` expose the inbox mode. `recalculateTeamReply({dryRun: true, limit: 100})` previews one page; follow `nextCursor`. Apply requires explicit `dryRun: false` and the company in `team_reply`. Only the wait marker changes. Historical `unknown_preserved` rows retain their marker. Requires contacts:write and settings.general. This prerelease is unpublished.
### Library media with captions (API 1.31, draft)

Use client.sendMedia(channelUuidOrNull, phone, { media_uuid, caption? }, idempotencyKey?, replyToMessageUuid?). The file belongs to the token company library. WhatsApp image/video/document carry caption in the same message (up to 1024 characters). Audio rejects a nonempty caption; wait for the operation to succeed before sending text. The 24-hour window and blocked contacts are unchanged. This prerelease accompanies ORG-121; it must not be published before the matching app release.

## Automatic conversation summaries (draft API 1.29)

`getAiSummarySettings()`, `updateAiSummarySettings(patch)` and `getAiSummaryCosts()` use
`ai_summaries:read` / `ai_summaries:write`. Defaults remain disabled. Enabling is an
explicit opt-in to internal notes, model charges and `conversation.ai_summary` events.
The event is typed as `ConversationAiSummaryEvent` in the webhook union. Deduplicate
by event id; an absent `opportunity.external_id` must not be guessed from the contact.
Amounts are USD millionths, not cents. An unconfirmed provider outcome has a null
cost and retains its reservation. This prerelease is a draft; do not publish it
before the matching app contract is reviewed and deployed.
=======
### Company response settings (API 1.31)

`getInboxResponseSettings()` reads the company's `unansweredMode` and optional
`overdueMinutes` (integer, 1–10080). `updateInboxResponseSettings(input)` updates
them using the existing settings permissions. Omit `overdueMinutes` to preserve
the stored value; pass `null` to disable the company fallback. A group's wait
alert, then its enabled inactivity deadline, take precedence. Overdue
conversations remain within unanswered, using the selected mode's clock.

```ts
await client.updateInboxResponseSettings({ unansweredMode: 'team_reply', overdueMinutes: 15 })
const settings = await client.getInboxResponseSettings()
await client.updateInboxResponseSettings({ unansweredMode: settings.unansweredMode, overdueMinutes: null })
```
>>>>>>> 122c143 (feat: add inbox response settings and overdue threshold SDK)
