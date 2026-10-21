import { randomBytes } from 'node:crypto';
import { chmod, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { z } from 'zod';
import { DEFAULT_CORE_URL, enrollmentRequestSchema } from '../api/schemas';
import type { TlsMaterial } from './core-transport';

/** Every file the Core identity owns. All of them live under the app's user data directory. */
export type CoreIdentityPaths = {
  dir: string;
  settings: string;
  key: string;
  cert: string;
  ca: string;
  identity: string;
  pending: string;
  approvalKey: string;
  pendingKey: string;
  pendingApprovalKey: string;
};

export function identityPaths(userDataDir: string): CoreIdentityPaths {
  const dir = join(userDataDir, 'clientops');
  return {
    dir,
    settings: join(dir, 'settings.json'),
    key: join(dir, 'identity-key.pem'),
    cert: join(dir, 'identity-cert.pem'),
    ca: join(dir, 'core-ca.pem'),
    identity: join(dir, 'identity.json'),
    approvalKey: join(dir, 'approval-key.pem'),
    pending: join(dir, 'pending-enrollment.json'),
    pendingKey: join(dir, 'pending-identity-key.pem'),
    pendingApprovalKey: join(dir, 'pending-approval-key.pem'),
  };
}

const settingsSchema = z.object({ coreUrl: z.string().default(DEFAULT_CORE_URL) });

export const installedIdentitySchema = z.object({
  id: z.string(),
  kind: z.string(),
  deviceId: z.string(),
  certHash: z.string().optional(),
});
export type InstalledIdentity = z.infer<typeof installedIdentitySchema>;

export const pendingEnrollmentSchema = z.object({
  deviceId: z.string(),
  createdAt: z.string(),
  request: enrollmentRequestSchema,
});
export type PendingEnrollment = z.infer<typeof pendingEnrollmentSchema>;

export type LoadedIdentity = { identity: InstalledIdentity; tls: TlsMaterial };

/** Writes a file readable by this user only, replacing any previous content atomically. */
export async function writePrivateFile(path: string, data: string | Buffer): Promise<void> {
  const dir = dirname(path);
  await mkdir(dir, { recursive: true, mode: 0o700 });
  await chmod(dir, 0o700);
  const temporary = `${path}.${randomBytes(6).toString('hex')}.tmp`;
  try {
    await writeFile(temporary, data, { mode: 0o600, flag: 'wx' });
    await chmod(temporary, 0o600);
    await rename(temporary, path);
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
}

export async function readOptionalFile(path: string): Promise<string | undefined> {
  try {
    return await readFile(path, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  }
}

async function readJson<T>(path: string, schema: z.ZodType<T>): Promise<T | undefined> {
  const text = await readOptionalFile(path);
  if (text === undefined) return undefined;
  try {
    return schema.parse(JSON.parse(text));
  } catch {
    return undefined;
  }
}

export async function loadCoreUrl(paths: CoreIdentityPaths): Promise<string> {
  return (await readJson(paths.settings, settingsSchema))?.coreUrl ?? DEFAULT_CORE_URL;
}

export async function saveCoreUrl(paths: CoreIdentityPaths, coreUrl: string): Promise<void> {
  await writePrivateFile(paths.settings, JSON.stringify({ coreUrl }, null, 2));
}

export async function loadPendingEnrollment(
  paths: CoreIdentityPaths
): Promise<PendingEnrollment | undefined> {
  return readJson(paths.pending, pendingEnrollmentSchema);
}

/** The installed identity and its TLS material, or undefined when none is complete on disk. */
export async function loadIdentity(paths: CoreIdentityPaths): Promise<LoadedIdentity | undefined> {
  const identity = await readJson(paths.identity, installedIdentitySchema);
  const [key, cert, ca] = await Promise.all([
    readOptionalFile(paths.key),
    readOptionalFile(paths.cert),
    readOptionalFile(paths.ca),
  ]);
  if (!identity || !key || !cert || !ca) return undefined;
  // Keys written by an older build or restored from a backup must never stay group readable.
  await Promise.all([paths.key, paths.cert, paths.ca, paths.identity].map((p) => chmod(p, 0o600)));
  return { identity, tls: { key, cert, ca } };
}

export async function removeIdentityFiles(paths: CoreIdentityPaths): Promise<void> {
  await Promise.all(
    [
      paths.key,
      paths.cert,
      paths.ca,
      paths.identity,
      paths.approvalKey,
      paths.pending,
      paths.pendingKey,
      paths.pendingApprovalKey,
    ].map((path) => rm(path, { force: true }))
  );
}
