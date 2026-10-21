import { createController, type Controller } from '@emdash/wire/rpc';
import { clientOpsCoreContract } from '../api/contract';
import type { CoreLink } from './core-link';

export function createClientOpsCoreWireController(link: CoreLink): Controller {
  return createController(clientOpsCoreContract, {
    getStatus: () => link.check(),
    setCoreUrl: ({ coreUrl }) => link.setCoreUrl(coreUrl),
    generateEnrollmentRequest: ({ directory }) => link.generateEnrollmentRequest(directory),
    importEnrollmentResult: ({ path }) => link.importEnrollmentResult(path),
    disconnect: () => link.disconnect(),
  });
}
