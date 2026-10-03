import { WazapiError } from './error.js'
import type {
  TeamReplyRecalculationInput, TeamReplyRecalculationResult,
  ChannelEventPage, ListChannelEventsParams,
  AiSummarySettings, AiSummaryCosts,

  OwnerlessFallbackSettings,OwnerlessFallbackPatch,OwnerlessFallbackApplication,

  MessageReactionResult,
  StoreCoupon, StoreCouponInput, StoreCouponPage, AgentDiscountPolicy, AgentDiscountPolicyInput,
  AiAgentUsage, AiAgentUsageParams,
  AcceptedResult,
  Channel,
  Contact,
  ContactWrite,
  Conversation,
  ConversationDetail,
  Envelope,
  InboxResponseSettings,
  InboxResponseSettingsInput,
  ExecuteFlowInput,
  Flow,
  ListContactsParams,
  ListParams,
  Message,
  Operation,
  OperationStatus,
  Paginated,
  SendMessageInput,
  MediaSendContent,
  StoreBatchResult,
  StoreCategory,
  StoreOrder,
  StoreOrderCreate,
  StoreOrderCreateResult,
  StoreOrderStatus,
  StoreShippingOptionList,
  ListStoreOrdersParams,
  StoreProduct,
  StoreProductPatch,
  StoreProductWrite,
  StoreSummary,
  Template,
  TemplateSendContent,
  StoreProductListParams,
  StoreCategoryWrite,
  StoreCategoryPatch,
  CrmStage,
  CrmStageListParams,
  CrmStageWrite,
  CrmStagePatch,
  CrmOpportunity,
  CrmOpportunityWrite,
  CrmOpportunityPatch,
  ListCrmOpportunitiesParams,
} from './types.js'

export interface WazapiClientOptions {
  /** Bearer token issued in Settings → Wazapi API (starts with `waz_api_`). */
  token: string
  /** API base URL. Defaults to the production endpoint. */
  baseUrl?: string
  /** Custom fetch implementation (defaults to global fetch). */
  fetch?: typeof fetch
  /** Per-request timeout in milliseconds. Defaults to 30000. */
  timeoutMs?: number
  /**
   * Generates the Idempotency-Key for write operations when the caller does not
   * pass one. Defaults to `crypto.randomUUID()`.
   */
  idempotencyKeyFactory?: () => string
}

const TERMINAL_STATUSES: OperationStatus[] = ['succeeded', 'failed']

export interface WaitForOperationOptions {
  /** Poll interval in milliseconds. Defaults to 1000. */
  intervalMs?: number
  /** Max time to wait before throwing a timeout error. Defaults to 60000. */
  timeoutMs?: number
  /**
   * Treat `waiting` as terminal too (a flow that parked on user input). Defaults
   * to false, so `waitForOperation` only resolves on `succeeded`/`failed`.
   */
  resolveOnWaiting?: boolean
}

export class WazapiClient {
  private readonly token: string
  private readonly baseUrl: string
  private readonly fetchImpl: typeof fetch
  private readonly timeoutMs: number
  private readonly newIdempotencyKey: () => string

  constructor(options: WazapiClientOptions) {
    if (!options.token) throw new Error('WazapiClient requires a token.')
    this.token = options.token
    this.baseUrl = (options.baseUrl ?? 'https://wazapi.io/api/v1').replace(/\/$/, '')
    this.fetchImpl = options.fetch ?? globalThis.fetch
    if (!this.fetchImpl)
      throw new Error('No fetch implementation available; pass options.fetch on Node < 18.')
    this.timeoutMs = options.timeoutMs ?? 30_000
    this.newIdempotencyKey =
      options.idempotencyKeyFactory ?? (() => globalThis.crypto.randomUUID())
  }

  /** Read only: requires ai_agents:read. Does not execute AI. */
  async getAiAgentUsage(params: AiAgentUsageParams = {}): Promise<AiAgentUsage> {
    const body = await this.request<Envelope<AiAgentUsage>>('GET', this.withQuery('/ai-agents/usage', params))
    return body.data
  }

  /** Read defaults without enabling or generating anything. */
  async getAiSummarySettings(): Promise<AiSummarySettings> {
    return (await this.request<Envelope<AiSummarySettings>>('GET', '/settings/ai-summaries')).data
  }
  /** Explicit write scope required; enabling may incur future model charges. */
  async updateAiSummarySettings(input: Partial<AiSummarySettings>): Promise<AiSummarySettings> {
    return (await this.request<Envelope<AiSummarySettings>>('PATCH', '/settings/ai-summaries', {body:input})).data
  }
  async getAiSummaryCosts(): Promise<AiSummaryCosts> {
    return (await this.request<Envelope<AiSummaryCosts>>('GET', '/ai-summaries/costs')).data
  }

  // ---- Channels ---------------------------------------------------------

  async listChannels(): Promise<Channel[]> {
    const body = await this.request<Envelope<Channel[]>>('GET', '/channels')
    return body.data
  }

  /** Reads the company's unanswered mode and optional overdue fallback (API 1.32). */
  async getInboxResponseSettings(): Promise<InboxResponseSettings> {
    const body = await this.request<Envelope<InboxResponseSettings>>('GET', '/inbox-response-settings')
    return body.data
  }

  /** Omit overdueMinutes to preserve it; null disables the company fallback. Group deadlines take precedence. */
  async updateInboxResponseSettings(input: InboxResponseSettingsInput): Promise<InboxResponseSettings> {
    const body = await this.request<Envelope<InboxResponseSettings>>('PUT', '/inbox-response-settings', { body: input })
    return body.data
  }


  /** Requires contacts:read plus settings.general for the token creator. */
  async getOwnerlessFallback(): Promise<OwnerlessFallbackSettings> {
    return (await this.request<Envelope<OwnerlessFallbackSettings>>('GET','/settings/ownerless-fallback')).data
  }
  /** Omitted fields preserve; null disables the default or clears a channel override. */
  async updateOwnerlessFallback(input:OwnerlessFallbackPatch): Promise<OwnerlessFallbackSettings> {
    return (await this.request<Envelope<OwnerlessFallbackSettings>>('PATCH','/settings/ownerless-fallback',{body:input})).data
  }
  /** Read-only preview by default. false explicitly assigns eligible current stock. */
  async applyOwnerlessFallback(input:{dryRun?:boolean}={}): Promise<OwnerlessFallbackApplication> {
    return (await this.request<Envelope<OwnerlessFallbackApplication>>('POST','/settings/ownerless-fallback/apply',{body:{...input,dryRun:input.dryRun??true}})).data
  }
  /** Read-only channel metadata, newest first; after is the previous nextCursor. */
  async listChannelEvents(channelUuid: string, params: ListChannelEventsParams = {}): Promise<ChannelEventPage> {
    return this.request<ChannelEventPage>('GET', this.withQuery('/channels/' + encode(channelUuid) + '/events', params))
  }

  // ---- Contacts ---------------------------------------------------------

  listContacts(params: ListContactsParams = {}): Promise<Paginated<Contact>> {
    return this.request('GET', this.withQuery('/contacts', params))
  }

  async getContact(uuid: string): Promise<Contact> {
    const body = await this.request<Envelope<Contact>>('GET', `/contacts/${encode(uuid)}`)
    return body.data
  }

  async updateContact(uuid: string, input: ContactWrite): Promise<Contact> {
    const body = await this.request<Envelope<Contact>>(
      'PATCH',
      `/contacts/${encode(uuid)}`,
      { body: input }
    )
    return body.data
  }

  /** Creates a contact from its phone, or returns the existing one with the fields applied (API 1.12). */
  async createContact(
    input: ContactWrite & { phone: string; external_id?: string }
  ): Promise<Contact> {
    const body = await this.request<Envelope<Contact>>('POST', '/contacts', { body: input })
    return body.data
  }

  /** Blocks the contact in both directions; needs the `contacts:block` scope (API 1.13). */
  async blockContact(uuid: string): Promise<Contact> {
    const body = await this.request<Envelope<Contact>>(
      'POST',
      `/contacts/${encode(uuid)}/block`
    )
    return body.data
  }

  /** Removes the block; `meta_blocked` still true means Meta refused — retry (API 1.13). */
  async unblockContact(uuid: string): Promise<Contact> {
    const body = await this.request<Envelope<Contact>>(
      'DELETE',
      `/contacts/${encode(uuid)}/block`
    )
    return body.data
  }

  async upsertContactByExternalId(
    externalId: string,
    input: ContactWrite & { phone: string }
  ): Promise<Contact> {
    const body = await this.request<Envelope<Contact>>(
      'PUT',
      `/contacts/external/${encode(externalId)}`,
      { body: input }
    )
    return body.data
  }

  // ---- Templates --------------------------------------------------------

  listTemplates(params: ListParams = {}): Promise<Paginated<Template>> {
    return this.request('GET', this.withQuery('/templates', params))
  }

  async getTemplate(name: string): Promise<Template> {
    const body = await this.request<Envelope<Template>>('GET', `/templates/${encode(name)}`)
    return body.data
  }

  // ---- Flows ------------------------------------------------------------

  listFlows(params: ListParams = {}): Promise<Paginated<Flow>> {
    return this.request('GET', this.withQuery('/flows', params))
  }

  async getFlow(uuid: string): Promise<Flow> {
    const body = await this.request<Envelope<Flow>>('GET', `/flows/${encode(uuid)}`)
    return body.data
  }

  executeFlow(
    flowUuid: string,
    input: ExecuteFlowInput,
    idempotencyKey?: string
  ): Promise<AcceptedResult> {
    return this.accept('POST', `/flows/${encode(flowUuid)}/executions`, input, idempotencyKey)
  }

  /** No implicit apply: dryRun is required. Follow nextCursor until null. Requires contacts:write/settings.general. */
  async recalculateTeamReply(input: TeamReplyRecalculationInput): Promise<TeamReplyRecalculationResult> {
    return (await this.request<Envelope<TeamReplyRecalculationResult>>('POST', '/inbox-response-settings/recalculate', { body: input })).data
  }

  // ---- Conversations ----------------------------------------------------

  /** One emoji acknowledges the message; empty string or null removes your reaction. */
  async reactToMessage(conversationUuid:string,messageUuid:string,emoji:string|null):Promise<MessageReactionResult> {
    const body=await this.request<Envelope<MessageReactionResult>>('POST',
      '/conversations/'+encodeURIComponent(conversationUuid)+'/messages/'+encodeURIComponent(messageUuid)+'/reaction',
      {body:{emoji}})
    return body.data
  }

  listConversations(params: ListParams = {}): Promise<Paginated<Conversation>> {
    return this.request('GET', this.withQuery('/conversations', params))
  }

  /**
   * Everything about the chat in one call: contact (with tags), assigned agent
   * and group, channel, status and counters. Pass `options.include = 'messages'`
   * to embed the first page of messages — audio messages carry their
   * `transcript` as a first-level field.
   */
  async getConversation(
    uuid: string,
    options: { include?: 'messages' } = {}
  ): Promise<ConversationDetail> {
    const path = options.include
      ? `/conversations/${encode(uuid)}?include=${options.include}`
      : `/conversations/${encode(uuid)}`
    const body = await this.request<Envelope<ConversationDetail>>('GET', path)
    return body.data
  }

  listMessages(conversationUuid: string, params: ListParams = {}): Promise<Paginated<Message>> {
    return this.request(
      'GET',
      this.withQuery(`/conversations/${encode(conversationUuid)}/messages`, params)
    )
  }

  // ---- Messages ---------------------------------------------------------

  sendMessage(input: SendMessageInput, idempotencyKey?: string): Promise<AcceptedResult> {
    return this.accept('POST', '/messages', input, idempotencyKey)
  }

  /**
   * Convenience wrapper for a plain text send. Pass `null` as `channelUuid` to
   * let the API pick the company's single WhatsApp channel.
   */
  sendText(
    channelUuid: string | null,
    phone: string,
    text: string,
    idempotencyKey?: string
  ): Promise<AcceptedResult> {
    return this.sendMessage(
      { ...channelField(channelUuid), recipient: { phone }, type: 'text', content: { text } },
      idempotencyKey
    )
  }

  /**
   * Convenience wrapper for a template send: body values in `parameters` (or
   * `components.body`), plus `components.header` / `components.buttons` when
   * the template's `variables` asks for them.
   * Pass `null` as `channelUuid` to let the API pick the company's single
   * WhatsApp channel.
   */
  sendTemplate(
    channelUuid: string | null,
    phone: string,
    template: TemplateSendContent,
    idempotencyKey?: string
  ): Promise<AcceptedResult> {
    return this.sendMessage(
      { ...channelField(channelUuid), recipient: { phone }, type: 'template', content: template },
      idempotencyKey
    )
  }

  /** Library media send (API 1.31). Poll the operation before sending follow-up text. */
  sendMedia(
    channelUuid: string | null,
    phone: string,
    content: MediaSendContent,
    idempotencyKey?: string,
    replyToMessageUuid?: string
  ): Promise<AcceptedResult> {
    return this.sendMessage(
      {
        ...channelField(channelUuid), recipient: { phone }, type: 'media', content,
        ...(replyToMessageUuid ? { replyToMessageUuid } : {}),
      },
      idempotencyKey
    )
  }

  // ---- Store ------------------------------------------------------------

  /** Storefront status, public URL and product/order counts. Requires `store:read`. */
  async getStore(): Promise<StoreSummary> {
    const body = await this.request<Envelope<StoreSummary>>('GET', '/store')
    return body.data
  }

  listStoreProducts(params: StoreProductListParams = {}): Promise<Paginated<StoreProduct>> {
    return this.request('GET', this.withQuery('/store/products', params))
  }

  async getStoreProduct(uuid: string): Promise<StoreProduct> {
    const body = await this.request<Envelope<StoreProduct>>(
      'GET',
      `/store/products/${encode(uuid)}`
    )
    return body.data
  }

  async createStoreProduct(input: StoreProductWrite): Promise<StoreProduct> {
    const body = await this.request<Envelope<StoreProduct>>('POST', '/store/products', {
      body: input,
    })
    return body.data
  }

  /**
   * Partial update since API 1.6: omitted fields keep their current value
   * (before 1.6 they were reset to their defaults).
   */
  async updateStoreProduct(uuid: string, input: StoreProductPatch): Promise<StoreProduct> {
    const body = await this.request<Envelope<StoreProduct>>(
      'PATCH',
      `/store/products/${encode(uuid)}`,
      { body: input }
    )
    return body.data
  }

  /**
   * Permanently deletes the product, its variants and hosted images. Past orders
   * keep a snapshot of their items. Requires `store:write`. (API 1.6)
   */
  async deleteStoreProduct(uuid: string): Promise<void> {
    await this.request<null>('DELETE', `/store/products/${encode(uuid)}`)
  }

  /** Store categories, to discover the `category_uuid` of a product. `external_id` is an exact lookup. (API 1.6, filter 1.15) */
  async listStoreCategories(params: { external_id?: string } = {}): Promise<StoreCategory[]> {
    const body = await this.request<Envelope<StoreCategory[]>>(
      'GET',
      this.withQuery('/store/categories', params)
    )
    return body.data
  }

  /** Creates a category; send `external_id` to link it to your catalog and reference it from products with `category_external_id`. (API 1.15) */
  async createStoreCategory(input: StoreCategoryWrite): Promise<StoreCategory> {
    const body = await this.request<Envelope<StoreCategory>>('POST', '/store/categories', {
      body: input,
    })
    return body.data
  }

  /** Partial update: an omitted field keeps its value. (API 1.15) */
  async updateStoreCategory(uuid: string, input: StoreCategoryPatch): Promise<StoreCategory> {
    const body = await this.request<Envelope<StoreCategory>>(
      'PATCH',
      `/store/categories/${encode(uuid)}`,
      { body: input }
    )
    return body.data
  }

  /** Deletes the category; its products are kept and become uncategorised. (API 1.15) */
  async deleteStoreCategory(uuid: string): Promise<void> {
    await this.request<null>('DELETE', `/store/categories/${encode(uuid)}`)
  }

  /** Stages of every CRM board (or of `group_uuid`), in board order. Requires `crm:read`. (API 1.20) */
  async listCrmStages(params: CrmStageListParams = {}): Promise<CrmStage[]> {
    const body = await this.request<Envelope<CrmStage[]>>(
      'GET',
      this.withQuery('/crm/stages', params)
    )
    return body.data
  }

  /** Adds an `open` stage before Won/Lost; send `external_id` to link it to your system. Requires `crm:write`. (API 1.20) */
  async createCrmStage(input: CrmStageWrite): Promise<CrmStage> {
    const body = await this.request<Envelope<CrmStage>>('POST', '/crm/stages', { body: input })
    return body.data
  }

  /** Partial update of a stage, Won/Lost included. Requires `crm:write`. (API 1.20) */
  async updateCrmStage(uuid: string, input: CrmStagePatch): Promise<CrmStage> {
    const body = await this.request<Envelope<CrmStage>>('PATCH', `/crm/stages/${encode(uuid)}`, {
      body: input,
    })
    return body.data
  }

  /**
   * Deletes an open stage. When it holds opportunities, `replacementStageUuid`
   * (a stage of the same board) receives them. Requires `crm:write`. (API 1.21)
   */
  async deleteCrmStage(uuid: string, replacementStageUuid?: string): Promise<void> {
    await this.request<null>(
      'DELETE',
      this.withQuery(`/crm/stages/${encode(uuid)}`, {
        replacement_stage_uuid: replacementStageUuid,
      })
    )
  }

  /** Sets the full stage order of a board; Won and Lost stay last. Returns the stages in order. (API 1.21) */
  async reorderCrmStages(groupUuid: string, stageUuids: string[]): Promise<CrmStage[]> {
    const body = await this.request<Envelope<CrmStage[]>>('PUT', '/crm/stage-order', {
      body: { group_uuid: groupUuid, stage_uuids: stageUuids },
    })
    return body.data
  }

  /** Non-archived opportunities, oldest first. Requires `crm:read`. (API 1.21) */
  listCrmOpportunities(
    params: ListCrmOpportunitiesParams = {}
  ): Promise<Paginated<CrmOpportunity>> {
    return this.request('GET', this.withQuery('/crm/opportunities', params))
  }

  async getCrmOpportunity(uuid: string): Promise<CrmOpportunity> {
    const body = await this.request<Envelope<CrmOpportunity>>(
      'GET',
      `/crm/opportunities/${encode(uuid)}`
    )
    return body.data
  }

  /** Creates an opportunity in an open stage. Requires `crm:write`. (API 1.21) */
  async createCrmOpportunity(input: CrmOpportunityWrite): Promise<CrmOpportunity> {
    const body = await this.request<Envelope<CrmOpportunity>>('POST', '/crm/opportunities', {
      body: input,
    })
    return body.data
  }

  /** Partial update; a stage moves (and Won/Lost close) the opportunity. (API 1.21) */
  async updateCrmOpportunity(uuid: string, input: CrmOpportunityPatch): Promise<CrmOpportunity> {
    const body = await this.request<Envelope<CrmOpportunity>>(
      'PATCH',
      `/crm/opportunities/${encode(uuid)}`,
      { body: input }
    )
    return body.data
  }

  /** Archives the opportunity (no permanent deletion); its `external_id` can be reused. (API 1.21) */
  async archiveCrmOpportunity(uuid: string): Promise<void> {
    await this.request<null>('DELETE', `/crm/opportunities/${encode(uuid)}`)
  }

  /**
   * Creates or updates up to 100 products in one call with a per-item result —
   * one invalid product does not fail the batch. Items whose `import_handle`
   * matches an existing product UPDATE it instead of creating a duplicate: this
   * is the migration path for an external catalog (Shopify, an ERP).
   */
  batchStoreProducts(products: StoreProductWrite[]): Promise<StoreBatchResult> {
    return this.request('POST', '/store/products/batch', { body: { products } })
  }

  listStoreCoupons(page = 1): Promise<StoreCouponPage> {
    return this.request('GET', `/store/coupons?page=${encode(String(page))}`)
  }
  createStoreCoupon(input: StoreCouponInput): Promise<StoreCoupon> {
    return this.request('POST', '/store/coupons', { body: input })
  }
  updateStoreCoupon(uuid: string, input: StoreCouponInput & { version: number }): Promise<StoreCoupon> {
    return this.request('PUT', `/store/coupons/${encode(uuid)}`, { body: input })
  }
  getAgentDiscountPolicy(agentUuid: string): Promise<AgentDiscountPolicy | null> {
    return this.request('GET', `/store/discounts/agents/${encode(agentUuid)}`)
  }
  saveAgentDiscountPolicy(agentUuid: string, input: AgentDiscountPolicyInput): Promise<AgentDiscountPolicy> {
    return this.request('PUT', `/store/discounts/agents/${encode(agentUuid)}`, { body: input })
  }

  /** Orders, oldest first. Filters `source`, `payment_method`, `query` and `updated_after` since API 1.19. */
  listStoreOrders(params: ListStoreOrdersParams = {}): Promise<Paginated<StoreOrder>> {
    return this.request('GET', this.withQuery('/store/orders', params))
  }

  /** Active shipping options, to discover `shipping_option_uuid`. Requires `store:read`. (API 1.19) */
  listStoreShippingOptions(): Promise<StoreShippingOptionList> {
    return this.request('GET', '/store/shipping-options')
  }

  /**
   * Records a sale closed outside the storefront (`source: 'api'`). Requires the
   * `store:orders` scope: the order runs the store automation, which may send
   * WhatsApp messages to the buyer. Reusing the idempotency key with the same
   * body returns the same order with `replayed: true` and no side effect.
   * (API 1.19)
   */
  async createStoreOrder(
    input: StoreOrderCreate,
    idempotencyKey?: string
  ): Promise<StoreOrderCreateResult> {
    const { data, headers } = await this.rawRequest<Envelope<StoreOrder>>('POST', '/store/orders', {
      body: input,
      headers: { 'Idempotency-Key': idempotencyKey ?? this.newIdempotencyKey() },
    })
    return { order: data.data, replayed: headers.get('Idempotent-Replayed') === 'true' }
  }

  async getStoreOrder(uuid: string): Promise<StoreOrder> {
    const body = await this.request<Envelope<StoreOrder>>('GET', `/store/orders/${encode(uuid)}`)
    return body.data
  }

  /**
   * Transitions an order through its state machine (novo→confirmado→pago→entregue,
   * cancel from any non-terminal state). An invalid transition throws a
   * `WazapiError` with code `invalid_status_transition` (422); an order charged
   * through the payment gateway throws `gateway_managed` (409, API 1.19).
   * Cancelling restores tracked stock.
   */
  async updateStoreOrderStatus(
    uuid: string,
    status: Exclude<StoreOrderStatus, 'novo'>
  ): Promise<StoreOrder> {
    const body = await this.request<Envelope<StoreOrder>>(
      'POST',
      `/store/orders/${encode(uuid)}/status`,
      { body: { status } }
    )
    return body.data
  }

  // ---- Operations -------------------------------------------------------

  async getOperation(uuid: string): Promise<Operation> {
    const body = await this.request<Envelope<Operation>>('GET', `/operations/${encode(uuid)}`)
    return body.data
  }

  /**
   * Polls an operation until it reaches a terminal status. Resolves with the final
   * operation (which may be `failed` — inspect `operation.error`) or throws on timeout.
   */
  async waitForOperation(
    uuid: string,
    options: WaitForOperationOptions = {}
  ): Promise<Operation> {
    const interval = options.intervalMs ?? 1000
    const deadline = Date.now() + (options.timeoutMs ?? 60_000)
    const terminal = options.resolveOnWaiting
      ? [...TERMINAL_STATUSES, 'waiting' as OperationStatus]
      : TERMINAL_STATUSES
    for (;;) {
      const operation = await this.getOperation(uuid)
      if (terminal.includes(operation.status)) return operation
      if (Date.now() >= deadline)
        throw new WazapiError({
          status: 0,
          code: 'operation_wait_timeout',
          message: `Operation ${uuid} did not reach a terminal status in time.`,
        })
      await delay(Math.min(interval, Math.max(0, deadline - Date.now())))
    }
  }

  // ---- Internals --------------------------------------------------------

  private async accept(
    method: string,
    path: string,
    body: unknown,
    idempotencyKey?: string
  ): Promise<AcceptedResult> {
    const key = idempotencyKey ?? this.newIdempotencyKey()
    const { data, headers } = await this.rawRequest<Envelope<Operation>>(method, path, {
      body,
      headers: { 'Idempotency-Key': key },
    })
    return { operation: data.data, replayed: headers.get('Idempotent-Replayed') === 'true' }
  }

  private async request<T>(
    method: string,
    path: string,
    init: { body?: unknown; headers?: Record<string, string> } = {}
  ): Promise<T> {
    const { data } = await this.rawRequest<T>(method, path, init)
    return data
  }

  private async rawRequest<T>(
    method: string,
    path: string,
    init: { body?: unknown; headers?: Record<string, string> } = {}
  ): Promise<{ data: T; headers: Headers }> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), this.timeoutMs)
    let response: Response
    try {
      response = await this.fetchImpl(`${this.baseUrl}${path}`, {
        method,
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${this.token}`,
          Accept: 'application/json',
          ...(init.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
          ...init.headers,
        },
        body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      })
    } catch (cause) {
      clearTimeout(timer)
      if (cause instanceof Error && cause.name === 'AbortError')
        throw new WazapiError({
          status: 0,
          code: 'request_timeout',
          message: `Request to ${path} timed out after ${this.timeoutMs}ms.`,
        })
      throw new WazapiError({
        status: 0,
        code: 'network_error',
        message: cause instanceof Error ? cause.message : 'Network request failed.',
      })
    }
    clearTimeout(timer)

    const text = await response.text()
    const parsed = text ? safeJson(text) : null

    if (!response.ok) {
      const envelope = (parsed as { error?: Record<string, unknown> } | null)?.error
      const retryAfterHeader = response.headers.get('Retry-After')
      throw new WazapiError({
        status: response.status,
        code: (envelope?.code as string) ?? 'http_error',
        message: (envelope?.message as string) ?? `Request failed with status ${response.status}.`,
        requestId: (envelope?.request_id as string) ?? null,
        details: envelope?.details ?? null,
        retryAfter: retryAfterHeader ? Number(retryAfterHeader) : null,
      })
    }

    return { data: parsed as T, headers: response.headers }
  }

  private withQuery(path: string, params: object): string {
    const search = new URLSearchParams()
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null) search.set(key, String(value))
    }
    const qs = search.toString()
    return qs ? `${path}?${qs}` : path
  }
}

function encode(segment: string): string {
  return encodeURIComponent(segment)
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** Omit the key entirely when null: the API treats an absent field as "resolve it". */
function channelField(channelUuid: string | null): { channel_uuid?: string } {
  return channelUuid ? { channel_uuid: channelUuid } : {}
}
