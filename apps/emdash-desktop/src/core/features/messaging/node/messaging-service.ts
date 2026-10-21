import { err, ok, type Result } from '@emdash/shared';
import { z } from 'zod';
import type {
  CoreInvoker,
  CoreLinkError,
} from '@core/features/clientops-core/api/node/core-invoker';
import { buildDraftPayload, DRAFTABLE_PROVIDERS, normalizeReplyText } from '../api/draft-payload';
import type {
  ConversationList,
  ConversationsInput,
  ConversationSource,
  ConversationSummary,
  ConversationThread,
  CreateDraftInput,
  Draft,
  NeedYou,
  ThreadMessage,
} from '../api/schemas';

/** Core pages conversations and messages at most this many rows at a time. */
const PAGE_SIZE = 200;
/** Conversations read per refresh: three full pages, newest first. */
const MAX_CONVERSATION_PAGES = 3;
/** Messages read per conversation: ten full pages, oldest first. */
const MAX_MESSAGE_PAGES = 10;
const MAX_NEED_YOU_PAGES = 5;

const text = z.string().nullish();

const sourceSchema = z.object({
  clientId: z.string(),
  clientName: z.string(),
  projectId: z.string(),
  projectName: z.string(),
  channelId: z.string(),
  channel: z.string(),
  account: text,
  context: z.string().optional(),
});

const conversationItemSchema = z.object({
  id: z.string(),
  provider: z.string(),
  lastSeq: z.number(),
  lastMessage: z
    .object({
      text: z.string(),
      at: text,
      sender: z.string(),
      senderRef: z.string(),
    })
    .nullish(),
  messageCount: z.number(),
  untriagedCount: z.number().optional(),
  heldCount: z.number().optional(),
  source: sourceSchema,
  connector: z.object({ state: text, lastEventAt: text }).optional(),
});

const conversationPageSchema = z.object({
  snapshotSeq: z.number(),
  conversations: z.array(conversationItemSchema),
  hasMore: z.boolean(),
  nextAfterSeq: z.number().nullish(),
});

const messageRowSchema = z.object({
  seq: z.number(),
  kind: z.string(),
  at: text,
  senderLabel: z.string(),
  senderRef: z.string(),
  held: z.boolean().optional(),
  heldReason: z.enum(['quarantined', 'injection_flagged']).nullish(),
  superseded: z.boolean().optional(),
  text: z.string(),
  attachments: z.array(z.object({ name: z.string() })).optional(),
});

const detailPageSchema = z.object({
  conversationId: z.string(),
  snapshotSeq: z.number(),
  rows: z.array(messageRowSchema),
  hasMore: z.boolean(),
  nextAfterSeq: z.number().nullish(),
  source: sourceSchema.extend({ provider: z.string() }),
});

const actionRowSchema = z.object({
  id: z.string(),
  kind: z.string().optional(),
  state: z.string(),
  revision: z.number().optional(),
  payload: z.object({
    provider: z.string(),
    account: z.string(),
    channel: z.string(),
    text: z.string(),
    attachments: z.array(z.unknown()).optional(),
  }),
  createdAt: text,
});

const unreadable = (tool: string): CoreLinkError => ({
  code: 'invalid_response',
  message: `Core sent an unexpected ${tool} response`,
});

function toSource(source: z.infer<typeof sourceSchema>): ConversationSource {
  return {
    clientId: source.clientId,
    clientName: source.clientName,
    projectId: source.projectId,
    projectName: source.projectName,
    channelId: source.channelId,
    channel: source.channel,
    account: source.account ?? null,
    context: source.context ?? 'private',
  };
}

function toConversation(item: z.infer<typeof conversationItemSchema>): ConversationSummary {
  return {
    id: item.id,
    provider: item.provider,
    lastSeq: item.lastSeq,
    lastMessage: item.lastMessage
      ? {
          text: item.lastMessage.text,
          at: item.lastMessage.at ?? null,
          sender: item.lastMessage.sender,
          senderRef: item.lastMessage.senderRef,
        }
      : null,
    messageCount: item.messageCount,
    untriagedCount: item.untriagedCount ?? 0,
    heldCount: item.heldCount ?? 0,
    source: toSource(item.source),
    connector: {
      state: item.connector?.state ?? null,
      lastEventAt: item.connector?.lastEventAt ?? null,
    },
  };
}

function toDraft(row: z.infer<typeof actionRowSchema>): Draft {
  return {
    id: row.id,
    state: row.state,
    provider: row.payload.provider,
    account: row.payload.account,
    channel: row.payload.channel,
    text: row.payload.text,
    attachmentCount: row.payload.attachments?.length ?? 0,
    revision: row.revision ?? 0,
    createdAt: row.createdAt ?? null,
  };
}

/**
 * The newest conversations, optionally for one client. Core pages them newest first with an
 * upper-bound cursor, so later pages are asked for under the first page's snapshot to stay
 * consistent while new messages arrive.
 */
export async function listConversations(
  core: CoreInvoker,
  input: ConversationsInput
): Promise<Result<ConversationList, CoreLinkError>> {
  const conversations: ConversationSummary[] = [];
  let cursor: number | undefined;
  let snapshotSeq: number | undefined;
  for (let page = 0; page < MAX_CONVERSATION_PAGES; page += 1) {
    const response = await core.invoke('inbox.conversations', {
      limit: PAGE_SIZE,
      ...(input.clientId ? { clientId: input.clientId } : {}),
      ...(cursor === undefined ? {} : { afterSeq: cursor }),
      ...(snapshotSeq === undefined ? {} : { snapshotSeq }),
    });
    if (!response.success) return response;
    const parsed = conversationPageSchema.safeParse(response.data);
    if (!parsed.success) return err(unreadable('inbox.conversations'));
    conversations.push(...parsed.data.conversations.map(toConversation));
    snapshotSeq = parsed.data.snapshotSeq;
    if (!parsed.data.hasMore || parsed.data.nextAfterSeq == null) {
      return ok({ conversations, truncated: false });
    }
    cursor = parsed.data.nextAfterSeq;
  }
  return ok({ conversations, truncated: true });
}

function toMessage(row: z.infer<typeof messageRowSchema>): ThreadMessage {
  return {
    seq: row.seq,
    at: row.at ?? null,
    sender: row.senderLabel,
    senderRef: row.senderRef,
    text: row.text,
    attachments: (row.attachments ?? []).map((attachment) => attachment.name),
    edited: row.kind === 'edit',
    heldReason: row.heldReason ?? (row.held ? 'injection_flagged' : null),
  };
}

/**
 * One conversation, oldest message first. Core pages it with a lower-bound cursor, so every page
 * is read (up to a cap) under the first page's snapshot. Older versions of an edited message and
 * deleted messages are left out: the owner reads what the client currently shows.
 */
export async function readConversation(
  core: CoreInvoker,
  id: string
): Promise<Result<ConversationThread, CoreLinkError>> {
  const messages: ThreadMessage[] = [];
  let cursor: number | undefined;
  let snapshotSeq: number | undefined;
  let head: z.infer<typeof detailPageSchema> | undefined;
  let truncated = false;
  for (let page = 0; page < MAX_MESSAGE_PAGES; page += 1) {
    const response = await core.invoke('inbox.conversation', {
      conversationId: id,
      limit: PAGE_SIZE,
      ...(cursor === undefined ? {} : { afterSeq: cursor }),
      ...(snapshotSeq === undefined ? {} : { snapshotSeq }),
    });
    if (!response.success) return response;
    const parsed = detailPageSchema.safeParse(response.data);
    if (!parsed.success) return err(unreadable('inbox.conversation'));
    head ??= parsed.data;
    snapshotSeq = parsed.data.snapshotSeq;
    for (const row of parsed.data.rows) {
      if (row.superseded === true || row.kind === 'delete') continue;
      messages.push(toMessage(row));
    }
    if (!parsed.data.hasMore || parsed.data.nextAfterSeq == null) break;
    cursor = parsed.data.nextAfterSeq;
    if (page === MAX_MESSAGE_PAGES - 1) truncated = true;
  }
  if (!head) return err(unreadable('inbox.conversation'));
  return ok({
    id: head.conversationId,
    provider: head.source.provider,
    source: toSource(head.source),
    messages,
    truncated,
  });
}

/** Saves the reply as a Core draft. Nothing is sent: sending needs the owner's signature. */
export async function createDraft(
  core: CoreInvoker,
  input: CreateDraftInput
): Promise<Result<Draft, CoreLinkError>> {
  if (!DRAFTABLE_PROVIDERS.includes(input.provider)) {
    return err({
      code: 'unsupported_provider',
      message: `Replies cannot be drafted for ${input.provider} conversations yet`,
    });
  }
  const reply = normalizeReplyText(input.text);
  if (reply === '') return err({ code: 'invalid_input', message: 'The reply is empty' });
  const response = await core.invoke(
    'actions.create_send',
    buildDraftPayload({ ...input, text: reply })
  );
  if (!response.success) return response;
  const parsed = actionRowSchema.safeParse(response.data);
  if (!parsed.success) return err(unreadable('actions.create_send'));
  return ok(toDraft(parsed.data));
}

/** The drafts waiting for the owner (`actions.need_you`), oldest first. */
export async function listNeedYou(core: CoreInvoker): Promise<Result<NeedYou, CoreLinkError>> {
  const drafts: Draft[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < MAX_NEED_YOU_PAGES; page += 1) {
    const response = await core.invoke('actions.need_you', {
      limit: PAGE_SIZE,
      ...(cursor === undefined ? {} : { cursor }),
    });
    if (!response.success) return response;
    const parsed = z.array(actionRowSchema).safeParse(response.data);
    if (!parsed.success) return err(unreadable('actions.need_you'));
    drafts.push(
      ...parsed.data.filter((row) => row.kind === undefined || row.kind === 'send').map(toDraft)
    );
    if (parsed.data.length < PAGE_SIZE) return ok({ drafts, truncated: false });
    cursor = parsed.data.at(-1)!.id;
  }
  return ok({ drafts, truncated: true });
}
