import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { defaultWhatsAppStorePath, readChatHistory } from './whatsapp-history';

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function store(): string {
  const dir = mkdtempSync(join(tmpdir(), 'wa-'));
  dirs.push(dir);
  const path = join(dir, 'messages.db');
  const db = new Database(path);
  db.exec(`create table chats (jid text primary key, name text);
    create table messages (id text, chat_jid text, sender text, content text, timestamp text,
      is_from_me boolean, media_type text, filename text, deleted_at text, primary key (id, chat_jid));`);
  db.prepare('insert into chats values (?, ?)').run('111@s.whatsapp.net', 'Stephen Ellis');
  const add = db.prepare('insert into messages values (?,?,?,?,?,?,?,?,?)');
  const chat = '111@s.whatsapp.net';
  add.run('m1', chat, '111', 'First', '2026-10-20 10:00:00+01:00', 0, null, null, null);
  add.run('m2', chat, '999', 'My reply', '2026-10-20 10:05:00+01:00', 1, null, null, null);
  add.run('m3', chat, '111', '', '2026-10-21 09:00:00+01:00', 0, 'image', 'photo.jpg', null);
  add.run(
    'm4',
    chat,
    '111',
    'Removed',
    '2026-10-21 10:00:00+01:00',
    0,
    null,
    null,
    '2026-10-21 10:01:00'
  );
  add.run('m5', chat, '111', 'Newest', '2026-10-22 09:00:00+01:00', 0, null, null, null);
  add.run(
    'x1',
    '222@s.whatsapp.net',
    '222',
    'Other chat',
    '2026-10-22 09:00:00+01:00',
    0,
    null,
    null,
    null
  );
  db.close();
  return path;
}

const read = (path: string, input: Parameters<typeof readChatHistory>[1]) => {
  const result = readChatHistory(path, input);
  if ('error' in result) throw new Error(result.error);
  return result;
};

describe('readChatHistory', () => {
  it('returns one chat oldest first, skipping deleted messages and other chats', () => {
    const page = read(store(), { channel: '111@s.whatsapp.net' });
    expect(page.messages.map((m) => m.id)).toEqual(['m1', 'm2', 'm3', 'm5']);
    expect(page.available).toBe(true);
    expect(page.hasMore).toBe(false);
  });

  it('names the sender, marks the owner as You and shows media as a placeholder with its file', () => {
    const page = read(store(), { channel: '111@s.whatsapp.net' });
    expect(page.messages[0]).toMatchObject({
      sender: 'Stephen Ellis',
      fromMe: false,
      text: 'First',
    });
    expect(page.messages[1]).toMatchObject({ sender: 'You', fromMe: true });
    expect(page.messages[2]).toMatchObject({ text: '[image]', attachments: ['photo.jpg'] });
  });

  it('pages backwards from a point in time and says when more exists', () => {
    const path = store();
    const newest = read(path, { channel: '111@s.whatsapp.net', limit: 2 });
    expect(newest.messages.map((m) => m.id)).toEqual(['m3', 'm5']);
    expect(newest.hasMore).toBe(true);
    const older = read(path, {
      channel: '111@s.whatsapp.net',
      before: newest.messages[0]!.at,
      limit: 2,
    });
    expect(older.messages.map((m) => m.id)).toEqual(['m1', 'm2']);
    expect(older.hasMore).toBe(false);
  });

  it("can return only the owner's own messages after a point in time", () => {
    const page = read(store(), {
      channel: '111@s.whatsapp.net',
      fromMeOnly: true,
      after: '2026-10-20T09:00:00.000Z',
    });
    expect(page.messages.map((m) => m.id)).toEqual(['m2']);
  });

  it('refuses anything that is not a WhatsApp chat id and reports a missing store', () => {
    expect(readChatHistory(store(), { channel: "1'; drop table messages;--" })).toEqual({
      error: 'invalid_chat',
    });
    expect(readChatHistory('/nonexistent/messages.db', { channel: '111@s.whatsapp.net' })).toEqual({
      messages: [],
      hasMore: false,
      available: false,
    });
  });
});

describe('defaultWhatsAppStorePath', () => {
  it("uses the override or the bridge's usual place", () => {
    expect(defaultWhatsAppStorePath({ CLIENT_OPS_WHATSAPP_STORE: '/x/messages.db' }, '/h')).toBe(
      '/x/messages.db'
    );
    expect(defaultWhatsAppStorePath({}, '/h')).toBe(
      '/h/Developer/whatsapp-mcp/whatsapp-bridge/store/messages.db'
    );
  });
});
