// Types mirror the Wazapi Public API v1 OpenAPI contract
// (openapi/public-api.v1.json). Keep in sync when the contract changes.

export type PublicApiScope =
  | 'channels:read'
  | 'contacts:read'
  | 'contacts:write'
  | 'conversations:read'
  | 'messages:read'
  | 'messages:write'
  | 'templates:read'
  | 'flows:read'
  | 'flows:execute'
  | 'operations:read'
  | 'store:read'
  | 'store:write'

export interface PaginationMeta {
  next_cursor: string | null
}

export interface Paginated<T> {
  data: T[]
  meta: PaginationMeta
}

export interface Envelope<T> {
  data: T
}

export interface ChannelCapabilities {
  send_text: boolean
  send_template: boolean
  start_flow: boolean
}

export interface Channel {
  uuid: string
  provider: 'whatsapp'
  display_name: string | null
  phone_number: string | null
  status: string
  capabilities: ChannelCapabilities
}

export interface Contact {
  uuid: string
  external_id: string | null
  phone: string | null
  name: string | null
  email: string | null
  tags: string[]
  custom_fields: Record<string, unknown>
  /**
   * True when the contact opted out of marketing messages (reply keyword such
   * as PARAR/STOP, the native WhatsApp control, or manual suppression).
   * Sending a MARKETING template to an opted-out contact fails with
   * `recipient_opted_out` — filter your audience on this before a campaign.
   */
  marketing_opted_out: boolean
  marketing_opt_out_at: string | null
  last_interaction_at: string | null
  created_at: string | null
  updated_at: string | null
}

export interface ContactWrite {
  name?: string | null
  email?: string | null
  tags?: string[]
  custom_fields?: Record<string, unknown>
}

export interface Flow {
  uuid: string
  name: string
  status: 'draft' | 'active'
  supported_providers: string[]
  created_at: string | null
  updated_at: string | null
}

export type TemplateStatus =
  | 'APPROVED'
  | 'PENDING'
  | 'REJECTED'
  | 'PAUSED'
  | 'DISABLED'
  | 'IN_APPEAL'
  | 'DRAFT'

export type TemplateCategory = 'AUTHENTICATION' | 'MARKETING' | 'UTILITY'

export interface TemplateVariables {
  body_parameter_count: number
  body_named_parameters: string[]
  header: { format: string; has_variable: boolean } | null
  has_dynamic_buttons: boolean
}

export interface Template {
  uuid: string
  name: string
  language: string
  status: TemplateStatus
  category: TemplateCategory
  channel_uuid: string | null
  variables: TemplateVariables
  created_at: string | null
  updated_at: string | null
}

export interface Conversation {
  uuid: string
  status: string
  channel_uuid: string | null
  contact: Contact | null
  unread_count: number
  last_message_at: string | null
  created_at: string | null
  updated_at: string | null
}

/**
 * `GET /conversations/{uuid}` — everything about the chat in one call: contact
 * (with tags), assigned agent and group, channel, status and counters. Pass
 * `include: 'messages'` to embed the first page of messages.
 */
export interface ConversationDetail extends Conversation {
  channel_provider: string | null
  assigned_agent: { uuid: string; name: string | null } | null
  assigned_group: { uuid: string; name: string } | null
  message_count: number
  /** Present only when requested with `include: 'messages'`. */
  messages?: Message[]
}

export interface Message {
  uuid: string
  direction: 'inbound' | 'outbound'
  type: string
  status: string
  content: Record<string, unknown>
  /**
   * Transcription of an inbound audio message, when available. Populated
   * asynchronously after transcription; also delivered via the
   * `message.transcribed` webhook. `null` for non-audio messages and audios
   * not yet transcribed.
   */
  transcript: string | null
  provider_message_id: string | null
  created_at: string | null
  updated_at: string | null
}

export type OperationStatus =
  | 'queued'
  | 'processing'
  | 'waiting'
  | 'succeeded'
  | 'failed'

/**
 * Compliance codes the send guard can answer with. They surface both as a
 * synchronous 4xx on `POST /messages` (403 for the two `*_disabled` codes,
 * 422 for the rest) and as `error.code` on the polled operation —
 * `send_pacing_timeout` only ever appears on the operation.
 */
export type SendComplianceErrorCode =
  | 'marketing_sends_disabled'
  | 'template_sends_disabled'
  | 'recipient_opted_out'
  | 'duplicate_template_send'
  | 'template_frequency_cap_exceeded'
  | 'company_daily_marketing_cap_exceeded'
  | 'channel_marketing_paused'
  | 'template_quality_blocked'
  | 'send_pacing_timeout'

export interface Operation {
  uuid: string
  type: 'message.send' | 'flow.execute'
  status: OperationStatus
  result: Record<string, unknown> | null
  error: { code: string; message: string | null } | null
  created_at: string | null
  started_at: string | null
  completed_at: string | null
}

export interface Recipient {
  phone: string
  external_id?: string
}

export type SendMessageInput =
  | {
      channel_uuid: string
      recipient: Recipient
      type: 'text'
      content: { text: string }
    }
  | {
      channel_uuid: string
      recipient: Recipient
      type: 'template'
      content: { name: string; language?: string; parameters?: string[] }
    }

export interface ExecuteFlowInput {
  channel_uuid: string
  recipient: Recipient
  variables?: Record<string, unknown>
}

export interface ListParams {
  after?: string
  limit?: number
  query?: string
  status?: string
  channel_uuid?: string
  updated_after?: string
}

export interface AcceptedResult {
  operation: Operation
  /** True when the request replayed a previously accepted idempotent operation. */
  replayed: boolean
}

/* ── Store ──────────────────────────────────────────────────────────────── */

export interface StoreSummary {
  enabled: boolean
  mode: 'links_only' | 'store_only' | 'both' | null
  slug: string | null
  /** Public storefront path (relative, e.g. `/loja/minha-loja`). */
  url: string | null
  product_count: number
  order_count: number
}

export interface StoreProductVariant {
  uuid: string
  label: string
  price_cents: number | null
  stock: number | null
  active: boolean
  position: number
}

export interface StoreProduct {
  uuid: string
  name: string
  description: string | null
  category_uuid: string | null
  price_cents: number
  promo_price_cents: number | null
  effective_price_cents: number
  images: string[]
  highlighted: boolean
  track_stock: boolean
  stock: number | null
  active: boolean
  position: number
  /**
   * External catalog handle (e.g. Shopify Handle). Products sharing the same
   * handle are updated on re-import/batch instead of duplicated.
   */
  import_handle: string | null
  variants: StoreProductVariant[]
  created_at: string | null
  updated_at: string | null
}

export interface StoreProductWrite {
  name: string
  description?: string | null
  category_uuid?: string | null
  price_cents: number
  promo_price_cents?: number | null
  highlighted?: boolean
  track_stock?: boolean
  stock?: number | null
  active?: boolean
  position?: number
  import_handle?: string | null
  /**
   * On update the variant list replaces the existing one: variants whose `uuid`
   * is present are kept/updated, the rest are deleted.
   */
  variants?: {
    uuid?: string | null
    label: string
    price_cents?: number | null
    stock?: number | null
    active?: boolean
  }[]
}

export type StoreOrderStatus = 'novo' | 'confirmado' | 'pago' | 'entregue' | 'cancelado'

export interface StoreOrderItem {
  product_uuid: string
  name: string
  variant_label: string | null
  quantity: number
  unit_price_cents: number
  total_cents: number
}

export interface StoreOrder {
  uuid: string
  /** Short human reference (first 8 chars of the uuid) shown to the customer. */
  ref: string
  status: StoreOrderStatus
  customer_name: string
  customer_phone: string
  contact_uuid: string | null
  /** Inbox conversation opened by the order automation, when available. */
  conversation_uuid: string | null
  items: StoreOrderItem[]
  subtotal_cents: number
  shipping_name: string | null
  shipping_cents: number
  total_cents: number
  payment_method: 'pix' | 'link' | 'on_delivery'
  notes: string | null
  created_at: string | null
  updated_at: string | null
}

export type StoreBatchResultItem =
  | { index: number; status: 'created' | 'updated'; uuid: string }
  | { index: number; status: 'error'; error: { code: string; message: string } }

export interface StoreBatchResult {
  data: StoreBatchResultItem[]
  meta: { created: number; updated: number; failed: number }
}

/* ── Webhooks ───────────────────────────────────────────────────────────── */

export type WebhookEventType =
  | 'message.received'
  | 'message.status.updated'
  | 'conversation.created'
  | 'conversation.updated'
  | 'flow.execution.updated'
  | 'order.created'
  | 'webhook.test'

/**
 * Allowlisted attribution subset of the contact's and conversation's custom
 * fields. Conversation values win over contact values (last touch over first
 * touch); no other custom field key is ever forwarded.
 */
export type WebhookTracking = Record<string, unknown>

/**
 * Added at delivery time whenever the payload carries a `contact_uuid` and that
 * contact was linked through `PUT /contacts/external/{external_id}`.
 */
interface WebhookContactRefs {
  external_id?: string
  tracking?: WebhookTracking
}

export interface MessageReceivedData extends WebhookContactRefs {
  message_uuid: string
  conversation_uuid: string
  contact_uuid: string
  channel_uuid: string
  type: string
  content: Record<string, unknown>
  status: string
}

/**
 * `provider_message_id` comes from the provider status callback; `operation_uuid`
 * and `conversation_uuid` are present when the message was sent through the API.
 */
export interface MessageStatusUpdatedData {
  message_uuid: string
  status: string
  provider_message_id?: string | null
  operation_uuid?: string
  conversation_uuid?: string
  tracking?: WebhookTracking
}

export interface ConversationCreatedData extends WebhookContactRefs {
  conversation_uuid: string
  contact_uuid: string
  channel_uuid: string
  status: string
}

/** `unread_count` is only present when an inbound message triggered the update. */
export interface ConversationUpdatedData extends ConversationCreatedData {
  unread_count?: number
  last_message_at?: string | null
}

export interface FlowExecutionUpdatedData {
  operation_uuid: string
  operation_type: 'flow.execute'
  status: OperationStatus
  result: Record<string, unknown> | null
  error: { code: string; message: string | null } | null
}

/** A store order was created via the storefront checkout. */
export interface OrderCreatedData extends WebhookContactRefs {
  order_uuid: string
  ref: string
  status: string
  customer_name: string
  customer_phone: string
  contact_uuid: string | null
  items: StoreOrderItem[]
  subtotal_cents: number
  shipping_name: string | null
  shipping_cents: number
  total_cents: number
  payment_method: string
  notes: string | null
  created_at: string | null
}

export interface WebhookTestData {
  integration_uuid: string
  message: string
}

interface WebhookEnvelope<TType extends WebhookEventType, TData> {
  /** Unique event id. Delivery is at-least-once — deduplicate on this value. */
  id: string
  type: TType
  api_version: 'v1'
  occurred_at: string
  data: TData
}

export type MessageReceivedEvent = WebhookEnvelope<'message.received', MessageReceivedData>
export type MessageStatusUpdatedEvent = WebhookEnvelope<
  'message.status.updated',
  MessageStatusUpdatedData
>
export type ConversationCreatedEvent = WebhookEnvelope<
  'conversation.created',
  ConversationCreatedData
>
export type ConversationUpdatedEvent = WebhookEnvelope<
  'conversation.updated',
  ConversationUpdatedData
>
export type FlowExecutionUpdatedEvent = WebhookEnvelope<
  'flow.execution.updated',
  FlowExecutionUpdatedData
>
export type OrderCreatedEvent = WebhookEnvelope<'order.created', OrderCreatedData>
export type WebhookTestEvent = WebhookEnvelope<'webhook.test', WebhookTestData>

/** Discriminated on `type` — narrow it and `data` narrows with it. */
export type WazapiWebhookEvent =
  | MessageReceivedEvent
  | MessageStatusUpdatedEvent
  | ConversationCreatedEvent
  | ConversationUpdatedEvent
  | FlowExecutionUpdatedEvent
  | OrderCreatedEvent
  | WebhookTestEvent
