import { createController, type Controller } from '@emdash/wire/rpc';
import type { CoreInvoker } from '@core/features/clientops-core/api/node/core-invoker';
import { clientsContract } from '../api/contract';
import { listClients, readClientActivity } from './clients-service';

export function createClientsWireController(core: CoreInvoker): Controller {
  return createController(clientsContract, {
    list: () => listClients(core),
    activity: () => readClientActivity(core),
  });
}
