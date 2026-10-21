import { execFile } from 'node:child_process';
import {
  createHash,
  createPrivateKey,
  generateKeyPairSync,
  randomBytes,
  X509Certificate,
} from 'node:crypto';
import { readFile, rename, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { err, ok, type Result } from '@emdash/shared';
import { z } from 'zod';
import {
  ENROLLMENT_REQUEST_FILENAME,
  ENROLLMENT_RESULT_FILENAME,
  enrollmentRequestSchema,
  type CoreLinkOperationError,
  type EnrollmentRequest,
} from '../api/schemas';
import {
  loadPendingEnrollment,
  readOptionalFile,
  writePrivateFile,
  type CoreIdentityPaths,
  type InstalledIdentity,
} from './identity-files';

const execFileAsync = promisify(execFile);

/** Runs `openssl` with the given arguments and resolves with its standard output. */
export type RunOpenssl = (args: readonly string[]) => Promise<string>;

export const runOpenssl: RunOpenssl = async (args) => {
  const { stdout } = await execFileAsync('openssl', [...args], { timeout: 15_000 });
  return stdout;
};

type OperationResult<T> = Result<T, CoreLinkOperationError>;

const fail = (type: CoreLinkOperationError['type'], message: string) => err({ type, message });

const pemPrivateKey = (key: ReturnType<typeof generateKeyPairSync>['privateKey']) =>
  key.export({ type: 'pkcs8', format: 'pem' }).toString();

/**
 * Creates the identity key pair and the approval key pair, keeps both private keys on disk
 * (0600) and returns the request the Client Ops Mac app turns into a certificate.
 */
export async function createEnrollmentRequest(
  paths: CoreIdentityPaths,
  openssl: RunOpenssl = runOpenssl,
  now: () => Date = () => new Date()
): Promise<OperationResult<EnrollmentRequest>> {
  const deviceId = `emdash-${randomBytes(4).toString('hex')}`;
  const identityKey = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const approvalKey = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  try {
    await writePrivateFile(paths.pendingKey, pemPrivateKey(identityKey.privateKey));
    await writePrivateFile(paths.pendingApprovalKey, pemPrivateKey(approvalKey.privateKey));
  } catch {
    return fail('io_failed', 'Could not store the identity key');
  }
  let csrPem: string;
  try {
    csrPem = (
      await openssl([
        'req',
        '-new',
        '-key',
        paths.pendingKey,
        '-subj',
        `/CN=${deviceId}`,
        '-sha256',
      ])
    ).trim();
  } catch {
    return fail('openssl_failed', 'openssl could not create the certificate request');
  }
  if (!csrPem.includes('BEGIN CERTIFICATE REQUEST')) {
    return fail('openssl_failed', 'openssl returned no certificate request');
  }
  const request: EnrollmentRequest = {
    deviceId,
    csrPem: `${csrPem}\n`,
    approvalKey: approvalKey.publicKey.export({ type: 'spki', format: 'der' }).toString('base64'),
    kind: 'assistant',
    scope: { tools: [], actionIds: [] },
  };
  try {
    await writePrivateFile(
      paths.pending,
      JSON.stringify({ deviceId, createdAt: now().toISOString(), request }, null, 2)
    );
  } catch {
    return fail('io_failed', 'Could not store the pending enrollment');
  }
  return ok(request);
}

/** Writes the request into the folder the owner picked, for the Client Ops Mac app to import. */
export async function exportEnrollmentRequest(
  request: EnrollmentRequest,
  directory: string
): Promise<OperationResult<string>> {
  const filePath = join(directory, ENROLLMENT_REQUEST_FILENAME);
  try {
    if (!(await stat(directory)).isDirectory()) throw new Error('not a directory');
    await writePrivateFile(
      filePath,
      `${JSON.stringify(enrollmentRequestSchema.parse(request), null, 2)}\n`
    );
  } catch {
    return fail('io_failed', 'Could not write the enrollment request to that folder');
  }
  return ok(filePath);
}

const enrollmentResultSchema = z.object({
  certPem: z.string().min(1),
  caPem: z.string().min(1),
  identity: z.object({
    id: z.string(),
    kind: z.string(),
    deviceId: z.string(),
    certHash: z.string().optional(),
  }),
});

async function resolveResultFile(path: string): Promise<string | undefined> {
  try {
    const info = await stat(path);
    if (info.isFile()) return path;
    const inside = join(path, ENROLLMENT_RESULT_FILENAME);
    return (await stat(inside)).isFile() ? inside : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Validates the result the Mac app wrote against the pending request and installs it: the
 * pending keys become the identity keys and the certificate, CA and identity are stored 0600.
 */
export async function importEnrollmentResult(
  paths: CoreIdentityPaths,
  path: string
): Promise<OperationResult<InstalledIdentity>> {
  const pending = await loadPendingEnrollment(paths);
  if (!pending) {
    return fail('no_pending_request', 'Export an enrollment request before importing its result');
  }
  const file = await resolveResultFile(path);
  if (!file) {
    return fail('file_not_found', `No ${ENROLLMENT_RESULT_FILENAME} found at that location`);
  }
  let parsed: z.infer<typeof enrollmentResultSchema>;
  try {
    parsed = enrollmentResultSchema.parse(JSON.parse(await readFile(file, 'utf8')));
  } catch {
    return fail('invalid_result', 'The enrollment result is not in the expected format');
  }
  if (parsed.identity.kind !== 'assistant') {
    return fail('invalid_result', 'The enrollment result is not for an assistant identity');
  }
  if (parsed.identity.deviceId !== pending.deviceId) {
    return fail('key_mismatch', 'The enrollment result belongs to a different request');
  }
  const privateKeyPem = await readOptionalFile(paths.pendingKey);
  if (!privateKeyPem) return fail('no_pending_request', 'The pending identity key is missing');
  let certificate: X509Certificate;
  let authority: X509Certificate;
  try {
    certificate = new X509Certificate(parsed.certPem);
    authority = new X509Certificate(parsed.caPem);
  } catch {
    return fail('invalid_result', 'The certificate in the enrollment result is unreadable');
  }
  const validNow = (cert: X509Certificate) =>
    Date.now() >= Date.parse(cert.validFrom) && Date.now() < Date.parse(cert.validTo);
  if (
    !certificate.checkPrivateKey(createPrivateKey(privateKeyPem)) ||
    !certificate.subject.split('\n').includes(`CN=${pending.deviceId}`) ||
    !certificate.verify(authority.publicKey) ||
    !validNow(certificate) ||
    !validNow(authority)
  ) {
    return fail('key_mismatch', 'The certificate does not match the pending identity key');
  }
  if (
    parsed.identity.certHash !== undefined &&
    parsed.identity.certHash !== createHash('sha256').update(certificate.raw).digest('base64url')
  ) {
    return fail('invalid_result', 'The certificate does not match the identity in the result');
  }
  const installed: InstalledIdentity = {
    id: parsed.identity.id,
    kind: parsed.identity.kind,
    deviceId: parsed.identity.deviceId,
    certHash: parsed.identity.certHash,
  };
  try {
    await writePrivateFile(paths.cert, parsed.certPem);
    await writePrivateFile(paths.ca, parsed.caPem);
    await writePrivateFile(paths.identity, JSON.stringify(installed, null, 2));
    await rename(paths.pendingKey, paths.key);
    await rename(paths.pendingApprovalKey, paths.approvalKey);
    await rm(paths.pending, { force: true });
  } catch {
    return fail('io_failed', 'Could not store the identity');
  }
  return ok(installed);
}
