import { execFile } from 'node:child_process';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it } from 'vitest';
import { ENROLLMENT_REQUEST_FILENAME, ENROLLMENT_RESULT_FILENAME } from '../api/schemas';
import {
  createEnrollmentRequest,
  exportEnrollmentRequest,
  importEnrollmentResult,
} from './enrollment';
import { identityPaths, loadIdentity, loadPendingEnrollment } from './identity-files';
import { hasOpenssl, makeTempDir, TestCa } from './test-support';

const execFileAsync = promisify(execFile);
const available = await hasOpenssl();
const cleanups: Array<() => Promise<void>> = [];

afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup();
});

async function workspace() {
  const temp = await makeTempDir();
  cleanups.push(temp.remove);
  return { ...temp, paths: identityPaths(join(temp.dir, 'userData')) };
}

const mode = async (path: string) => (await stat(path)).mode & 0o777;

describe.skipIf(!available)('enrollment', () => {
  it('creates a P-256 request whose CSR carries the device id and verifies', async () => {
    const { dir, paths } = await workspace();
    const created = await createEnrollmentRequest(paths);
    if (!created.success) throw new Error(created.error.message);
    const request = created.data;

    expect(request.deviceId).toMatch(/^emdash-[0-9a-f]{8}$/);
    expect(request.kind).toBe('assistant');
    expect(request.scope).toEqual({ tools: [], actionIds: [] });
    expect(request.csrPem).toContain('BEGIN CERTIFICATE REQUEST');
    // The approval key is a base64 DER SPKI of a P-256 key.
    expect(Buffer.from(request.approvalKey, 'base64').length).toBe(91);

    const csrFile = join(dir, 'request.csr');
    await writeFile(csrFile, request.csrPem);
    const { stdout } = await execFileAsync('openssl', [
      'req',
      '-in',
      csrFile,
      '-noout',
      '-verify',
      '-subject',
      '-text',
    ]);
    expect(stdout).toContain(`CN=${request.deviceId}`);
    expect(stdout).toMatch(/prime256v1|P-256/);

    // Both private keys stay on disk, readable by this user only, and never in the request.
    expect(await mode(paths.pendingKey)).toBe(0o600);
    expect(await mode(paths.pendingApprovalKey)).toBe(0o600);
    expect(await mode(paths.pending)).toBe(0o600);
    expect(await mode(paths.dir)).toBe(0o700);
    expect(JSON.stringify(request)).not.toContain('PRIVATE KEY');
    expect((await loadPendingEnrollment(paths))?.deviceId).toBe(request.deviceId);
  });

  it('reports a failing openssl without leaving a pending enrollment', async () => {
    const { paths } = await workspace();
    const failed = await createEnrollmentRequest(paths, async () => {
      throw new Error('spawn openssl ENOENT');
    });
    expect(failed).toMatchObject({ success: false, error: { type: 'openssl_failed' } });
    expect(await loadPendingEnrollment(paths)).toBeUndefined();
  });

  it('writes the request file into the chosen folder', async () => {
    const { dir, paths } = await workspace();
    const created = await createEnrollmentRequest(paths);
    if (!created.success) throw new Error(created.error.message);
    const exported = await exportEnrollmentRequest(created.data, dir);
    expect(exported).toEqual({ success: true, data: join(dir, ENROLLMENT_REQUEST_FILENAME) });
    expect(JSON.parse(await readFile(join(dir, ENROLLMENT_REQUEST_FILENAME), 'utf8'))).toEqual(
      created.data
    );
    expect(await exportEnrollmentRequest(created.data, join(dir, 'missing'))).toMatchObject({
      success: false,
      error: { type: 'io_failed' },
    });
  });

  describe('importing the result', () => {
    async function enrolled(kind = 'assistant') {
      const { dir, paths } = await workspace();
      const created = await createEnrollmentRequest(paths);
      if (!created.success) throw new Error(created.error.message);
      const ca = await TestCa.create(dir);
      const certPem = await ca.sign(created.data.csrPem, created.data.deviceId);
      const result = {
        certPem,
        caPem: ca.caPem,
        identity: {
          id: created.data.deviceId,
          kind,
          deviceId: created.data.deviceId,
          scope: created.data.scope,
        },
      };
      const resultDir = join(dir, 'result');
      await execFileAsync('mkdir', [resultDir]);
      const resultFile = join(resultDir, ENROLLMENT_RESULT_FILENAME);
      await writeFile(resultFile, JSON.stringify(result));
      return { dir, paths, request: created.data, ca, result, resultDir, resultFile };
    }

    it('installs the identity from the folder or the file and locks every file down', async () => {
      const { paths, request, resultDir } = await enrolled();
      const installed = await importEnrollmentResult(paths, resultDir);
      expect(installed).toMatchObject({ success: true, data: { deviceId: request.deviceId } });

      const identity = await loadIdentity(paths);
      expect(identity?.identity.kind).toBe('assistant');
      expect(identity?.tls.key).toContain('PRIVATE KEY');
      expect(identity?.tls.cert).toContain('BEGIN CERTIFICATE');
      for (const file of [paths.key, paths.cert, paths.ca, paths.identity, paths.approvalKey]) {
        expect(await mode(file)).toBe(0o600);
      }
      expect(await loadPendingEnrollment(paths)).toBeUndefined();
    });

    it('accepts the result file path directly', async () => {
      const { paths, resultFile } = await enrolled();
      expect(await importEnrollmentResult(paths, resultFile)).toMatchObject({ success: true });
    });

    it('needs a pending request', async () => {
      const { paths, resultDir } = await enrolled();
      const other = await workspace();
      expect(await importEnrollmentResult(other.paths, resultDir)).toMatchObject({
        success: false,
        error: { type: 'no_pending_request' },
      });
      expect(await importEnrollmentResult(paths, join(resultDir, 'nope'))).toMatchObject({
        success: false,
        error: { type: 'file_not_found' },
      });
    });

    it('refuses an identity that is not an assistant', async () => {
      const { paths, resultDir } = await enrolled('owner_device');
      expect(await importEnrollmentResult(paths, resultDir)).toMatchObject({
        success: false,
        error: { type: 'invalid_result' },
      });
      expect(await loadIdentity(paths)).toBeUndefined();
    });

    it('refuses a result for another request, another key, or a damaged file', async () => {
      const first = await enrolled();
      const other = await enrolled();
      // The certificate of a different request does not fit this app's pending key.
      await writeFile(
        first.resultFile,
        JSON.stringify({ ...first.result, certPem: other.result.certPem })
      );
      expect(await importEnrollmentResult(first.paths, first.resultDir)).toMatchObject({
        success: false,
        error: { type: 'key_mismatch' },
      });

      await writeFile(
        first.resultFile,
        JSON.stringify({
          ...first.result,
          identity: { ...first.result.identity, deviceId: 'emdash-ffffffff' },
        })
      );
      expect(await importEnrollmentResult(first.paths, first.resultDir)).toMatchObject({
        success: false,
        error: { type: 'key_mismatch' },
      });

      await writeFile(first.resultFile, '{"certPem":1}');
      expect(await importEnrollmentResult(first.paths, first.resultDir)).toMatchObject({
        success: false,
        error: { type: 'invalid_result' },
      });
      expect(await loadIdentity(first.paths)).toBeUndefined();
    });

    it('refuses a certificate not issued by the supplied authority', async () => {
      const { paths, result, resultDir, resultFile } = await enrolled();
      const rogue = await TestCa.create((await workspace()).dir);
      await writeFile(resultFile, JSON.stringify({ ...result, caPem: rogue.caPem }));
      expect(await importEnrollmentResult(paths, resultDir)).toMatchObject({
        success: false,
        error: { type: 'key_mismatch' },
      });
    });
  });
});
