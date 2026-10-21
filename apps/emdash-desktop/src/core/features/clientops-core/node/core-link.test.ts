import { readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createStubLogger } from '@emdash/shared/testing';
import { afterEach, describe, expect, it } from 'vitest';
import { ENROLLMENT_RESULT_FILENAME } from '../api/schemas';
import { ASSISTANT_AUDIENCE } from './core-client';
import { createCoreLink, type CoreLink } from './core-link';
import { CoreTransportError } from './core-transport';
import { identityPaths } from './identity-files';
import {
  FakeCoreTransport,
  hasOpenssl,
  json,
  makeJwt,
  makeTempDir,
  TestCa,
  type FakeCoreRoute,
} from './test-support';

const available = await hasOpenssl();
const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup();
});

const tokenReply = () =>
  json(200, { accessToken: makeJwt(ASSISTANT_AUDIENCE), refreshToken: 'refresh' });

async function setup(route: FakeCoreRoute = defaultRoute) {
  const temp = await makeTempDir();
  cleanups.push(temp.remove);
  const userDataDir = join(temp.dir, 'userData');
  const transports: FakeCoreTransport[] = [];
  const link = createCoreLink({
    userDataDir,
    logger: createStubLogger().logger,
    transportFactory: () => {
      const transport = new FakeCoreTransport(route);
      transports.push(transport);
      return transport;
    },
  });
  cleanups.push(() => link.dispose());
  return { link, temp, transports, paths: identityPaths(userDataDir) };
}

const defaultRoute: FakeCoreRoute = (request) =>
  request.path === '/v1/token' || request.path === '/v1/refresh'
    ? tokenReply()
    : json(200, { items: [] });

/** Runs the whole owner flow: export a request, have the "Mac app" sign it, import the result. */
async function enroll(link: CoreLink, dir: string) {
  const exported = await link.generateEnrollmentRequest(dir);
  if (!exported.success) throw new Error(exported.error.message);
  const ca = await TestCa.create(dir);
  const { deviceId, csrPem, scope } = exported.data.request;
  await writeFile(
    join(dir, ENROLLMENT_RESULT_FILENAME),
    JSON.stringify({
      certPem: await ca.sign(csrPem, deviceId),
      caPem: ca.caPem,
      identity: { id: deviceId, kind: 'assistant', deviceId, scope },
    })
  );
  return { deviceId, imported: await link.importEnrollmentResult(dir) };
}

describe('CoreLink', () => {
  it('starts unconfigured with the default URL and refuses to call Core', async () => {
    const { link } = await setup();
    expect(await link.check()).toEqual({
      state: { kind: 'unconfigured' },
      coreUrl: 'https://localhost:28443',
    });
    expect(await link.invoke('clients.list', {})).toEqual({
      success: false,
      error: { code: 'not_connected', message: 'Client Ops Core is not set up' },
    });
  });

  it.skipIf(!available)(
    'goes from unconfigured through enrolling to connected and back',
    async () => {
      const { link, temp, paths } = await setup();

      const exported = await link.generateEnrollmentRequest(temp.dir);
      if (!exported.success) throw new Error(exported.error.message);
      expect((await link.check()).state).toEqual({
        kind: 'enrolling',
        deviceId: exported.data.request.deviceId,
      });

      const { deviceId, imported } = await enroll(link, temp.dir);
      expect(imported).toMatchObject({
        success: true,
        data: { state: { kind: 'connected', deviceId } },
      });
      expect(await link.invoke('clients.list', {})).toEqual({ success: true, data: { items: [] } });

      // A later session finds the stored identity and connects without enrolling again.
      const again = createCoreLink({
        userDataDir: join(temp.dir, 'userData'),
        logger: createStubLogger().logger,
        transportFactory: () => new FakeCoreTransport(defaultRoute),
      });
      cleanups.push(() => again.dispose());
      expect((await again.check()).state).toEqual({ kind: 'connected', deviceId });

      expect((await link.disconnect()).state).toEqual({ kind: 'unconfigured' });
      expect((await link.check()).state).toEqual({ kind: 'unconfigured' });
      expect((await link.invoke('clients.list', {})).success).toBe(false);
      expect(await readdir(paths.dir)).not.toContain('identity-key.pem');
    }
  );

  it.skipIf(!available)(
    'reports an error status with the code when Core cannot be reached',
    async () => {
      let reachable = true;
      const { link, temp } = await setup((request) => {
        if (!reachable) throw new CoreTransportError('unreachable', 'Core is not reachable');
        return defaultRoute(request);
      });
      await enroll(link, temp.dir);

      reachable = false;
      const failed = await link.invoke('clients.list', {});
      expect(failed).toMatchObject({ success: false, error: { code: 'unreachable' } });
      expect((await link.check()).state).toMatchObject({ kind: 'error', code: 'unreachable' });

      reachable = true;
      expect((await link.check()).state.kind).toBe('connected');
    }
  );

  it.skipIf(!available)('keeps the connection up when Core refuses one tool', async () => {
    const { link, temp } = await setup((request) =>
      request.path === '/v1/tools/work.summary'
        ? json(403, { code: 'policy_denied', message: 'owner only' })
        : defaultRoute(request)
    );
    await enroll(link, temp.dir);

    expect(await link.invoke('work.summary', {})).toEqual({
      success: false,
      error: { code: 'policy_denied', message: 'owner only' },
    });
    expect((await link.check()).state.kind).toBe('connected');
  });

  it('validates and persists the Core URL', async () => {
    const { link } = await setup();
    expect(await link.setCoreUrl('not a url')).toMatchObject({
      success: false,
      error: { type: 'invalid_input' },
    });
    expect(await link.setCoreUrl('http://localhost:28443')).toMatchObject({
      success: false,
      error: { type: 'invalid_input' },
    });
    expect(await link.setCoreUrl('https://user:pw@core.local:9000/path')).toMatchObject({
      success: false,
    });
    expect(await link.setCoreUrl('https://core.local:9000/ignored/path')).toMatchObject({
      success: true,
      data: { coreUrl: 'https://core.local:9000' },
    });
  });
});
