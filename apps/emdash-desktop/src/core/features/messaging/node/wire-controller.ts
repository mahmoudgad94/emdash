import { err, ok } from '@emdash/shared';
import { createController, type Controller } from '@emdash/wire/rpc';
import type { CoreInvoker } from '@core/features/clientops-core/api/node/core-invoker';
import { messagingContract } from '../api/contract';
import {
  createDraft,
  listConnectors,
  listConversations,
  listNeedYou,
  readConversation,
} from './messaging-service';
import { openApprovalApp, type OpenApprovalApp } from './open-approval-app';
import { runTriage as runTriageOnce, type RunTriage } from './triage-runner';
import { defaultWhatsAppStorePath, readChatHistory } from './whatsapp-history';

export function createMessagingWireController(
  core: CoreInvoker,
  openApp: OpenApprovalApp = openApprovalApp,
  storePath: () => string = defaultWhatsAppStorePath,
  runTriage: RunTriage = runTriageOnce
): Controller {
  return createController(messagingContract, {
    conversations: (input) => listConversations(core, input),
    conversation: ({ id }) => readConversation(core, id),
    createDraft: (input) => createDraft(core, input),
    needYou: () => listNeedYou(core),
    connectors: () => listConnectors(core),
    runTriage: async (input) => {
      const run = await runTriage(input);
      return run.success ? ok({ text: run.text }) : err(run.error);
    },
    history: (input) => {
      const page = readChatHistory(storePath(), input);
      return 'error' in page
        ? err({ code: 'invalid_input', message: 'That is not a WhatsApp chat' })
        : ok(page);
    },
    openApprovalApp: () => openApp(),
  });
}
