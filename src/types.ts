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
  /**
   * When the company blocked this contact, or `null` (API 1.13). A blocked
   * contact's messages and calls are dropped, and every send to them fails
   * with `contact_blocked`.
   */
  blocked_at: string | null
  /**
   * True when the block is also active on Meta for WhatsApp. Meta only accepts
   * someone who wrote in the last 24h; otherwise the block is Wazapi-only and
   * this stays false. True with `blocked_at` null means Meta refused the
   * unblock — call `unblockContact` again.
   */
  meta_blocked: boolean
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

export interface TemplateButton {
  /** Use as `components.buttons[].index` when sending. */
  index: number
  type: 'QUICK_REPLY' | 'URL' | 'PHONE_NUMBER' | 'COPY_CODE'
  /** Button label; `null` for COPY_CODE. */
  text: string | null
  /** Field to send for this button, or `null` when it takes no value. */
  parameter: 'url_suffix' | 'coupon_code' | null
}

export interface TemplateVariables {
  body_parameter_count: number
  body_named_parameters: string[]
  header: { format: string; has_variable: boolean } | null
  has_dynamic_buttons: boolean
  /** API 1.9: every button in template order, with the value it takes at send time. */
  buttons: TemplateButton[]
}

/** Header value for a template send; `type` is `variables.header.format` lowercased. */
/**
 * Media comes from a public `link` or, since API 1.10, from a file in the
 * company's media library (`media_uuid`, shown under Files > file details).
 * Send exactly one of them.
 */
export type TemplateSendMedia = { link: string; media_uuid?: never } | { media_uuid: string; link?: never }

export type TemplateSendHeader =
  | { type: 'text'; text: string }
  | ({ type: 'image' | 'video' } & TemplateSendMedia)
  | ({ type: 'document'; filename?: string } & TemplateSendMedia)
  | { type: 'location'; latitude: number; longitude: number; name?: string; address?: string }

export type TemplateSendButton =
  | { index: number; url_suffix: string }
  | { index: number; coupon_code: string }
  /** API 1.10: QUICK_REPLY, optional. Comes back as `content.reply.id` on `message.received`. */
  | { index: number; payload: string }

/**
 * API 1.9: values a template needs at send time. A missing or extra header or
 * button answers `template_component_mismatch`.
 */
export interface TemplateSendComponents {
  header?: TemplateSendHeader
  /** Body `{{1}}..{{n}}` values, in order. Do not also send `parameters`. */
  body?: string[]
  buttons?: TemplateSendButton[]
}

export interface TemplateSendContent {
  name: string
  language?: string
  /** Shortcut for `components.body`. */
  parameters?: string[]
  components?: TemplateSendComponents
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
  /**
   * When the contact (or the business, from the WhatsApp Business app) deleted
   * the message. `content` is then empty apart from `deleted` (API 1.5).
   */
  deleted_at: string | null
  deleted_by: MessageDeletedBy | null
  /** When the text or caption was last edited; `content` holds the current value (API 1.5). */
  edited_at: string | null
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
  | 'contact_blocked'
  | 'recipient_marketing_limit_reached'
  | 'duplicate_template_send'
  | 'template_frequency_cap_exceeded'
  | 'company_daily_marketing_cap_exceeded'
  | 'channel_marketing_paused'
  | 'template_quality_blocked'
  | 'send_pacing_timeout'

/**
 * `result` of a succeeded `message.send` operation. `text` (API 1.3) is the
 * message as it reached the contact, with the template body interpolated —
 * `null` when there is no text body.
 */
export interface MessageSendResult {
  status: string
  message_uuid: string
  conversation_uuid: string
  contact_uuid: string
  text: string | null
}

export interface Operation {
  uuid: string
  type: 'message.send' | 'flow.execute'
  status: OperationStatus
  result: Record<string, unknown> | null
  /** `message` is always English since API 1.7; branch on `code`. */
  error: { code: string; message: string | null } | null
  created_at: string | null
  started_at: string | null
  completed_at: string | null
}

export interface Recipient {
  phone: string
  external_id?: string
}

/**
 * `channel_uuid` is optional since API 1.1: when the company has a single
 * WhatsApp channel (or a single connected one) the API resolves it from the
 * token. With several connected channels the request fails synchronously with
 * `422 channel_required` — discover the value with `listChannels()`.
 */
export type SendMessageInput =
  | {
      channel_uuid?: string
      recipient: Recipient
      type: 'text'
      content: { text: string }
    }
  | {
      channel_uuid?: string
      recipient: Recipient
      type: 'template'
      content: TemplateSendContent
    }

export interface ExecuteFlowInput {
  /** Optional with a single channel — see `SendMessageInput`. */
  channel_uuid?: string
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

export interface StoreProductListParams extends ListParams {
  /** Exact match on the product's `external_id` — look a product up by your own id. (API 1.14) */
  external_id?: string
}

/** `GET /contacts` filters. `email` is exact and case-insensitive; `phone` accepts any format and matches a Brazilian mobile with or without the ninth digit (API 1.11). */
export interface ListContactsParams extends ListParams {
  email?: string
  phone?: string
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
  /** Absolute public storefront URL (relative path before API 1.6). */
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
  /**
   * The product's id in your own platform (ERP, e-commerce), for a two-way
   * link. Unique per store when set. (API 1.14)
   */
  external_id: string | null
  variants: StoreProductVariant[]
  created_at: string | null
  updated_at: string | null
}

export interface StoreProductWrite {
  name: string
  description?: string | null
  category_uuid?: string | null
  /**
   * Alternative to `category_uuid`: the category by the `external_id` you gave
   * it. An unknown id fails with `422 category_not_found`; `null` removes the
   * category. (API 1.15)
   */
  category_external_id?: string | null
  price_cents: number
  promo_price_cents?: number | null
  highlighted?: boolean
  track_stock?: boolean
  stock?: number | null
  active?: boolean
  position?: number
  import_handle?: string | null
  /**
   * Your platform's id for this product (up to 120 characters). Must be unique
   * in the store, otherwise `422 external_id_taken`; `null` clears it. (API 1.14)
   */
  external_id?: string | null
  /**
   * Up to 4 public http(s) URLs of JPEG, PNG or WebP images (5 MB each). Wazapi
   * downloads and re-hosts them; the first one is the cover. Omit to keep the
   * current images, `[]` removes them all. A URL that cannot be downloaded as a
   * public image fails the request with `product_image_invalid`. On the batch
   * endpoint the download runs in the background. (API 1.6)
   */
  image_urls?: string[]
  /**
   * When sent on update, the variant list replaces the existing one: variants
   * whose `uuid` is present are kept/updated, the rest are deleted. Omit to
   * leave variants untouched.
   */
  variants?: {
    uuid?: string | null
    label: string
    price_cents?: number | null
    stock?: number | null
    active?: boolean
  }[]
}

/**
 * Partial update (API 1.6): an omitted field keeps its current value, `null`
 * clears a nullable one.
 */
export type StoreProductPatch = Partial<StoreProductWrite>

export interface StoreCategory {
  uuid: string
  name: string
  position: number
  /** The category's id in your own platform. Unique per store when set. (API 1.15) */
  external_id: string | null
}

export interface StoreCategoryWrite {
  name: string
  /**
   * Your platform's id for this category (up to 120 characters). Unique in the
   * store, otherwise `422 category_external_id_taken`; `null` clears it.
   */
  external_id?: string | null
  /** Sort order on the storefront (lower first). Defaults to 0. */
  position?: number
}

export type StoreCategoryPatch = Partial<StoreCategoryWrite>

export type StoreOrderStatus = 'novo' | 'confirmado' | 'pago' | 'entregue' | 'cancelado'

export interface StoreOrderItem {
  product_uuid: string
  /**
   * The product's `external_id` at the time of the order (snapshot). `null`
   * when the product had none or the order predates API 1.16.
   */
  product_external_id: string | null
  name: string
  variant_label: string | null
  quantity: number
  unit_price_cents: number
  total_cents: number
}

export type StoreOrderSource = 'storefront' | 'whatsapp_catalog'

export interface StoreOrder {
  uuid: string
  /** Short human reference (first 8 chars of the uuid) shown to the customer. */
  ref: string
  status: StoreOrderStatus
  /** Where the order was placed: storefront checkout or the native WhatsApp catalog. */
  source: StoreOrderSource
  /** Provider-side id for orders that originated outside the storefront (WhatsApp catalog order message id). */
  provider_order_id: string | null
  /**
   * Allowlisted attribution subset stamped at creation (utm_*, click IDs incl.
   * ctwa_clid, ad referral fields). Conversation values win over contact values
   * (last touch over first touch). Null when the order has no attributable source.
   */
  tracking: Record<string, unknown> | null
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
  /** `catalog` = order from the native WhatsApp catalog (payment arranged in chat). */
  payment_method: 'pix' | 'link' | 'on_delivery' | 'catalog'
  notes: string | null
  created_at: string | null
  updated_at: string | null
}

export type StoreBatchResultItem =
  | {
      index: number
      status: 'created' | 'updated'
      uuid: string
      /**
       * Present when the item carried `image_urls`: `queued` = downloading in the
       * background; `not_queued` = product saved, resend the item for the images.
       */
      images?: 'queued' | 'not_queued'
    }
  | { index: number; status: 'error'; error: { code: string; message: string } }

export interface StoreBatchResult {
  data: StoreBatchResultItem[]
  meta: { created: number; updated: number; failed: number }
}

/* ── Webhooks ───────────────────────────────────────────────────────────── */

export type WebhookEventType =
  | 'message.received'
  | 'message.status.updated'
  | 'message.transcribed'
  | 'message.updated'
  | 'message.deleted'
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
/**
 * Delivery failure as reported by the messaging provider (Meta error codes for
 * WhatsApp — 131042 payment issue, 131050 recipient opted out, 131047
 * re-engagement required...). Every field can be null when the provider omits it.
 */
export interface MessageDeliveryError {
  code: number | null
  title: string | null
  message: string | null
  details: string | null
}

export interface MessageStatusUpdatedData {
  message_uuid: string
  status: string
  provider_message_id?: string | null
  operation_uuid?: string
  conversation_uuid?: string
  /** Present only when `status` is `failed` (API 1.2); null when the provider gave no reason. */
  error?: MessageDeliveryError | null
  tracking?: WebhookTracking
}

/** An inbound audio message was transcribed (company with an OpenAI key and transcription on). */
export interface MessageTranscribedData {
  message_uuid: string
  conversation_uuid: string
  transcript: string
  language: string | null
  tracking?: WebhookTracking
}

/** `business_app` = deleted from the WhatsApp Business app on the business phone (coexistence). */
export type MessageDeletedBy = 'contact' | 'business_app'

interface MessageMutationRefs extends WebhookContactRefs {
  message_uuid: string
  conversation_uuid: string
  contact_uuid: string | null
  channel_uuid: string
  /** `outbound` when the business edited or deleted from the WhatsApp Business app. */
  direction: 'inbound' | 'outbound'
  /** Original message type, kept after deletion. */
  type: string
}

/**
 * A message was edited after it was sent (API 1.5, opt-in). Only the edited
 * field comes, with its new value — the previous one went out in
 * `message.received`. Sources: WhatsApp `edit` (coexistence) and Messenger.
 */
export interface MessageUpdatedData extends MessageMutationRefs {
  text?: string
  caption?: string
  edited_at: string
}

/**
 * A message was deleted after it was sent (API 1.5, opt-in). Never carries
 * content. An Instagram message with several attachments emits one event per
 * `message_uuid`. Sources: WhatsApp `revoke` (coexistence) and Instagram.
 */
export interface MessageDeletedData extends MessageMutationRefs {
  deleted_at: string
  deleted_by: MessageDeletedBy
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

/** A store order was created — storefront checkout or native WhatsApp catalog. */
export interface OrderCreatedData extends WebhookContactRefs {
  order_uuid: string
  ref: string
  status: string
  source: StoreOrderSource
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
export type MessageTranscribedEvent = WebhookEnvelope<
  'message.transcribed',
  MessageTranscribedData
>
export type MessageUpdatedEvent = WebhookEnvelope<'message.updated', MessageUpdatedData>
export type MessageDeletedEvent = WebhookEnvelope<'message.deleted', MessageDeletedData>
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
  | MessageTranscribedEvent
  | MessageUpdatedEvent
  | MessageDeletedEvent
  | ConversationCreatedEvent
  | ConversationUpdatedEvent
  | FlowExecutionUpdatedEvent
  | OrderCreatedEvent
  | WebhookTestEvent
