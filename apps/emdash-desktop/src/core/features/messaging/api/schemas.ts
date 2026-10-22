import { z } from 'zod';

export const conversationSourceSchema = z.object({
  clientId: z.string(),
  clientName: z.string(),
  projectId: z.string(),
  projectName: z.string(),
  channelId: z.string(),
  /** The provider's own channel id; the destination of a reply. */
  channel: z.string(),
  /** The channel's account; null when Core did not report it, which disables replying. */
  account: z.string().nullable(),
  /** `private`, `shared_group` or `announcement`. */
  context: z.string(),
});

export const connectorStatusSchema = z.object({
  /** `healthy`, `catching_up`, `degraded`, `down`, ...; null before Core has seen the connector. */
  state: z.string().nullable(),
  lastEventAt: z.string().nullable(),
});

export const lastMessageSchema = z.object({
  text: z.string(),
  at: z.string().nullable(),
  sender: z.string(),
  senderRef: z.string(),
});

export const conversationSummarySchema = z.object({
  id: z.string(),
  /** `whatsapp`, `slack` or `gmail`. */
  provider: z.string(),
  lastSeq: z.number(),
  lastMessage: lastMessageSchema.nullable(),
  messageCount: z.number(),
  untriagedCount: z.number(),
  heldCount: z.number(),
  source: conversationSourceSchema,
  connector: connectorStatusSchema,
});

export const conversationListSchema = z.object({
  conversations: z.array(conversationSummarySchema),
  /** True when Core has more conversations than the app asked for. */
  truncated: z.boolean(),
});

export const messageSchema = z.object({
  seq: z.number(),
  at: z.string().nullable(),
  sender: z.string(),
  senderRef: z.string(),
  text: z.string(),
  /** Names of attached files; the files themselves are not exposed. */
  attachments: z.array(z.string()),
  edited: z.boolean(),
  /** Core is holding the message back from automation (`quarantined` or `injection_flagged`). */
  heldReason: z.enum(['quarantined', 'injection_flagged']).nullable(),
  /** A message the owner sent themselves, read from their own WhatsApp history. */
  outgoing: z.boolean().optional(),
});

export const conversationThreadSchema = z.object({
  id: z.string(),
  provider: z.string(),
  source: conversationSourceSchema,
  /** Oldest first; superseded versions and deleted messages are already left out. */
  messages: z.array(messageSchema),
  /** True when the thread is longer than the app reads in one go. */
  truncated: z.boolean(),
});

export const draftSchema = z.object({
  id: z.string(),
  /** `drafted`, `awaiting_approval` or `delivery_unknown`. */
  state: z.string(),
  provider: z.string(),
  account: z.string(),
  channel: z.string(),
  text: z.string(),
  attachmentCount: z.number(),
  revision: z.number(),
  /** Core does not report when a draft was made; present only if it ever does. */
  createdAt: z.string().nullable(),
});

export const needYouSchema = z.object({
  drafts: z.array(draftSchema),
  truncated: z.boolean(),
});

export const providerConnectorSchema = z.object({
  /** `whatsapp`, `slack` or `gmail`. */
  provider: z.string(),
  account: z.string(),
  /** `healthy`, `catching_up`, `degraded`, `down`, ... as Core reports it. */
  state: z.string(),
  lastEventAt: z.string().nullable(),
});

export const connectorsSchema = z.object({ connectors: z.array(providerConnectorSchema) });

export const historyInputSchema = z.object({
  /** The WhatsApp chat of a registered client channel. */
  channel: z.string(),
  /** Only messages older than this instant (ISO). */
  before: z.string().optional(),
  /** Only messages newer than this instant (ISO). */
  after: z.string().optional(),
  /** Only the owner's own messages, for filling gaps in what Core captured. */
  fromMeOnly: z.boolean().optional(),
  limit: z.number().int().min(1).max(200).optional(),
});

export const historyMessageSchema = z.object({
  id: z.string(),
  at: z.string(),
  fromMe: z.boolean(),
  sender: z.string(),
  text: z.string(),
  attachments: z.array(z.string()),
});

export const historySchema = z.object({
  /** Oldest first. */
  messages: z.array(historyMessageSchema),
  hasMore: z.boolean(),
  /** False when the local WhatsApp store could not be read at all. */
  available: z.boolean(),
});

export const conversationsInputSchema = z.object({ clientId: z.string().optional() });
export const conversationInputSchema = z.object({ id: z.string() });

/** What the app sends to save a reply; the controller turns it into the Core draft payload. */
export const createDraftInputSchema = z.object({
  provider: z.string(),
  account: z.string(),
  channel: z.string(),
  text: z.string(),
});

export const approvalAppOpenedSchema = z.object({ opened: z.literal(true) });

export const messagingErrorSchema = z.object({ code: z.string(), message: z.string() });

export type ConversationSource = z.infer<typeof conversationSourceSchema>;
export type ConnectorStatus = z.infer<typeof connectorStatusSchema>;
export type ConversationSummary = z.infer<typeof conversationSummarySchema>;
export type ConversationList = z.infer<typeof conversationListSchema>;
export type ThreadMessage = z.infer<typeof messageSchema>;
export type ConversationThread = z.infer<typeof conversationThreadSchema>;
export type Draft = z.infer<typeof draftSchema>;
export type NeedYou = z.infer<typeof needYouSchema>;
export type ProviderConnector = z.infer<typeof providerConnectorSchema>;
export type Connectors = z.infer<typeof connectorsSchema>;
export type HistoryInput = z.infer<typeof historyInputSchema>;
export type HistoryMessage = z.infer<typeof historyMessageSchema>;
export type HistoryPage = z.infer<typeof historySchema>;
export type ConversationsInput = z.infer<typeof conversationsInputSchema>;
export type CreateDraftInput = z.infer<typeof createDraftInputSchema>;
export type MessagingError = z.infer<typeof messagingErrorSchema>;
