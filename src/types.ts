// Types mirror the Wazapi Public API v1 OpenAPI contract
// (openapi/public-api.v1.json). Keep in sync when the contract changes.

export type PublicApiScope =
  | 'channels:read'
  /** Retire or un-retire a channel (API 1.37). */
  | 'channels:write'
  | 'contacts:read'
  | 'contacts:write'
  | 'contacts:block'
  | 'conversations:read'
  /** Write conversation custom field values (API 1.25). */
  | 'conversations:write'
  /** Read conversation select-field options (API 1.25). Never granted implicitly. */
  | 'fields:read'
  /** Replace conversation select-field options (API 1.25). */
  | 'fields:write'
  /** Read support groups and their distribution report (API 1.24). */
  | 'groups:read'
  /** Edit group waiting and distribution options (API 1.24). */
  | 'groups:write'
  /** Read entry settings and the `supported_entries` of flows, keywords and agents (API 1.26). */
  | 'entries:read'
  | 'entries:write'
  /** Read company settings such as the stalled bot watchdog (API 1.28). */
  | 'settings:read'
  /** Write company settings, company queries and agent query permissions. */
  | 'settings:write'
  /** Read AI agents, their usage, guard rules, company queries and AI duty. */
  | 'ai_agents:read'
  /** Write guard rules and AI duty, and run paid AI summary previews. */
  | 'ai_agents:write'
  /** Read AI summary settings and costs (API 1.29). */
  | 'ai_summaries:read'
  | 'ai_summaries:write'
  /** List knowledge sources. */
  | 'knowledge:read'
  /** Create, edit and reindex URL knowledge sources. */
  | 'knowledge:write'
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
  /** List this integration's webhooks (API 1.46). */
  | 'webhooks:read'
  /** Manage this integration's webhooks; each event also needs the scope that reads it (API 1.46). */
  | 'webhooks:write'

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

export type ChannelProvider = 'whatsapp' | 'instagram' | 'messenger' | 'webchat'

/** Who caused a channel transition: a person (by uuid), Meta or Wazapi itself. */
export interface ChannelActor {
  type: 'person' | 'Meta' | 'system'
  uuid: string | null
}

/** Meta error codes treated as account-level send rejections. */
export type ChannelAccountRejectionCode = 131042 | 131031 | 368 | 131048

/**
 * Latest account-level send rejection. Disappears 24h after the latest
 * rejection or after Meta accepts a template (acceptance is not delivery).
 */
export interface ChannelAccountRejection {
  code: ChannelAccountRejectionCode
  reason: string
  occurredAt: string
  expiresAt: string
  active: boolean
}

/** Administrator-marked retirement; reconnecting the channel clears it. (API 1.37) */
export interface ChannelRetirement {
  isRetired: boolean
  retiredAt: string | null
  retiredBy: { uuid: string | null; name: string | null } | null
}

export interface Channel extends ChannelRetirement {
  uuid: string
  /** Instagram and Messenger channels are listed since API 1.32. */
  provider: ChannelProvider
  display_name: string | null
  phone_number: string | null
  status: string
  capabilities: ChannelCapabilities
  /** Last recorded transition; `null` when no transition was recorded. (API 1.32) */
  statusChangedAt: string | null
  statusReason: string | null
  statusChangedBy: ChannelActor | null
  downSince: string | null
  /** Observed channel health, separate from the provider connection `status`. */
  healthStatus: 'healthy' | 'degraded' | 'critical' | 'unknown'
  accountRejection?: ChannelAccountRejection | null
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

/**
 * How a message or conversation came in. Legacy rows read as `direct`.
 * Precedence: comment > mention > story_reply > ad > direct. (API 1.26)
 */
export type EntryKind = 'direct' | 'ad' | 'story_reply' | 'mention' | 'comment'

/**
 * Entries a flow accepts per provider. A missing or empty list means all;
 * default flows accept `comment` only when listed. (API 1.26, `webchat` 1.45)
 */
export interface FlowEntries {
  whatsapp?: ('direct' | 'ad')[]
  messenger?: ('direct' | 'ad')[]
  instagram?: EntryKind[]
  webchat?: 'direct'[]
}

/**
 * The flow's own stalled-bot rule. `default` inherits the nearest non-default
 * caller (up to 10), then the company setting.
 */
export interface FlowMonitoringRule {
  mode: 'default' | 'disabled' | 'start_flow' | 'assign_group'
  minutes?: number
  flowUuid?: string | null
  groupUuid?: string | null
  /** `null` or omitted inherits the company fallback. */
  fallbackGroupUuid?: string | null
}

/** The rule that applies; without `flow_session_uuid` the flow is evaluated standalone. */
export interface EffectiveFlowMonitoringRule {
  origin: 'flow' | 'caller' | 'company' | 'none'
  disabled: boolean
  sourceFlowUuid: string | null
  sourceFlowName: string | null
  chainWarning: 'cycle' | 'depth_limit' | null
  /** Effective camelCase stale-session settings. */
  settings: Record<string, unknown> | null
}

export interface Flow {
  uuid: string
  name: string
  status: 'draft' | 'active'
  supported_providers: string[]
  created_at: string | null
  updated_at: string | null
  supported_entries?: FlowEntries
  monitoring_rule?: FlowMonitoringRule
  effective_monitoring_rule?: EffectiveFlowMonitoringRule
  monitoring_warnings?: string[]
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
  /** API 1.44: carousel cards in card order; empty for other templates. */
  cards: TemplateCard[]
  /** API 1.44: present on limited-time offer templates, `null` otherwise. */
  limited_time_offer: { text: string; has_expiration: boolean } | null
}

export interface TemplateCard {
  /** Position of the card: send its values at the same position of `components.cards`. */
  index: number
  header_format: 'IMAGE' | 'VIDEO' | null
  body_parameter_count: number
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
  /** Up to 15 characters on a limited-time offer template, 20 otherwise. */
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
  /**
   * API 1.44: required when `variables.limited_time_offer.has_expiration` is true.
   * Unix timestamp in milliseconds when the offer ends: later than now and within the next
   * year. An end already past answers `offer_expired` (also on the polled operation, when
   * pacing held the send until after the end).
   */
  limited_time_offer?: { expiration_time_ms: number }
  /** API 1.44: one entry per carousel card, in card order (the position is the card index). */
  cards?: TemplateSendCard[]
}

export interface TemplateSendCard {
  /** The card media; `type` is `variables.cards[].header_format` lowercased. */
  header: { type: 'image' | 'video' } & TemplateSendMedia
  /** Card body `{{1}}..{{n}}` values, in order. */
  body?: string[]
  buttons?: Array<{ index: number; url_suffix: string } | { index: number; payload: string }>
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
  entry_kind?: EntryKind
  /**
   * First inbound still awaiting a successful human reply, whatever the
   * unanswered mode. Notes, bot/AI and API/MCP sends do not clear it.
   */
  awaiting_human_since: string | null
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
  /** Read-only custom values stored on the conversation. */
  customFields?: Record<string, unknown>
}

/** One question → answer of a WhatsApp form reply (API 1.43). */
export interface FormReplyAnswer {
  key: string
  label: string
  value: string
}

/**
 * `content` of a `form_reply` message: the contact answered a WhatsApp form
 * (WhatsApp Flows). `uuid`/`name` are `null` when the form was deleted (API 1.43).
 */
export interface FormReplyContent {
  /** Plain `Question: answer` summary, one per line. */
  text: string
  form: { uuid: string | null; name: string | null; answers: FormReplyAnswer[] }
}

export interface Message {
  uuid: string
  direction: 'inbound' | 'outbound'
  /**
   * Message kind (`text`, `image`, `template`, `interactive`, ...). `form_reply`
   * carries a {@link FormReplyContent}; a form sent by a flow is an outbound
   * `interactive` whose `content.form` is `{ uuid, name, cta }` (API 1.43).
   */
  type: string
  status: string
  /** `context` is set when the message quotes another one (API 1.28). */
  content: Record<string, unknown> & { context?: MessageQuoteContext }
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
  entry_kind?: EntryKind
}

/**
 * The quoted message of a reply: links, not a copy of its text. A later
 * deletion may leave a `messageUuid` whose message is unavailable. (API 1.28)
 */
export interface MessageQuoteContext {
  /** Provider id of the quoted WhatsApp message. */
  providerMessageId: string
  /** Resolved only in the same conversation; `null` when unavailable at receipt. */
  messageUuid: string | null
  /** Sender identifier WhatsApp supplies on received context. */
  from?: string
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
  | 'recipient_in_experiment'
  | 'recipient_undeliverable'
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
      /**
       * Quote a message of this recipient's current conversation on this channel;
       * an invalid target answers `422 reply_target_invalid`. (API 1.28)
       */
      replyToMessageUuid?: string
    }
  | {
      channel_uuid?: string
      recipient: Recipient
      type: 'template'
      content: TemplateSendContent
    }
  | {
      channel_uuid?: string
      recipient: Recipient
      type: 'media'
      content: MediaSendContent
      replyToMessageUuid?: string
    }

/** A file of the company library sent as WhatsApp media. (API 1.31) */
export interface MediaSendContent {
  /** Image, video, document or audio of the file library; no external URL is downloaded. */
  media_uuid: string
  /** Image, video and document only; audio answers `media_caption_unsupported`. */
  caption?: string
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
  /** Set when archived; archived ones only come with `include_archived` or by uuid. */
  archived_at: string | null
  /** Your system's id. Unique per company among non-archived opportunities. */
  external_id: string | null
  /** Optimistic lock: send it back on update to reject a write over someone else's change. */
  version: number
  stage: { uuid: string; name: string; kind: CrmStageKind; external_id: string | null }
  group: { uuid: string; name: string }
  /** `external_id` is the id your integration linked with `upsertContactByExternalId`. */
  contact: { uuid: string; name: string | null; phone: string | null; external_id: string | null }
  /** `external_id` is the person's id in your system (Settings → Users). */
  assignee: { uuid: string; name: string; email: string; external_id: string | null } | null
  created_at: string
  updated_at: string | null
}

export interface ListCrmOpportunitiesParams {
  after?: string
  limit?: number
  group_uuid?: string
  stage_uuid?: string
  contact_uuid?: string
  /** The contact your integration linked with this id. */
  contact_external_id?: string
  /** Exact match on the opportunity `external_id`. */
  external_id?: string
  /**
   * ISO 8601 date-time: only opportunities changed after it. Every change (edit,
   * stage move, archive) updates `updated_at`, so store the time a sync starts
   * and pass it next time together with `include_archived`.
   */
  updated_after?: string
  /** Also return archived opportunities. */
  include_archived?: boolean
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
  /**
   * The responsible team member by the external id set in Settings → Users;
   * `null` removes the assignee. Must belong to the board's group (`422 invalid_assignee`).
   */
  assigned_user_external_id?: string | null
  /** Alternative to `assigned_user_external_id`: the member by e-mail. */
  assigned_user_email?: string | null
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

/** Paid gateway charge of an order (API 1.42). */
export interface StoreOrderPayment {
  method: 'pix' | 'bank_slip' | 'credit_card'
  /** Id of the charge on the gateway (the Vindi bill id). */
  provider_bill_id: string | null
  /** 1 for Pix and bank slip. */
  installments: number
}

/** AI agent that closed the sale (API 1.42). */
export interface StoreOrderAgent {
  uuid: string
  /** Current agent name; null when the agent was deleted after the sale. */
  name: string | null
}

/**
 * Gateway payment state of a `payment_method: checkout` order; null without a
 * gateway charge (manual payment, `mark_paid`). `status: 'pago'` is the order
 * being paid; this field says how the gateway sees the charge. (API 1.42)
 */
export type StoreOrderPaymentStatus =
  | 'processing'
  | 'paid'
  | 'failed'
  | 'unknown'
  | 'rejected'
  | 'cancelled'
  | 'review'
  | 'refunded'
  | 'disputed'

/** Buyer and payment fields shared by the order and the order webhooks (API 1.42). All may be null. */
export interface StoreOrderBuyerPayment {
  /** E-mail typed at checkout (`billing.email`); null for orders placed without billing data. */
  customer_email: string | null
  /** Buyer's tax id (CPF/CNPJ) typed at checkout, digits only. */
  customer_document: string | null
  payment_status: StoreOrderPaymentStatus | null
  /** Gateway that charged the order (`vindi`); null without a gateway charge. */
  payment_provider: string | null
  /** UTC instant the order became `pago`; null until then, and for orders paid before API 1.42. */
  paid_at: string | null
  /** The gateway charge that paid the order; null when not paid through the gateway. */
  payment: StoreOrderPayment | null
  /** AI agent that closed the sale (`source: 'ai_agent'`); null for every other source. */
  agent: StoreOrderAgent | null
}

export interface StoreOrder extends StoreOrderBuyerPayment {
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
  | 'message.send.failed'
  | 'conversation.created'
  | 'conversation.updated'
  | 'flow.execution.updated'
  | 'order.created'
  | 'order.status.updated'
  | 'crm.opportunity.created'
  | 'crm.opportunity.updated'
  | 'crm.opportunity.stage_changed'
  | 'crm.opportunity.archived'
  | 'conversation.assigned'
  | 'conversation.status_changed'
  | 'conversation.fields_changed'
  | 'conversation.ai_summary'
  | 'channel.status_changed'
  | 'channel.account_status_changed'
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
  entry_kind?: EntryKind
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
  entry_kind?: EntryKind
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
 * A `POST /messages` operation of your integration ended `failed`, including
 * failures before Meta accepted it (free-form text outside the 24h window, a
 * blocked contact, a send guard rejection). Opt-in per webhook. (API 1.46)
 */
export interface MessageSendFailedData {
  operation_uuid: string
  operation_type: 'message.send'
  status: 'failed'
  /** The recipient as sent in `POST /messages`, phone normalized. */
  recipient: { phone: string; external_id?: string } | null
  /** Same `code` as the polled operation, e.g. `whatsapp_window_closed`. */
  error: { code: string; message: string | null }
}

/**
 * A store order was created, from any source. `status` is the status when the
 * event was built. Events are not ordered: upsert by `order_uuid` and compare
 * `updated_at`.
 */
export interface OrderCreatedData extends WebhookContactRefs, StoreOrderBuyerPayment {
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
export type MessageSendFailedEvent = WebhookEnvelope<'message.send.failed', MessageSendFailedData>
export type OrderCreatedEvent = WebhookEnvelope<'order.created', OrderCreatedData>
export type OrderStatusUpdatedEvent = WebhookEnvelope<
  'order.status.updated',
  OrderStatusUpdatedData
>
export type WebhookTestEvent = WebhookEnvelope<'webhook.test', WebhookTestData>

/**
 * Payload of the `crm.opportunity.*` events (API 1.22, opt-in per webhook).
 * `opportunity.contact.external_id` is your integration's contact id.
 */
export interface CrmOpportunityEventData {
  opportunity: CrmOpportunity
  /** Only on `crm.opportunity.stage_changed`: the stage it left. */
  previous_stage?: {
    uuid: string
    name: string
    kind: CrmStageKind
    external_id: string | null
  } | null
  /**
   * `api` when the change came through the Public API — compare
   * `origin_integration_uuid` with yours to skip the echo of your own write.
   */
  origin: 'api' | 'wazapi'
  origin_integration_uuid: string | null
}
export type CrmOpportunityCreatedEvent = WebhookEnvelope<
  'crm.opportunity.created',
  CrmOpportunityEventData
>
export type CrmOpportunityUpdatedEvent = WebhookEnvelope<
  'crm.opportunity.updated',
  CrmOpportunityEventData
>
export type CrmOpportunityStageChangedEvent = WebhookEnvelope<
  'crm.opportunity.stage_changed',
  CrmOpportunityEventData
>
export type CrmOpportunityArchivedEvent = WebhookEnvelope<
  'crm.opportunity.archived',
  CrmOpportunityEventData
>

/** Who made a conversation change; `integration_uuid` is set for `api` writes. */
export interface ConversationWebhookActor {
  type: 'user' | 'flow' | 'ai_agent' | 'api' | 'mcp' | 'system'
  user: { uuid: string; name: string | null } | null
  integration_uuid: string | null
}

export type ConversationStatus = 'open' | 'pending' | 'resolved'

export interface ConversationWebhookSnapshot {
  uuid: string
  status: ConversationStatus
  channel: { uuid: string; provider: string } | null
}

/** `external_id` is your integration's link for the contact, resolved at delivery. */
export interface ConversationWebhookContact {
  uuid: string
  external_id: string | null
}

/**
 * Opt-in conversation transitions (API 1.24): staged with the write and
 * delivered within about a minute, never for unchanged values. Not ordered —
 * fetch the conversation when reconciling.
 */
export interface ConversationAssignedData {
  conversation: ConversationWebhookSnapshot
  contact: ConversationWebhookContact
  actor: ConversationWebhookActor
  group: { uuid: string; name: string } | null
  previous_group: { uuid: string; name: string } | null
  assignee: { uuid: string; name: string | null; email: string } | null
  previous_assignee: { uuid: string; name: string | null; email: string } | null
}

/** The initial status of a new conversation is not a transition. (API 1.24) */
export interface ConversationStatusChangedData {
  conversation: ConversationWebhookSnapshot
  contact: ConversationWebhookContact
  actor: ConversationWebhookActor
  status: ConversationStatus
  previous_status: ConversationStatus
}

/** Value of a text, number or date field; `null` when empty. */
export interface ConversationFieldSnapshot {
  value: unknown
}

/** Value of a select field with its label at the time of the change. */
export interface ConversationSelectSnapshot {
  value: string | null
  label: string | null
}

export interface ConversationFieldChange {
  key: string
  type: string
  before: ConversationFieldSnapshot | ConversationSelectSnapshot
  after: ConversationFieldSnapshot | ConversationSelectSnapshot
}

/**
 * Committed custom field delta of a conversation (API 1.25). No event for
 * invalid writes, unchanged values or option list changes.
 */
export interface ConversationFieldsChangedData {
  conversation: {
    uuid: string
    status: string
    channel: { uuid: string; provider: string }
    /** Only `uuid_crm`, when present. */
    fields_snapshot?: { uuid_crm: unknown }
  }
  contact: ConversationWebhookContact
  changes: ConversationFieldChange[]
  actor: ConversationWebhookActor
}

export interface AiSummaryUsage {
  promptTokens: number
  completionTokens: number
  totalTokens: number
  cacheReadTokens?: number
  cacheWriteTokens?: number
}

/**
 * An internal AI summary completed (API 1.29) — never a customer message.
 * Deduplicate on `summary.uuid`; `opportunity` is `null` without an
 * unambiguous match, so skip CRM follow-ups without `opportunity.external_id`.
 */
export interface ConversationAiSummaryData {
  actor: ConversationWebhookActor
  trigger_actor: ConversationWebhookActor
  trigger: AiSummaryTrigger
  conversation: { uuid: string }
  opportunity: { uuid?: string; external_id?: string | null } | null
  summary: {
    uuid: string
    text: string
    date: string
    model: string
    usage: AiSummaryUsage
    cost_usd_micros: number
    cost_currency: 'USD'
    after_message_id: string
    through_message_id: string
  }
}

/** A channel connection or critical health transition; repeated states emit nothing. (API 1.32) */
export interface ChannelStatusChangedData {
  channel_uuid: string
  provider: ChannelProvider
  status: 'connected' | 'disconnected' | 'critical'
  previous_status: string | null
  status_changed_at: string
  status_reason: string | null
  status_changed_by: ChannelActor
}

/** Meta started or stopped rejecting sends for the whole WhatsApp account. (API 1.32) */
export interface ChannelAccountStatusChangedData {
  channel_uuid: string
  provider: 'whatsapp'
  status: 'account_rejected' | 'account_recovered'
  code: ChannelAccountRejectionCode | null
  reason: string
  occurred_at: string
  actor: ChannelActor
  expires_at: string | null
}

export type ConversationAssignedEvent = WebhookEnvelope<
  'conversation.assigned',
  ConversationAssignedData
>
export type ConversationStatusChangedEvent = WebhookEnvelope<
  'conversation.status_changed',
  ConversationStatusChangedData
>
export type ConversationFieldsChangedEvent = WebhookEnvelope<
  'conversation.fields_changed',
  ConversationFieldsChangedData
>
export type ConversationAiSummaryEvent = WebhookEnvelope<
  'conversation.ai_summary',
  ConversationAiSummaryData
>
export type ChannelStatusChangedEvent = WebhookEnvelope<
  'channel.status_changed',
  ChannelStatusChangedData
>
export type ChannelAccountStatusChangedEvent = WebhookEnvelope<
  'channel.account_status_changed',
  ChannelAccountStatusChangedData
>

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
  | MessageSendFailedEvent
  | OrderCreatedEvent
  | OrderStatusUpdatedEvent
  | CrmOpportunityCreatedEvent
  | CrmOpportunityUpdatedEvent
  | CrmOpportunityStageChangedEvent
  | CrmOpportunityArchivedEvent
  | ConversationAssignedEvent
  | ConversationStatusChangedEvent
  | ConversationFieldsChangedEvent
  | ConversationAiSummaryEvent
  | ChannelStatusChangedEvent
  | ChannelAccountStatusChangedEvent
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

/* ── Webhook management (API 1.46) ─────────────────────────────────────── */

/** A webhook of the integration that owns the token. */
export interface WebhookEndpoint {
  uuid: string
  url: string
  /** Subscribed events, `webhook.test` included. */
  events: WebhookEventType[]
  active: boolean
  /** Last 4 characters of the signing secret. */
  secret_hint: string
  /** While set, deliveries are also signed with the secret replaced by the last rotation. */
  previous_secret_expires_at: string | null
  created_at: string | null
  updated_at: string | null
}

/** Returned only by `createWebhook` and `rotateWebhookSecret`: store `secret` now. */
export interface WebhookEndpointWithSecret extends WebhookEndpoint {
  secret: string
}

export interface WebhookEndpointWrite {
  /** Public HTTPS URL. */
  url: string
  /** `webhook.test` is always added. Each event needs the token scope that reads it. */
  events: WebhookEventType[]
}

/* ── CRM upsert by external id (API 1.27) ──────────────────────────────── */

/**
 * Send exactly one contact reference (`contact_uuid`, `contact_external_id` or
 * `contact_phone`) and one stage reference (`stage_uuid` or `stage_external_id`).
 * Fields outside this contract (value, notes, due date) keep their value.
 */
export interface CrmOpportunityUpsert {
  /** Destination board; the fallback when `group_mode` finds no open conversation. */
  group_uuid: string
  /** Use the group of the contact's most recently updated open conversation. */
  group_mode?: 'contact_open_conversation'
  /** 2 to 180 characters. */
  title: string
  contact_uuid?: string
  contact_external_id?: string
  /** Finds an existing contact like `listContacts({ phone })`; never creates one. */
  contact_phone?: string
  stage_uuid?: string
  stage_external_id?: string
  /**
   * Omitted keeps the current assignee when valid on the destination board;
   * `null` clears it; an unknown member clears it and warns `invalid_assignee`.
   */
  assigned_user_email?: string | null
  assigned_user_external_id?: string | null
  /** Required when creating in or moving to a `lost` stage. */
  outcome_reason?: string | null
}

export interface CrmOpportunityUpsertItem extends CrmOpportunityUpsert {
  /** Company-wide key among active opportunities; archived ones do not reserve it. */
  external_id: string
}

export type CrmOpportunityUpsertOutcome = 'created' | 'updated' | 'unchanged' | 'moved_group'

export interface CrmOpportunityUpsertResult {
  /** `unchanged` writes nothing and emits no webhook. */
  result: CrmOpportunityUpsertOutcome
  opportunity: CrmOpportunity
  warnings: 'invalid_assignee'[]
}

/** One item of `upsertCrmOpportunitiesBatch`, at the same `index` as sent. */
export type CrmOpportunityUpsertBatchResult =
  | ({ index: number; external_id: string | null } & CrmOpportunityUpsertResult)
  | {
      index: number
      external_id: string | null
      error: { status: number; code: string; message: string; details?: unknown }
    }

/* ── Groups (API 1.24) ─────────────────────────────────────────────────── */

export type GroupDistributionStrategy = 'least_busy' | 'round_robin' | 'random' | 'balanced_daily'

/** A support group (the same group is a CRM board). */
export interface SupportGroup {
  uuid: string
  name: string
  /** Visual waiting alert in minutes; never schedules a transfer. */
  wait_alert_minutes: number | null
  /** `null` keeps the legacy distribution. (API 1.27) */
  distribution_strategy: GroupDistributionStrategy | null
  /** FIFO queue for assignments that end without a person. (API 1.27) */
  queue_when_unavailable: boolean
  /** With the queue on, distribution waits for this schedule; `null` = any time. */
  distribution_schedule_uuid: string | null
  /** Queue deliveries per person per minute; `null` removes the limit. */
  queue_batch_per_agent: number | null
  /** Minutes the queue waits after each schedule opening; 0 disables. (API 1.39) */
  queue_opening_delay_minutes: number
  /** Active queue conversations per person; `null` removes the ceiling. (API 1.39) */
  queue_max_per_agent: number | null
  /** Serve conversations inside the 24h window first; false keeps FIFO. (API 1.41) */
  queue_open_window_first: boolean
}

/** Partial update: an omitted field keeps its value, `null` clears a nullable one. */
export type SupportGroupPatch = Partial<Omit<SupportGroup, 'uuid' | 'name'>>

export interface GroupDistributionReport {
  group_uuid: string
  /** Calendar day in the company timezone. */
  day: string
  timezone: string
  history_note: string
  people: {
    user_uuid: string
    name: string | null
    received: number
    open_now: number
    first_online_at: string | null
    received_by_origin: {
      queue: number
      distribution: number
      transfer: number
      manual: number
      flow: number
      ai: number
      ownerless_fallback?: number
    }
  }[]
  queue: {
    entered: number
    waiting_now: number
    delivered: number
    average_wait_seconds: number | null
    maximum_wait_seconds: number | null
    /** True when more than the first 1000 deliveries happened. */
    deliveries_truncated: boolean
    deliveries: {
      conversation_uuid: string
      user_uuid: string | null
      enqueued_at: string
      delivered_at: string
    }[]
    /** `waiting_open_window + waiting_closed_window = waiting_now`. */
    waiting_open_window: number
    waiting_closed_window: number
  }
}

/* ── Custom fields and the conversation panel (API 1.24–1.28) ──────────── */

export interface FieldOption {
  value: string
  label: string
}

export type CustomFieldType = 'text' | 'number' | 'date' | 'select'

/** Attribute names are camelCase. */
export interface CustomFieldDefinition {
  uuid: string
  key: string
  label: string
  type: CustomFieldType
  scope: 'contact' | 'conversation'
  description?: string | null
  required?: boolean
  active?: boolean
  showToClient?: boolean
  section: string | null
  /** Lower first; `null` sorts by label. */
  position: number | null
  multiline: boolean
  hideWhenEmpty: boolean
  /** Blocks edits in the panel only; flow, AI, API and MCP writes still work. */
  readOnly?: boolean
  /** Unique values; a repeated label cannot be used to write a value. */
  options: FieldOption[]
  /** HTTPS URL with `{value}` outside its host. */
  linkTemplate?: string | null
  linkLabel?: string | null
  /** Hide when equal to the native contact name/e-mail. */
  hideWhenEqualsNative?: 'name' | 'email' | null
}

type CustomFieldWritable = Partial<
  Omit<CustomFieldDefinition, 'uuid' | 'key' | 'label' | 'type'>
> & {
  /** Adds or updates options by value and removes the listed values. */
  optionsPatch?: { upsert?: FieldOption[]; remove?: string[] }
}

export interface CustomFieldCreate extends CustomFieldWritable {
  key: string
  label: string
  type: CustomFieldType
}

/** Partial update: an omitted attribute keeps its value. */
export interface CustomFieldPatch extends CustomFieldWritable {
  label?: string
  type?: CustomFieldType
}

export interface ConversationFieldOptions {
  key: string
  type: 'select'
  options: FieldOption[]
}

type PanelVisibility = 'show' | 'hide'

/** Conversation context panel configuration. Configuration only: no contact value changes. */
export interface ConversationPanel {
  cards: {
    key: string
    title: string
    icon:
      | 'UserIcon'
      | 'UserLove01Icon'
      | 'Target01Icon'
      | 'Megaphone01Icon'
      | 'BrainIcon'
      | 'InformationCircleIcon'
    order: number
  }[]
  /** Omitted native items keep their original position; phone stays read-only. */
  nativeItems: {
    key: 'name' | 'phone' | 'email' | 'organization' | 'crmStage'
    section: string
    position: number
    width?: 'full' | 'half'
    hideWhenEmpty?: boolean
  }[]
  detailsReadOnly?: boolean
  contactBlock?: PanelVisibility
  contactTags?: PanelVisibility
  conversationTags?: PanelVisibility
  waitingBadge?: 'unassigned' | 'always'
  /** Read-only diagnostics. */
  warnings?: {
    code: 'unsectioned_contact_fields'
    fields: { uuid: string; key: string; label: string }[]
  }[]
  topCards?: boolean
  detailsCrmStage?: PanelVisibility
  wrapValues?: boolean
  fieldItems?: { fieldUuid: string; width?: 'full' | 'half'; placement?: 'body' | 'header' }[]
  transferTargets?: 'members' | 'all'
  /** Find a Brazilian mobile with or without the ninth digit. (API 1.28) */
  phoneEquivalenceBrNinthDigit?: boolean
}

/** Omitted options keep their value; a supplied array replaces its list. */
export type ConversationPanelPatch = Partial<Omit<ConversationPanel, 'warnings'>>

/* ── Entries (API 1.26) ────────────────────────────────────────────────── */

export interface EntrySettings {
  entrySplit: 'none' | 'public_private'
}

/** `supported_entries` of a keyword or AI agent. Keyword: empty means all; agent: empty denies all. */
export interface EntryTargets {
  uuid: string
  supported_entries: EntryKind[]
}

export interface FlowEntryTargets {
  uuid: string
  supported_entries: FlowEntries
}

/* ── Inbox and automation settings ─────────────────────────────────────── */

export interface InboxResponseSettings {
  /** What counts as unanswered. Defaults to `last_message`. */
  unansweredMode: 'last_message' | 'human_reply' | 'team_reply'
  /** Company overdue threshold; `null` disables, omitted on update keeps it. */
  overdueMinutes?: number | null
}

export interface TeamReplyRecalculation {
  dryRun: boolean
  scanned: number
  changed: number
  waiting: number
  unknown: number
  /** Call again with this cursor until it is `null`. */
  nextCursor: string | null
  changes: {
    conversationUuid: string
    before: string | null
    after: string | null
    changed: boolean
    reason:
      | 'recorded'
      | 'never_team'
      | 'answered_or_no_inbound'
      | 'ai_handoff'
      | 'timeout_no_return'
      | 'inbound_with_person'
      | 'unknown_preserved'
  }[]
}

/** Stalled bot watchdog, off by default. (API 1.28) */
export interface StaleSessionSettings {
  /** `null` disables the watchdog. */
  stale_session_minutes: number | null
  stale_session_action: 'start_flow' | 'assign_group' | null
  stale_session_flow_uuid: string | null
  stale_session_group_uuid: string | null
  /** Group for a closed messaging window; `null` only records the block. */
  stale_session_fallback_group_uuid: string | null
  stale_session_max_age_hours: number
  stale_session_close_old: boolean
}

/** Partial update; takes effect on the next minute sweep. */
export type StaleSessionSettingsPatch = Partial<StaleSessionSettings>

/** Group for conversations with no person and no group. (API 1.33) */
export interface OwnerlessFallbackSettings {
  defaultGroupUuid: string | null
  /** Per-channel overrides; they win over the default. */
  channels: { whatsapp?: string | null; instagram?: string | null; messenger?: string | null }
  groups: { uuid: string; name: string }[]
  warnings: {
    groupUuid: string
    name: string | null
    reason: 'inactive_group' | 'invalid_group'
  }[]
}

export type OwnerlessFallbackPatch = Partial<
  Pick<OwnerlessFallbackSettings, 'defaultGroupUuid' | 'channels'>
>

export interface OwnerlessFallbackApplication {
  dryRun: boolean
  total: number
  applicable: number
  applied: number
  skipped: number
  items: {
    conversationUuid: string
    channel: string
    groupUuid: string | null
    groupName: string | null
    reason: string
  }[]
}

/* ── Channels (API 1.32, 1.37) ─────────────────────────────────────────── */

export type ChannelEventKind =
  | 'status_changed'
  | 'inbound_dropped'
  | 'account_rejected'
  | 'account_recovered'
  | 'retirement_changed'

export interface ChannelEvent {
  uuid: string
  kind: ChannelEventKind
  type: 'direct' | 'comment' | 'other' | null
  senderIdentifier: string | null
  providerEventId: string | null
  status: string | null
  previousStatus: string | null
  reason: string | null
  actor: ChannelActor
  occurredAt: string
  providerOccurredAt: string | null
  downSince: string | null
  isMessage: boolean
}

/** Newest first. Dropped inbound metadata is kept 30 days; retirement events are durable. */
export interface ChannelEventPage {
  items: ChannelEvent[]
  /** Pass as `after` for the next page. */
  nextCursor: string | null
  retentionDays: 30
}

export interface ChannelEventListParams {
  after?: string
  limit?: number
  kind?: ChannelEventKind
}

export interface ChannelRetirementResult extends ChannelRetirement {
  channelUuid: string
}

/* ── Messages ──────────────────────────────────────────────────────────── */

export interface MessageReactionResult {
  /** The provider accepted the reaction; not proof of delivery. */
  ok: boolean
  error: string | null
  conversation_uuid: string
  message_uuid: string
  reactions: { emoji: string; actor_user_id: number | null; direction: 'inbound' | 'outbound' }[]
}

/* ── AI summaries (API 1.29) ───────────────────────────────────────────── */

export type AiSummaryTrigger = 'stage_changed' | 'assigned' | 'resolved' | 'nightly'

/** Opt-in per company; only messages from activation onward are summarized. */
export interface AiSummarySettings {
  enabled: boolean
  model: string
  triggers: AiSummaryTrigger[]
  minLeadMessages: number
  minAgentMessages: number
  maxLines: number
  maxInputChars: number
  dailyBudgetUsd: number
  timezone: string
  nightlyHour: number
  /** `field` replaces the conversation field `fieldKey`; `note` keeps timeline notes. */
  display: 'field' | 'note'
  /** An active text field with conversation scope; never auto-created. */
  fieldKey: string
  /** Read-only diagnostics: automatic summaries skip a missing or invalid field. */
  warnings: {
    code: 'summary_field_missing' | 'summary_field_inactive' | 'summary_field_not_text'
    fieldKey: string
  }[]
}

/** Omitted fields keep their value; enabling requires the provider connected. */
export type AiSummarySettingsPatch = Partial<Omit<AiSummarySettings, 'warnings'>>

export interface AiSummaryCall {
  uuid?: string
  model?: string
  status?: string
  day?: string
  usage?: AiSummaryUsage | null
  /** Estimated USD micros when `cost_known`; otherwise a zero placeholder. Decimal string. */
  cost_micros?: string | null
  reserved_micros?: string
  error_code?: string | null
  created_at?: string
  source?: 'automatic' | 'preview'
  /** False: zero means unknown consumption, not a free call. */
  cost_known?: boolean
  zero_cost_reason?: string | null
  error_reason?: string | null
  /** Counts and lengths only; never text or customer data. */
  failure_diagnostic?: Record<string, unknown> | null
}

/** Money and counters are decimal strings. */
export interface AiSummaryCostReport {
  days: { day?: string; calls?: string; costMicros?: string | null; reservedMicros?: string }[]
  calls: AiSummaryCall[]
  budgetAlertDay: string | null
  previews: (AiSummaryCall & {
    historical_summary_uuid?: string | null
    provider_attempted?: boolean
  })[]
  /** Preview totals; unknown costs are excluded from `costMicros`. */
  previewDays: {
    day?: string
    calls?: string
    costMicros?: string | null
    reservedMicros?: string
    unknownCostCalls?: string
  }[]
  /** Budget use including legacy previews and reservations; never add to `previewDays`. */
  previewBudgetDays: { day?: string; chargedOrReservedMicros?: string }[]
}

export interface AiSummaryPreviewInput {
  conversationUuid: string
  /** Replays a historical summary call with its frozen window and clock. */
  summaryUuid?: string
  model?: string
  instructions?: string
}

/** Paid call that writes nothing: no note, webhook or cursor change. */
export interface AiSummaryPreview {
  status: 'completed' | 'skipped' | 'failed' | 'uncertain'
  reason?: string
  lines: string[]
  model: string
  usage: Record<string, unknown> | null
  costUsdMicros: number
  costUsd: number
  input: {
    messages: { role: 'system' | 'user'; content: string }[]
    afterMessageId: string
    throughMessageId: string
    now: string | null
    timezone: string
  }
  previewUuid: string
  /** False: zero cost is unknown consumption and the reservation remains. */
  costKnown: boolean
  zeroCostReason: string | null
  reservedUsdMicros: number
  errorCode?: string
  failureDiagnostic?: Record<string, unknown> | null
}

/* ── AI agents (API 1.35–1.37) ─────────────────────────────────────────── */

/** Tariff-based estimate from provider usage, not the provider invoice. (API 1.35) */
export interface AiAgentUsage {
  currency: 'USD'
  cost_basis: 'catalog_estimate'
  timezone: string
  days: number
  since: string
  until: string
  daily: AiAgentUsageDay[]
}

export interface AiAgentUsageDay {
  date: string
  agent_uuid: string
  agent_name: string
  turns: number
  prompt_tokens: number
  output_tokens: number
  classified_turns: number
  unclassified_turns: number
  cost_cents: number
  classified_cost_cents: number
  unclassified_cost_cents: number
  /** The cache counters cover classified turns only; `null` when none was captured. */
  input_tokens: number | null
  cache_write_tokens: number | null
  cache_read_tokens: number | null
  cache_write_1h_tokens: number | null
  /** Guard rewrite attempts, included in `turns` and `cost_cents`. */
  guard_rewrite_turns: number
  guard_rewrite_cost_cents: number
}

export interface AiAgentUsageParams {
  /** Company-local calendar days, today included. */
  days?: number
  agent_uuid?: string
}

export interface AiAgentQueryResult {
  agent: { uuid: string; allowedCompanyQueryUuids: string[] }
}

/** Plantão da IA: `sombra` keeps a private record, `nota` an internal note; it never sends. (API 1.37) */
export interface AiDutySettings {
  mode: 'desligado' | 'sombra' | 'nota'
  /** An active agent of the company, required when enabled. */
  agentUuid: string | null
  /** WhatsApp only; an empty list excludes every conversation. */
  channels: 'whatsapp'[]
  /** Company-local daily cap of attempts. */
  dailyLimit: number
}

export interface ReplyGuardCondition {
  patterns: string[]
  lastMessages: number
  operator: 'absent' | 'present'
}

export type ReplyGuardFinalAction = { type: 'safe_text'; text: string } | { type: 'handoff' }

/** Reply guard of an AI agent (API 1.36). `ensaio` only logs hits; `ativo` rewrites. */
export interface ReplyGuardRule {
  uuid: string
  name: string
  kind: 'text_pattern' | 'past_date'
  /** Literal patterns; `{integer}` and `{number}` are numeric markers. No regular expressions. */
  patterns: string[]
  minMatches: number
  /** Suppress a match when one of these appears in the same sentence. */
  ignorePatterns: string[]
  /** `past_date` words before a bare day; defaults to dia/day. */
  dayWords?: string[]
  condition: ReplyGuardCondition | null
  correction: string
  finalAction: ReplyGuardFinalAction
  mode: 'ensaio' | 'ativo'
  enabled: boolean
  createdAt: string
  updatedAt: string | null
}

/** A new rule always starts in `ensaio`; at most 50 per agent. */
export interface ReplyGuardRuleCreate {
  name: string
  kind: ReplyGuardRule['kind']
  patterns: string[]
  minMatches?: number
  ignorePatterns?: string[]
  dayWords?: string[]
  condition?: ReplyGuardCondition | null
  correction: string
  finalAction: ReplyGuardFinalAction
  mode?: 'ensaio'
  enabled?: boolean
}

/** Only supplied fields change; `condition: null` clears it. */
export type ReplyGuardRulePatch = Partial<Omit<ReplyGuardRuleCreate, 'mode'>> & {
  mode?: 'ensaio' | 'ativo'
}

export interface ReplyGuardRules {
  agentUuid: string
  items: ReplyGuardRule[]
}

export interface ReplyGuardSaved {
  agentUuid: string
  rule: ReplyGuardRule
}

export interface ReplyGuardHit {
  uuid: string
  ruleUuid: string
  ruleName: string
  conversationUuid: string | null
  mode: 'ensaio' | 'ativo'
  /** A snippet only, never the full reply or contact history. */
  snippet: string
  phase: 'initial' | 'rewrite'
  rewrote: boolean
  rewriteFailed: boolean
  outcome: 'observed' | 'rewritten' | 'safe_text' | 'handoff'
  createdAt: string
}

export interface ReplyGuardHits {
  agentUuid: string
  since: string
  until: string
  page: number
  limit: number
  hasMore: boolean
  items: ReplyGuardHit[]
}

/** Defaults to the last 90 days; the period is at most 90 days. */
export interface ReplyGuardHitParams {
  ruleUuid?: string
  /** Inclusive ISO start. */
  since?: string
  /** Inclusive ISO end. */
  until?: string
  page?: number
  limit?: number
}

/* ── Company queries (API 1.37) ────────────────────────────────────────── */

export interface CompanyQueryParameter {
  name: string
  description: string
  required: boolean
  enum?: string[]
  maxLength?: number
}

/** A fixed HTTPS GET an AI agent may call. Credentials are never returned. */
export interface CompanyQuery {
  uuid: string
  name: string
  description: string
  /** HTTPS, without user, password or fragment. */
  url: string
  parameters: CompanyQueryParameter[]
  authHeaderName?: string | null
  credentialFromKnowledgeSourceUuid?: string | null
  timeoutSeconds?: number
  maxResponseChars?: number
  isActive: boolean
  authHeaderConfigured: boolean
  createdAt?: string | null
  updatedAt?: string | null
}

/**
 * Exactly one credential mode: your own header (`authHeaderName` +
 * `authHeaderValue`) or a URL knowledge source of the same host.
 */
export interface CompanyQueryCreate {
  name: string
  description: string
  url: string
  parameters?: CompanyQueryParameter[]
  authHeaderName?: string | null
  /** Encrypted at rest; never returned. */
  authHeaderValue?: string
  credentialFromKnowledgeSourceUuid?: string | null
  timeoutSeconds?: number
  maxResponseChars?: number
  isActive?: boolean
}

/** Omitted fields, credentials included, keep their value. */
export type CompanyQueryPatch = Partial<CompanyQueryCreate>

export interface CompanyQueryList {
  queries: CompanyQuery[]
}

export interface CompanyQueryResult {
  query: CompanyQuery
}

export interface CompanyQueryDeleteResult {
  deleted: boolean
  queryUuid: string
}

export interface CompanyQueryTestResult {
  queryUuid: string
  name?: string
  args?: Record<string, unknown>
  httpStatus: number | null
  durationMs: number
  responseChars: number
  resultChars?: number
  errorCode: string | null
  /** First 1500 characters, or the fixed unavailable message. */
  text: string
}

/* ── Knowledge sources ─────────────────────────────────────────────────── */

/** Refresh interval in hours; `null` = manual. */
export type KnowledgeRefreshInterval = 1 | 6 | 24 | 168 | null

export interface KnowledgeSource {
  uuid: string
  kind: string
  title: string
  status: 'pending' | 'indexing' | 'ready' | 'failed'
  authHeaderConfigured: boolean
  refreshIntervalHours: KnowledgeRefreshInterval
  errorCode?: string | null
  url?: string | null
  indexedAt?: string | null
  createdAt?: string | null
  chunkCount?: number
  bytes?: number
}

export interface KnowledgeSourceList {
  sources: KnowledgeSource[]
  usage?: Record<string, unknown>
  limits?: Record<string, unknown>
  embeddingProvider?: string
  embeddingsConnected?: boolean
  openaiConnected?: boolean
}

/** `queued: true` means indexing was queued, not that it finished. */
export interface KnowledgeSourceResult {
  source: KnowledgeSource
  queued?: boolean
  usedByAgents?: { uuid?: string; name?: string }[]
  agentsWithExplicitSources?: number
  warnings?: string[]
}

export interface KnowledgeUrlCreate {
  kind: 'url'
  url: string
  title?: string
  /** Omitted on create = daily. */
  refreshIntervalHours?: KnowledgeRefreshInterval
  /** A single authentication header. */
  authHeaderName?: string | null
  /** Encrypted at rest; never returned. No CR/LF. */
  authHeaderValue?: string
}

/** Omitted fields keep their value; `authHeaderName: null` removes the header. */
export type KnowledgeUrlPatch = Partial<Omit<KnowledgeUrlCreate, 'kind' | 'url'>>
