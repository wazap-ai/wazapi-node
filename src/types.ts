// Types mirror the Wazapi Public API v1 OpenAPI contract
// (openapi/public-api.v1.json). Keep in sync when the contract changes.

export type PublicApiScope =
  | 'channels:read'
  | 'contacts:read'
  | 'contacts:write'
  | 'contacts:block'
  | 'conversations:read'
  | 'messages:read'
  | 'messages:write'
  | 'templates:read'
  | 'flows:read'
  | 'flows:execute'
  | 'operations:read'
  | 'store:read'
  | 'store:write'
  /** Create orders (API 1.19). Not granted by `store:write`: an order sends WhatsApp messages to the buyer. */
  | 'store:orders'
  | 'store:coupons'
  | 'store:discounts'
  /** List CRM stages (API 1.20). */
  | 'crm:read'
  /** Create and edit CRM stages (API 1.20). */
  | 'crm:write'

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
   * Lead attribution stored on the contact (API 1.18), first touch: utm_* keys,
   * click IDs and the Click-to-WhatsApp fields Wazapi captures. Only filled keys
   * come back. The same keys are also in `custom_fields`.
   */
  tracking: ContactTracking
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
  /**
   * Lead attribution (API 1.18). First touch: a key is written only when the
   * contact has no value for it yet, so the lead's origin is never overwritten
   * (send the key in `custom_fields` to correct it). Built in: no custom field
   * has to be created. Any key other than utm_* or a known click ID answers 422.
   */
  tracking?: ContactTrackingWrite
}

/** Tracking keys accepted on write: any `utm_*` plus the known click IDs. */
export type ContactTrackingKey =
  | 'utm_source'
  | 'utm_medium'
  | 'utm_campaign'
  | 'utm_term'
  | 'utm_content'
  | `utm_${string}`
  | 'gclid'
  | 'gbraid'
  | 'wbraid'
  | 'fbclid'
  | 'msclkid'
  | 'ttclid'
  | 'ctwa_clid'

/** Up to 30 keys, values up to 500 characters. */
export type ContactTrackingWrite = Partial<Record<ContactTrackingKey, string>>

/**
 * What `Contact.tracking` returns: the write keys plus the ad fields Wazapi
 * records from Click-to-WhatsApp (`ad_id`, `ad_source_url`, `ad_headline`,
 * `ad_body`, `referral_source`, `referral_ref`).
 */
export type ContactTracking = Record<string, string>

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
  /** Only products of this category; another company's category returns an empty list. (API 1.19) */
  category_uuid?: string
  /** Only active or inactive products. (API 1.19) */
  active?: boolean
}

/** `GET /store/orders` filters (API 1.19). An unknown `status` is ignored. */
export interface ListStoreOrdersParams {
  after?: string
  limit?: number
  status?: StoreOrderStatus
  source?: StoreOrderSource
  payment_method?: StoreOrder['payment_method']
  /** Customer name, phone (4+ digits) or the start of the order `ref`. */
  query?: string
  /** ISO 8601 date-time: only orders changed after it — the incremental sync cursor. */
  updated_after?: string
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
  /** ISO 4217 code of the store prices. (API 1.19) */
  currency: string
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

export type CrmStageKind = 'open' | 'won' | 'lost'

/** A stage of a CRM board. A board is a Wazapi group, identified by `group.uuid`. (API 1.20) */
export interface CrmStage {
  uuid: string
  name: string
  /** `won` and `lost` close every board; stages created through the API are `open`. */
  kind: CrmStageKind
  /** Hex color, e.g. `#64748b`. */
  color: string
  /**
   * The stage's id in your own system. Unique per board when set; the same id
   * may repeat on different boards.
   */
  external_id: string | null
  group: { uuid: string; name: string }
}

export interface CrmStageListParams {
  /** Only the stages of this board. Unknown uuid: `404 group_not_found`. */
  group_uuid?: string
  /** Exact match. Without `group_uuid` it may return one stage per board. */
  external_id?: string
}

export interface CrmStageWrite {
  /** The board to add the stage to: `group.uuid` from `listCrmStages()`. */
  group_uuid: string
  /** 2 to 80 characters. */
  name: string
  /** Hex color. Defaults to `#64748b`. */
  color?: string
  /**
   * Your system's id for this stage (up to 120 characters). Unique on the
   * board, otherwise `422 stage_external_id_taken`; `null` clears it.
   */
  external_id?: string | null
}

/** Partial update: an omitted field keeps its value, `external_id: null` clears it. */
export type CrmStagePatch = Partial<Omit<CrmStageWrite, 'group_uuid'>>

/** A CRM opportunity (deal). (API 1.21) */
export interface CrmOpportunity {
  uuid: string
  title: string
  /** Value in cents of `currency`. */
  value_cents: number
  currency: string
  notes: string | null
  /** Why it was lost; set when moved to a `lost` stage. */
  outcome_reason: string | null
  due_at: string | null
  /** Set when the opportunity enters a Won or Lost stage. */
  closed_at: string | null
  /** Your system's id. Unique per company among non-archived opportunities. */
  external_id: string | null
  /** Optimistic lock: send it back on update to reject a write over someone else's change. */
  version: number
  stage: { uuid: string; name: string; kind: CrmStageKind; external_id: string | null }
  group: { uuid: string; name: string }
  contact: { uuid: string; name: string | null; phone: string | null }
  assignee: { uuid: string; name: string } | null
  created_at: string
  updated_at: string | null
}

export interface ListCrmOpportunitiesParams {
  after?: string
  limit?: number
  group_uuid?: string
  stage_uuid?: string
  contact_uuid?: string
  /** Exact match on the opportunity `external_id`. */
  external_id?: string
}

interface CrmOpportunityFields {
  /** A stage of the same board. Unknown or from another board: `422 invalid_stage`. */
  stage_uuid?: string
  /** Alternative to `stage_uuid`: the stage by the `external_id` you gave it on this board. */
  stage_external_id?: string
  contact_uuid?: string
  /** Alternative to `contact_uuid`: the id this integration linked with `upsertContactByExternalId`. */
  contact_external_id?: string
  /** 2 to 180 characters. */
  title?: string
  value_cents?: number
  /** `2026-10-15` (São Paulo time) or an ISO date-time; `null` clears it. */
  due_at?: string | null
  notes?: string | null
  /** Unique per company among non-archived opportunities (`422 opportunity_external_id_taken`); `null` clears it. */
  external_id?: string | null
}

/**
 * Send `contact_uuid` or `contact_external_id`. Without a stage the opportunity
 * starts in the board's first open stage.
 */
export interface CrmOpportunityWrite extends CrmOpportunityFields {
  /** The board: `group.uuid` from `listCrmStages()`. */
  group_uuid: string
  title: string
}

/**
 * Partial update. A stage moves the opportunity to the end of that stage; Won/Lost
 * close it and Lost needs `outcome_reason`.
 */
export interface CrmOpportunityPatch extends CrmOpportunityFields {
  outcome_reason?: string | null
  /** The `version` you read; a newer one answers `409 stale_opportunity`. */
  version?: number
}

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
  discount_cents?: number
  net_cents?: number
  total_cents: number
}

/** `manual` = an agent in the dashboard; `api` = `createStoreOrder` (API 1.19). */
export type StoreOrderSource =
  | 'storefront'
  | 'whatsapp_catalog'
  | 'manual'
  | 'flow'
  | 'ai_agent'
  | 'api'

export interface StoreOrder {
  uuid: string
  /** Short human reference (first 8 chars of the uuid) shown to the customer. */
  ref: string
  status: StoreOrderStatus
  /** Where the order was placed. */
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
  discount_cents?: number
  discount?: Record<string, unknown> | null
  subtotal_cents: number
  shipping_name: string | null
  shipping_cents: number
  total_cents: number
  /** ISO 4217 code of every `*_cents` value, snapshotted at creation. (API 1.19) */
  currency: string
  /** `catalog` = order from the native WhatsApp catalog (payment arranged in chat). */
  payment_method: 'pix' | 'link' | 'on_delivery' | 'catalog' | 'checkout'
  /** Statuses `updateStoreOrderStatus` accepts from the current one; empty when final. (API 1.19) */
  allowed_transitions: Exclude<StoreOrderStatus, 'novo'>[]
  notes: string | null
  created_at: string | null
  updated_at: string | null
}

export interface StoreShippingOption {
  uuid: string
  name: string
  price_cents: number
  /** The storefront asks for an address with this option; `createStoreOrder` does not take one — use `notes`. */
  requires_address: boolean
  position: number
}

export interface StoreShippingOptionList {
  data: StoreShippingOption[]
  /** Shipping is free when the order subtotal reaches this value; null without free shipping. */
  meta: { free_shipping_from_cents: number | null }
}

/** Body of `createStoreOrder` — a sale closed outside the storefront. (API 1.19) */
export interface StoreOrderCreate {
  customer_name: string
  /** With a leading `+` it is E.164; without it, a national number of the company country. */
  customer_phone: string
  /** 1–50 items; `variant_uuid` is required when the product has variants. */
  items: { product_uuid: string; variant_uuid?: string | null; quantity: number }[]
  shipping_option_uuid?: string | null
  payment_method: 'pix' | 'link' | 'on_delivery'
  notes?: string | null
  /** Already paid: the order goes novo → confirmado → pago in the same request. */
  mark_paid?: boolean
}

export interface StoreOrderCreateResult {
  order: StoreOrder
  /** True when the Idempotency-Key was already used with the same body: same order, no side effect. */
  replayed: boolean
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
  | 'order.status.updated'
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

/**
 * A store order was created, from any source. `status` is the status when the
 * event was built. Events are not ordered: upsert by `order_uuid` and compare
 * `updated_at`.
 */
export interface OrderCreatedData extends WebhookContactRefs {
  order_uuid: string
  ref: string
  status: string
  source: StoreOrderSource
  customer_name: string
  customer_phone: string
  contact_uuid: string | null
  items: StoreOrderItem[]
  discount_cents?: number
  discount?: Record<string, unknown> | null
  subtotal_cents: number
  shipping_name: string | null
  shipping_cents: number
  total_cents: number
  /** ISO 4217 (API 1.19). */
  currency: string
  payment_method: StoreOrder['payment_method']
  notes: string | null
  created_at: string | null
  updated_at?: string | null
}

/** A store order changed status (API 1.19); same shape as `order.created` plus `previous_status`. */
export interface OrderStatusUpdatedData extends OrderCreatedData {
  status: StoreOrderStatus
  /** Status before the change; a chained confirmation (novo → confirmado → pago) is one event from `novo`. */
  previous_status: StoreOrderStatus
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
export type OrderStatusUpdatedEvent = WebhookEnvelope<
  'order.status.updated',
  OrderStatusUpdatedData
>
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
  | OrderStatusUpdatedEvent
  | WebhookTestEvent

export interface DiscountRules {
  kind: 'percent' | 'fixed'
  /** Basis points for percent; cents for fixed. */
  value: number
  maxDiscountCents?: number | null
  minimumCents?: number
  productUuids?: string[]
  categoryUuids?: string[]
}
export interface StoreCouponInput {
  code: string
  name: string
  status: 'draft' | 'active' | 'paused' | 'archived'
  version?: number
  rules: DiscountRules
  startsAt?: string | null
  endsAt?: string | null
  usageLimit?: number | null
  perContactLimit?: number | null
  contactUuid?: string | null
  allowAi?: boolean
}
export interface StoreCoupon extends Omit<StoreCouponInput, 'contactUuid'> {
  uuid: string
  version: number
  currency: string
  personal: boolean
}
export interface AgentDiscountPolicyInput {
  version: number
  enabled: boolean
  allowCoupons: boolean
  minimumValue: number
  rules: DiscountRules
}
export interface AgentDiscountPolicy extends AgentDiscountPolicyInput { uuid: string }
export interface StoreCouponPage {
  data: StoreCoupon[]
  meta: { currentPage: number; lastPage: number; perPage: number; total: number }
}
