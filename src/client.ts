import { WazapiError } from './error.js'
import type {
  StoreCoupon, StoreCouponInput, StoreCouponPage, AgentDiscountPolicy, AgentDiscountPolicyInput,
  AcceptedResult,
  Channel,
  Contact,
  ContactWrite,
  Conversation,
  ConversationDetail,
  Envelope,
  ExecuteFlowInput,
  Flow,
  ListContactsParams,
  ListParams,
  Message,
  Operation,
  OperationStatus,
  Paginated,
  SendMessageInput,
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
  WebhookEndpoint,
  WebhookEndpointWithSecret,
  WebhookEndpointWrite,
  AiAgentQueryResult,
  AiAgentUsage,
  AiAgentUsageParams,
  AiDutySettings,
  AiSummaryCostReport,
  AiSummaryPreview,
  AiSummaryPreviewInput,
  AiSummarySettings,
  AiSummarySettingsPatch,
  ChannelEventListParams,
  ChannelEventPage,
  ChannelRetirementResult,
  CompanyQueryCreate,
  CompanyQueryDeleteResult,
  CompanyQueryList,
  CompanyQueryPatch,
  CompanyQueryResult,
  CompanyQueryTestResult,
  ConversationFieldOptions,
  ConversationPanel,
  ConversationPanelPatch,
  CrmOpportunityUpsert,
  CrmOpportunityUpsertBatchResult,
  CrmOpportunityUpsertItem,
  CrmOpportunityUpsertResult,
  CustomFieldCreate,
  CustomFieldDefinition,
  CustomFieldPatch,
  EntryKind,
  EntrySettings,
  EntryTargets,
  FieldOption,
  FlowEntries,
  FlowEntryTargets,
  GroupDistributionReport,
  InboxResponseSettings,
  KnowledgeSourceList,
  KnowledgeSourceResult,
  KnowledgeUrlCreate,
  KnowledgeUrlPatch,
  MessageReactionResult,
  OwnerlessFallbackApplication,
  OwnerlessFallbackPatch,
  OwnerlessFallbackSettings,
  ReplyGuardHitParams,
  ReplyGuardHits,
  ReplyGuardRuleCreate,
  ReplyGuardRulePatch,
  ReplyGuardRules,
  ReplyGuardSaved,
  StaleSessionSettings,
  StaleSessionSettingsPatch,
  SupportGroup,
  SupportGroupPatch,
  TeamReplyRecalculation,
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

  // ---- Channels ---------------------------------------------------------

  async listChannels(): Promise<Channel[]> {
    const body = await this.request<Envelope<Channel[]>>('GET', '/channels')
    return body.data
  }

  /** Status transitions and inbound dropped while down, newest first. Requires `channels:read`. (API 1.32) */
  listChannelEvents(uuid: string, params: ChannelEventListParams = {}): Promise<ChannelEventPage> {
    return this.request('GET', this.withQuery(`/channels/${encode(uuid)}/events`, params))
  }

  /**
   * Marks a disconnected channel as retired (silences its alerts) or restores it;
   * a connected channel answers 409. Requires `channels:write`. (API 1.37)
   */
  setChannelRetired(uuid: string, retired: boolean): Promise<ChannelRetirementResult> {
    return this.request('PUT', `/channels/${encode(uuid)}/retirement`, { body: { retired } })
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

  /** Pass `flow_session_uuid` to resolve the monitoring rule inherited by that session's callers. */
  async getFlow(uuid: string, options: { flow_session_uuid?: string } = {}): Promise<Flow> {
    const body = await this.request<Envelope<Flow>>(
      'GET',
      this.withQuery(`/flows/${encode(uuid)}`, options)
    )
    return body.data
  }

  executeFlow(
    flowUuid: string,
    input: ExecuteFlowInput,
    idempotencyKey?: string
  ): Promise<AcceptedResult> {
    return this.accept('POST', `/flows/${encode(flowUuid)}/executions`, input, idempotencyKey)
  }

  // ---- Conversations ----------------------------------------------------

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

  /**
   * Sets conversation custom field values; `null` clears one. A select field
   * takes a listed value or its unambiguous label. Requires `conversations:write`. (API 1.25)
   */
  async updateConversationFields(
    uuid: string,
    customFields: Record<string, unknown>
  ): Promise<{ uuid: string; custom_fields: Record<string, unknown> }> {
    const body = await this.request<Envelope<{ uuid: string; custom_fields: Record<string, unknown> }>>(
      'PATCH',
      `/conversations/${encode(uuid)}/fields`,
      { body: { custom_fields: customFields } }
    )
    return body.data
  }

  /**
   * Reacts with one emoji; `null` or `''` removes the reaction. Synchronous:
   * check `ok`, not only the HTTP status. Requires `messages:write`.
   */
  async reactToMessage(
    conversationUuid: string,
    messageUuid: string,
    emoji: string | null
  ): Promise<MessageReactionResult> {
    const body = await this.request<Envelope<MessageReactionResult>>(
      'POST',
      `/conversations/${encode(conversationUuid)}/messages/${encode(messageUuid)}/reaction`,
      { body: { emoji } }
    )
    return body.data
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
   * Creates or updates the opportunity with your `externalId`, moving it between
   * boards on the same uuid. The idempotency key is kept 24 hours: a replay
   * returns the saved response with `replayed: true`. Requires `crm:write`. (API 1.27)
   */
  async upsertCrmOpportunityByExternalId(
    externalId: string,
    input: CrmOpportunityUpsert,
    idempotencyKey?: string
  ): Promise<CrmOpportunityUpsertResult & { replayed: boolean }> {
    const { data, headers } = await this.rawRequest<Envelope<CrmOpportunityUpsertResult>>(
      'PUT',
      `/crm/opportunities/by-external-id/${encode(externalId)}`,
      { body: input, headers: { 'Idempotency-Key': idempotencyKey ?? this.newIdempotencyKey() } }
    )
    return { ...data.data, replayed: headers.get('Idempotent-Replayed') === 'true' }
  }

  /** Upserts up to 100 opportunities with a per-item result; one invalid item does not fail the rest. (API 1.27) */
  async upsertCrmOpportunitiesBatch(
    items: CrmOpportunityUpsertItem[],
    idempotencyKey?: string
  ): Promise<{ results: CrmOpportunityUpsertBatchResult[]; replayed: boolean }> {
    const { data, headers } = await this.rawRequest<Envelope<CrmOpportunityUpsertBatchResult[]>>(
      'POST',
      '/crm/opportunities/upsert-batch',
      { body: { items }, headers: { 'Idempotency-Key': idempotencyKey ?? this.newIdempotencyKey() } }
    )
    return { results: data.data, replayed: headers.get('Idempotent-Replayed') === 'true' }
  }

  // ---- Groups -----------------------------------------------------------

  /** Support groups (each one is also a CRM board). Requires `groups:read`. (API 1.24) */
  listGroups(params: { after?: string; limit?: number } = {}): Promise<Paginated<SupportGroup>> {
    return this.request('GET', this.withQuery('/groups', params))
  }

  async getGroup(uuid: string): Promise<SupportGroup> {
    const body = await this.request<Envelope<SupportGroup>>('GET', `/groups/${encode(uuid)}`)
    return body.data
  }

  /** Waiting alert, distribution strategy and queue options; never changes flows. Requires `groups:write`. */
  async updateGroup(uuid: string, input: SupportGroupPatch): Promise<SupportGroup> {
    const body = await this.request<Envelope<SupportGroup>>('PATCH', `/groups/${encode(uuid)}`, {
      body: input,
    })
    return body.data
  }

  /** Who received what on `day` (company timezone, defaults to today) and the queue figures. (API 1.27) */
  async getGroupDistributionReport(
    uuid: string,
    params: { day?: string } = {}
  ): Promise<GroupDistributionReport> {
    const body = await this.request<Envelope<GroupDistributionReport>>(
      'GET',
      this.withQuery(`/groups/${encode(uuid)}/distribution`, params)
    )
    return body.data
  }

  // ---- Custom fields and context panel ----------------------------------

  /** Contact and conversation custom field definitions. Requires `contacts:read` and `settings.general`. (API 1.24) */
  async listCustomFields(): Promise<CustomFieldDefinition[]> {
    const body = await this.request<Envelope<CustomFieldDefinition[]>>('GET', '/custom-fields')
    return body.data
  }

  async createCustomField(input: CustomFieldCreate): Promise<CustomFieldDefinition> {
    const body = await this.request<Envelope<CustomFieldDefinition>>('POST', '/custom-fields', {
      body: input,
    })
    return body.data
  }

  /** Partial update: an omitted attribute keeps its value. */
  async updateCustomField(uuid: string, input: CustomFieldPatch): Promise<CustomFieldDefinition> {
    const body = await this.request<Envelope<CustomFieldDefinition>>(
      'PATCH',
      `/custom-fields/${encode(uuid)}`,
      { body: input }
    )
    return body.data
  }

  /** Options of a conversation select field. Requires `fields:read`. (API 1.25) */
  async getConversationFieldOptions(key: string): Promise<ConversationFieldOptions> {
    const body = await this.request<Envelope<ConversationFieldOptions>>(
      'GET',
      `/conversation-fields/${encode(key)}/options`
    )
    return body.data
  }

  /**
   * Replaces the whole option list (up to 2000 values). Stored values never
   * change and no webhook is sent. Requires `fields:write`. (API 1.25)
   */
  async replaceConversationFieldOptions(
    key: string,
    options: FieldOption[]
  ): Promise<ConversationFieldOptions> {
    const body = await this.request<Envelope<ConversationFieldOptions>>(
      'PUT',
      `/conversation-fields/${encode(key)}/options`,
      { body: { options } }
    )
    return body.data
  }

  /** Layout of the conversation context panel. (API 1.24) */
  async getConversationPanel(): Promise<ConversationPanel> {
    const body = await this.request<Envelope<ConversationPanel>>('GET', '/context-panel')
    return body.data
  }

  /** Omitted options keep their value; a supplied array replaces its list. */
  async updateConversationPanel(input: ConversationPanelPatch): Promise<ConversationPanel> {
    const body = await this.request<Envelope<ConversationPanel>>('PUT', '/context-panel', {
      body: input,
    })
    return body.data
  }

  // ---- Entries ----------------------------------------------------------

  /** Whether public entries (comments, mentions) get their own routing. Requires `entries:read`. (API 1.26) */
  async getEntrySettings(): Promise<EntrySettings> {
    const body = await this.request<Envelope<EntrySettings>>('GET', '/entry-settings')
    return body.data
  }

  async updateEntrySettings(input: EntrySettings): Promise<EntrySettings> {
    const body = await this.request<Envelope<EntrySettings>>('PATCH', '/entry-settings', {
      body: input,
    })
    return body.data
  }

  async getFlowEntries(uuid: string): Promise<FlowEntryTargets> {
    const body = await this.request<Envelope<FlowEntryTargets>>('GET', `/flows/${encode(uuid)}/entries`)
    return body.data
  }

  async updateFlowEntries(uuid: string, supportedEntries: FlowEntries): Promise<FlowEntryTargets> {
    const body = await this.request<Envelope<FlowEntryTargets>>(
      'PATCH',
      `/flows/${encode(uuid)}/entries`,
      { body: { supported_entries: supportedEntries } }
    )
    return body.data
  }

  async getKeywordEntries(uuid: string): Promise<EntryTargets> {
    const body = await this.request<Envelope<EntryTargets>>('GET', `/keywords/${encode(uuid)}/entries`)
    return body.data
  }

  /** An empty list means every entry. */
  async updateKeywordEntries(uuid: string, supportedEntries: EntryKind[]): Promise<EntryTargets> {
    const body = await this.request<Envelope<EntryTargets>>(
      'PATCH',
      `/keywords/${encode(uuid)}/entries`,
      { body: { supported_entries: supportedEntries } }
    )
    return body.data
  }

  async getAiAgentEntries(uuid: string): Promise<EntryTargets> {
    const body = await this.request<Envelope<EntryTargets>>('GET', `/ai-agents/${encode(uuid)}/entries`)
    return body.data
  }

  /** An empty list denies every entry; public entries need an explicit opt-in. */
  async updateAiAgentEntries(uuid: string, supportedEntries: EntryKind[]): Promise<EntryTargets> {
    const body = await this.request<Envelope<EntryTargets>>(
      'PATCH',
      `/ai-agents/${encode(uuid)}/entries`,
      { body: { supported_entries: supportedEntries } }
    )
    return body.data
  }

  // ---- Inbox and automation settings ------------------------------------

  /** What counts as unanswered and the overdue threshold. Requires `contacts:read` and `settings.general`. */
  async getInboxResponseSettings(): Promise<InboxResponseSettings> {
    const body = await this.request<Envelope<InboxResponseSettings>>('GET', '/inbox-response-settings')
    return body.data
  }

  async updateInboxResponseSettings(input: InboxResponseSettings): Promise<InboxResponseSettings> {
    const body = await this.request<Envelope<InboxResponseSettings>>(
      'PUT',
      '/inbox-response-settings',
      { body: input }
    )
    return body.data
  }

  /**
   * Previews (`dryRun: true`) or applies the `team_reply` waiting markers to
   * open conversations. Follow `nextCursor` until `null`.
   */
  async recalculateTeamReply(input: {
    dryRun: boolean
    cursor?: string
    limit?: number
  }): Promise<TeamReplyRecalculation> {
    const body = await this.request<Envelope<TeamReplyRecalculation>>(
      'POST',
      '/inbox-response-settings/recalculate',
      { body: input }
    )
    return body.data
  }

  /** Stalled bot watchdog. Requires `settings:read`. (API 1.28) */
  async getStaleSessionSettings(): Promise<StaleSessionSettings> {
    const body = await this.request<Envelope<StaleSessionSettings>>('GET', '/settings/stale-sessions')
    return body.data
  }

  /** Enabling may start flows or assign groups on the next minute sweep. Requires `settings:write`. */
  async updateStaleSessionSettings(input: StaleSessionSettingsPatch): Promise<StaleSessionSettings> {
    const body = await this.request<Envelope<StaleSessionSettings>>(
      'PATCH',
      '/settings/stale-sessions',
      { body: input }
    )
    return body.data
  }

  /** Group for conversations left with no person and no group. (API 1.33) */
  async getOwnerlessFallback(): Promise<OwnerlessFallbackSettings> {
    const body = await this.request<Envelope<OwnerlessFallbackSettings>>(
      'GET',
      '/settings/ownerless-fallback'
    )
    return body.data
  }

  async updateOwnerlessFallback(input: OwnerlessFallbackPatch): Promise<OwnerlessFallbackSettings> {
    const body = await this.request<Envelope<OwnerlessFallbackSettings>>(
      'PATCH',
      '/settings/ownerless-fallback',
      { body: input }
    )
    return body.data
  }

  /** Previews by default; `dryRun: false` assigns the current ownerless conversations. */
  async applyOwnerlessFallback(
    input: { dryRun?: boolean } = {}
  ): Promise<OwnerlessFallbackApplication> {
    const body = await this.request<Envelope<OwnerlessFallbackApplication>>(
      'POST',
      '/settings/ownerless-fallback/apply',
      { body: input }
    )
    return body.data
  }

  // ---- AI ---------------------------------------------------------------

  /** Requires `ai_summaries:read`. (API 1.29) */
  async getAiSummarySettings(): Promise<AiSummarySettings> {
    const body = await this.request<Envelope<AiSummarySettings>>('GET', '/settings/ai-summaries')
    return body.data
  }

  /** Requires `ai_summaries:write`. */
  async updateAiSummarySettings(input: AiSummarySettingsPatch): Promise<AiSummarySettings> {
    const body = await this.request<Envelope<AiSummarySettings>>('PATCH', '/settings/ai-summaries', {
      body: input,
    })
    return body.data
  }

  async getAiSummaryCosts(): Promise<AiSummaryCostReport> {
    const body = await this.request<Envelope<AiSummaryCostReport>>('GET', '/ai-summaries/costs')
    return body.data
  }

  /** A paid summary that writes nothing; counts against the daily budget. Requires `ai_agents:write`. */
  async previewAiSummary(input: AiSummaryPreviewInput): Promise<AiSummaryPreview> {
    const body = await this.request<Envelope<AiSummaryPreview>>('POST', '/ai-summaries/preview', {
      body: input,
    })
    return body.data
  }

  /** Estimated AI usage and cost per agent and day. Requires `ai_agents:read`. (API 1.35) */
  async getAiAgentUsage(params: AiAgentUsageParams = {}): Promise<AiAgentUsage> {
    const body = await this.request<Envelope<AiAgentUsage>>(
      'GET',
      this.withQuery('/ai-agents/usage', params)
    )
    return body.data
  }

  /** The agent's allowed company queries. Requires `ai_agents:read`. */
  getAiAgent(uuid: string): Promise<AiAgentQueryResult> {
    return this.request('GET', `/ai-agents/${encode(uuid)}`)
  }

  /** Replaces the agent's company query allowlist; `[]` removes them all. Requires `settings:write`. */
  updateAiAgentQueryPermissions(
    uuid: string,
    allowedCompanyQueryUuids: string[]
  ): Promise<AiAgentQueryResult> {
    return this.request('PATCH', `/ai-agents/${encode(uuid)}`, {
      body: { allowedCompanyQueryUuids },
    })
  }

  /** Requires `ai_agents:read`. (API 1.37) */
  async getAiDutySettings(): Promise<AiDutySettings> {
    const body = await this.request<Envelope<AiDutySettings>>('GET', '/settings/ai-duty')
    return body.data
  }

  /** Replaces all four fields. Requires `ai_agents:write`. */
  async updateAiDutySettings(input: AiDutySettings): Promise<AiDutySettings> {
    const body = await this.request<Envelope<AiDutySettings>>('PUT', '/settings/ai-duty', {
      body: input,
    })
    return body.data
  }

  /** Reply guard rules of an agent. Requires `ai_agents:read`. (API 1.36) */
  listAiAgentGuardRules(agentUuid: string): Promise<ReplyGuardRules> {
    return this.request('GET', `/ai-agents/${encode(agentUuid)}/guard-rules`)
  }

  /** Creates a rule in `ensaio` (logs only). Requires `ai_agents:write`. */
  createAiAgentGuardRule(agentUuid: string, input: ReplyGuardRuleCreate): Promise<ReplyGuardSaved> {
    return this.request('POST', `/ai-agents/${encode(agentUuid)}/guard-rules`, { body: input })
  }

  /** Partial update; `mode: 'ativo'` lets the rule rewrite replies. */
  updateAiAgentGuardRule(
    agentUuid: string,
    ruleUuid: string,
    input: ReplyGuardRulePatch
  ): Promise<ReplyGuardSaved> {
    return this.request(
      'PATCH',
      `/ai-agents/${encode(agentUuid)}/guard-rules/${encode(ruleUuid)}`,
      { body: input }
    )
  }

  listAiAgentGuardHits(agentUuid: string, params: ReplyGuardHitParams = {}): Promise<ReplyGuardHits> {
    return this.request('GET', this.withQuery(`/ai-agents/${encode(agentUuid)}/guard-hits`, params))
  }

  /** Live HTTPS queries AI agents may call, without credentials. Requires `ai_agents:read`. (API 1.37) */
  listCompanyQueries(): Promise<CompanyQueryList> {
    return this.request('GET', '/company-queries')
  }

  /** Requires `settings:write`. */
  createCompanyQuery(input: CompanyQueryCreate): Promise<CompanyQueryResult> {
    return this.request('POST', '/company-queries', { body: input })
  }

  updateCompanyQuery(uuid: string, input: CompanyQueryPatch): Promise<CompanyQueryResult> {
    return this.request('PATCH', `/company-queries/${encode(uuid)}`, { body: input })
  }

  /** Deletes the query and removes it from every agent. */
  deleteCompanyQuery(uuid: string): Promise<CompanyQueryDeleteResult> {
    return this.request('DELETE', `/company-queries/${encode(uuid)}`)
  }

  /** Runs the GET without AI, inactive queries included. */
  testCompanyQuery(uuid: string, args: Record<string, string> = {}): Promise<CompanyQueryTestResult> {
    return this.request('POST', `/company-queries/${encode(uuid)}/test`, { body: { args } })
  }

  /** URL knowledge sources, without secrets. Requires `knowledge:read`. */
  listKnowledgeSources(): Promise<KnowledgeSourceList> {
    return this.request('GET', '/knowledge/sources')
  }

  /** Requires `knowledge:write`. `queued` does not mean indexed. */
  createKnowledgeUrlSource(input: KnowledgeUrlCreate): Promise<KnowledgeSourceResult> {
    return this.request('POST', '/knowledge/sources', { body: input })
  }

  updateKnowledgeUrlSource(uuid: string, input: KnowledgeUrlPatch): Promise<KnowledgeSourceResult> {
    return this.request('PATCH', `/knowledge/sources/${encode(uuid)}`, { body: input })
  }

  /** Queues a forced reread; may spend embeddings. */
  reindexKnowledgeUrlSource(uuid: string): Promise<KnowledgeSourceResult> {
    return this.request('POST', `/knowledge/sources/${encode(uuid)}/reindex`)
  }

  /** Webhooks of the integration that owns the token, without secrets. Requires `webhooks:read`. (API 1.46) */
  async listWebhooks(): Promise<WebhookEndpoint[]> {
    const body = await this.request<Envelope<WebhookEndpoint[]>>('GET', '/webhooks')
    return body.data
  }

  /** Registers a webhook (up to 5 per integration); the secret is returned only here. Requires `webhooks:write`. (API 1.46) */
  async createWebhook(input: WebhookEndpointWrite): Promise<WebhookEndpointWithSecret> {
    const body = await this.request<Envelope<WebhookEndpointWithSecret>>('POST', '/webhooks', {
      body: input,
    })
    return body.data
  }

  /** Replaces the URL and the events and reactivates the webhook; the secret stays. (API 1.46) */
  async updateWebhook(uuid: string, input: WebhookEndpointWrite): Promise<WebhookEndpoint> {
    const body = await this.request<Envelope<WebhookEndpoint>>('PUT', `/webhooks/${encode(uuid)}`, {
      body: input,
    })
    return body.data
  }

  /** Deletes the webhook and its delivery history. (API 1.46) */
  async deleteWebhook(uuid: string): Promise<void> {
    await this.request<null>('DELETE', `/webhooks/${encode(uuid)}`)
  }

  /** Issues a new secret; the previous one keeps signing for 24 hours. (API 1.46) */
  async rotateWebhookSecret(uuid: string): Promise<WebhookEndpointWithSecret> {
    const body = await this.request<Envelope<WebhookEndpointWithSecret>>(
      'POST',
      `/webhooks/${encode(uuid)}/rotate-secret`
    )
    return body.data
  }

  /** Queues a `webhook.test` event to this webhook only. (API 1.46) */
  async testWebhook(uuid: string): Promise<void> {
    await this.request<unknown>('POST', `/webhooks/${encode(uuid)}/test`)
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
