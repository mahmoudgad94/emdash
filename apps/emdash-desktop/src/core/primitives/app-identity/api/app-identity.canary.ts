// Inlined rather than re-exported from ./app-identity so this module has no relative
// imports. It is loaded under Node (--experimental-strip-types) by
// electron-builder.canary.config.ts, where extensionless ESM specifiers do not resolve.
// Keep in sync with RELEASES_REPO in ./app-identity.ts.
export const RELEASES_REPO = { owner: 'mahmoudgad94', repo: 'emdash' } as const;

export const APP_ID = 'com.mahmoudgad.clientops.canary';
export const PRODUCT_NAME = 'Client Ops Canary';
export const APP_NAME_LOWER = 'clientops-canary';
export const LINUX_DESKTOP_ID = 'clientops-canary';
export const UPDATE_CHANNEL = 'v1-canary';
export const ARTIFACT_PREFIX = 'clientops-canary';
