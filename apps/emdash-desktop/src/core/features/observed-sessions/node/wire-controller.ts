import { createController, type Controller } from '@emdash/wire/rpc';
import type { CoreInvoker } from '@core/features/clientops-core/api/node/core-invoker';
import { observedSessionsContract } from '../api/contract';
import { listSessions, readTranscript, readWorkSummary } from './observed-sessions-service';

export function createObservedSessionsWireController(core: CoreInvoker): Controller {
  return createController(observedSessionsContract, {
    summary: () => readWorkSummary(core),
    list: (input) => listSessions(core, input),
    transcript: ({ id }) => readTranscript(core, id),
  });
}
