import { err, ok } from '@emdash/shared';
import { createTestWire } from '@emdash/wire/testing';
import { describe, expect, it } from 'vitest';
import type { CoreInvoker } from '@core/features/clientops-core/api/node/core-invoker';
import { messagingContract } from '../api/contract';
import { createMessagingWireController } from './wire-controller';

const source = {
  clientId: 'acme',
  clientName: 'Acme',
  projectId: 'site',
  projectName: 'Website',
  channelId: 'ch-1',
  channel: '351912345678@s.whatsapp.net',
  account: '351900000000@s.whatsapp.net',
  context: 'private',
};

const action = {
  id: 'd1',
  kind: 'send',
  state: 'drafted',
  revision: 1,
  payload: {
    provider: 'whatsapp',
    account: source.account,
    channel: source.channel,
    text: 'On it.',
    attachments: [],
  },
};

describe('Messaging Wire controller', () => {
  it('serves conversations, a thread, a draft and the waiting drafts through Core', async () => {
    const core: CoreInvoker = {
      invoke: async (tool) => {
        switch (tool) {
          case 'inbox.conversations':
            return ok({
              snapshotSeq: 3,
              conversations: [
                {
                  id: 'cv1.a',
                  provider: 'whatsapp',
                  lastSeq: 3,
                  lastMessage: null,
                  messageCount: 0,
                  source,
                  connector: { state: 'healthy', lastEventAt: null },
                },
              ],
              hasMore: false,
              nextAfterSeq: null,
            });
          case 'inbox.conversation':
            return ok({
              conversationId: 'cv1.a',
              snapshotSeq: 3,
              rows: [],
              hasMore: false,
              nextAfterSeq: null,
              source: { ...source, provider: 'whatsapp' },
            });
          case 'actions.create_send':
            return ok(action);
          case 'actions.need_you':
            return ok([action]);
          default:
            return err({ code: 'not_found', message: tool });
        }
      },
    };
    const wire = createTestWire(
      messagingContract,
      createMessagingWireController(core, async () => ok({ opened: true as const }))
    );
    try {
      expect(await wire.client.conversations({})).toMatchObject({
        success: true,
        data: { truncated: false, conversations: [{ id: 'cv1.a', untriagedCount: 0 }] },
      });
      expect(await wire.client.conversation({ id: 'cv1.a' })).toMatchObject({
        success: true,
        data: { id: 'cv1.a', provider: 'whatsapp', messages: [], truncated: false },
      });
      expect(
        await wire.client.createDraft({
          provider: 'whatsapp',
          account: source.account,
          channel: source.channel,
          text: 'On it.',
        })
      ).toMatchObject({ success: true, data: { id: 'd1', state: 'drafted' } });
      expect(await wire.client.needYou(undefined)).toMatchObject({
        success: true,
        data: { drafts: [{ id: 'd1' }], truncated: false },
      });
      expect(await wire.client.openApprovalApp(undefined)).toEqual({
        success: true,
        data: { opened: true },
      });
    } finally {
      await wire.dispose();
    }
  });

  it('hands a Core policy_denied to the renderer as an error with its code', async () => {
    const core: CoreInvoker = {
      invoke: async () => err({ code: 'policy_denied', message: 'policy_denied' }),
    };
    const wire = createTestWire(messagingContract, createMessagingWireController(core));
    try {
      expect(await wire.client.needYou(undefined)).toEqual({
        success: false,
        error: { code: 'policy_denied', message: 'policy_denied' },
      });
      expect(
        await wire.client.createDraft({
          provider: 'whatsapp',
          account: source.account,
          channel: source.channel,
          text: 'Hi',
        })
      ).toEqual({ success: false, error: { code: 'policy_denied', message: 'policy_denied' } });
    } finally {
      await wire.dispose();
    }
  });

  it('reports why the Mac app could not be opened', async () => {
    const core: CoreInvoker = { invoke: async () => ok(null) };
    const wire = createTestWire(
      messagingContract,
      createMessagingWireController(core, async () =>
        err({ code: 'app_not_found', message: 'The Client Ops Mac app is not installed' })
      )
    );
    try {
      expect(await wire.client.openApprovalApp(undefined)).toEqual({
        success: false,
        error: { code: 'app_not_found', message: 'The Client Ops Mac app is not installed' },
      });
    } finally {
      await wire.dispose();
    }
  });
});
