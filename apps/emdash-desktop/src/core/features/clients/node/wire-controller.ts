import { createController, type Controller } from '@emdash/wire/rpc';
import type { CoreInvoker } from '@core/features/clientops-core/api/node/core-invoker';
import { clientsContract } from '../api/contract';
import {
  inspectRepos,
  listClients,
  readClientActivity,
  readClientWork,
  type DirectoryCheck,
} from './clients-service';

export function createClientsWireController(
  core: CoreInvoker,
  exists?: DirectoryCheck
): Controller {
  return createController(clientsContract, {
    list: () => listClients(core),
    activity: () => readClientActivity(core),
    work: ({ clientId }) => readClientWork(core, clientId),
    inspectRepos: ({ repos }) => inspectRepos(repos, exists),
  });
}
