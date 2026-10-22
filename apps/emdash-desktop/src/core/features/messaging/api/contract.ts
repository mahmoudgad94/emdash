import { defineContract, fallible } from '@emdash/wire/rpc';
import { z } from 'zod';
import {
  approvalAppOpenedSchema,
  connectorsSchema,
  conversationInputSchema,
  historyInputSchema,
  runTriageInputSchema,
  runTriageResultSchema,
  historySchema,
  conversationListSchema,
  conversationsInputSchema,
  conversationThreadSchema,
  createDraftInputSchema,
  draftSchema,
  messagingErrorSchema,
  needYouSchema,
} from './schemas';

export const messagingDomain = 'messaging' as const;

export const messagingContract = defineContract({
  conversations: fallible({
    input: conversationsInputSchema,
    data: conversationListSchema,
    error: messagingErrorSchema,
  }),
  conversation: fallible({
    input: conversationInputSchema,
    data: conversationThreadSchema,
    error: messagingErrorSchema,
  }),
  createDraft: fallible({
    input: createDraftInputSchema,
    data: draftSchema,
    error: messagingErrorSchema,
  }),
  needYou: fallible({
    input: z.void(),
    data: needYouSchema,
    error: messagingErrorSchema,
  }),
  /** Older messages of a client's WhatsApp chat, and the owner's own replies, read from the local WhatsApp store. */
  history: fallible({
    input: historyInputSchema,
    data: historySchema,
    error: messagingErrorSchema,
  }),
  /** Runs Claude Code once, read-only, in a project folder on this Mac and returns its answer. */
  runTriage: fallible({
    input: runTriageInputSchema,
    data: runTriageResultSchema,
    error: messagingErrorSchema,
  }),
  /** The message providers Core has wired up, with their health. */
  connectors: fallible({
    input: z.void(),
    data: connectorsSchema,
    error: messagingErrorSchema,
  }),
  openApprovalApp: fallible({
    input: z.void(),
    data: approvalAppOpenedSchema,
    error: messagingErrorSchema,
  }),
});

export type MessagingContract = typeof messagingContract;
