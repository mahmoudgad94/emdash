import { createController, type Controller } from '@emdash/wire/rpc';
import type { CoreInvoker } from '@core/features/clientops-core/api/node/core-invoker';
import { messagingContract } from '../api/contract';
import { createDraft, listConversations, listNeedYou, readConversation } from './messaging-service';
import { openApprovalApp, type OpenApprovalApp } from './open-approval-app';

export function createMessagingWireController(
  core: CoreInvoker,
  openApp: OpenApprovalApp = openApprovalApp
): Controller {
  return createController(messagingContract, {
    conversations: (input) => listConversations(core, input),
    conversation: ({ id }) => readConversation(core, id),
    createDraft: (input) => createDraft(core, input),
    needYou: () => listNeedYou(core),
    openApprovalApp: () => openApp(),
  });
}
