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

export interface Message {
  uuid: string
  direction: 'inbound' | 'outbound'
  type: string
  status: string
  content: Record<string, unknown>
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

/* ── Webhooks ───────────────────────────────────────────────────────────── */

export type WebhookEventType =
  | 'message.received'
  | 'message.status.updated'
  | 'conversation.created'
  | 'conversation.updated'
  | 'flow.execution.updated'
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
export type WebhookTestEvent = WebhookEnvelope<'webhook.test', WebhookTestData>

/** Discriminated on `type` — narrow it and `data` narrows with it. */
export type WazapiWebhookEvent =
  | MessageReceivedEvent
  | MessageStatusUpdatedEvent
  | ConversationCreatedEvent
  | ConversationUpdatedEvent
  | FlowExecutionUpdatedEvent
  | WebhookTestEvent
