export {
  APP_ID,
  APP_NAME_LOWER,
  ARTIFACT_PREFIX,
  PRODUCT_NAME,
  RELEASES_REPO,
  UPDATE_CHANNEL,
} from '../../../src/core/primitives/app-identity/api/app-identity.ts';
import { RELEASES_REPO as RELEASES } from '../../../src/core/primitives/app-identity/api/app-identity.ts';

// The upstream R2 mirror is not used by this fork; releases live only on the fork's GitHub releases.
export const R2_BASE_URL = '';

export const RELEASE_DIR = 'release';
export const NATIVE_MODULES = ['better-sqlite3', 'node-pty', '@parcel/watcher'];
export const GITHUB_OWNER = RELEASES.owner;
export const GITHUB_REPO = RELEASES.repo;

export function requireEnv(name: string): string {
  const val = process.env[name];
  if (!val) throw new Error(`Missing required env var: ${name}`);
  return val;
}

export function r2Endpoint(): string {
  return `https://${requireEnv('R2_ACCOUNT_ID')}.r2.cloudflarestorage.com/${requireEnv('R2_BUCKET')}`;
}
