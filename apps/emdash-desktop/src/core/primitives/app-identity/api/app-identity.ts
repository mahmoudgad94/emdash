type ImportMetaWithEnv = ImportMeta & { env?: { DEV?: boolean; VITE_BUILD?: string } };

const env = (import.meta as ImportMetaWithEnv).env;
const isDev = env?.DEV === true;
const isCanary = env?.VITE_BUILD === 'canary';

export const APP_ID = isCanary ? 'com.mahmoudgad.clientops.canary' : 'com.mahmoudgad.clientops';
export const PRODUCT_NAME = isCanary ? 'Client Ops Canary' : 'Client Ops';
export const APP_NAME_LOWER = isCanary ? 'clientops-canary' : 'clientops';
export const LINUX_DESKTOP_ID = isCanary ? 'clientops-canary' : 'ClientOps';
export const USER_DATA_DIR_NAME = isDev
  ? 'clientops-dev'
  : isCanary
    ? 'clientops-canary'
    : 'clientops';
export const UPDATE_CHANNEL = isCanary ? 'v1-canary' : 'v1-stable';
export const ARTIFACT_PREFIX = isCanary ? 'clientops-canary' : 'clientops';
// Releases are published only to the fork's GitHub releases; there is no secondary feed.
export const RELEASES_REPO = { owner: 'mahmoudgad94', repo: 'emdash' } as const;
export const IS_CANARY = isCanary;
