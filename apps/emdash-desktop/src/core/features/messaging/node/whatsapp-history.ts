import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import type { HistoryInput, HistoryMessage, HistoryPage } from '../api/schemas';

const CHAT_JID = /^[0-9]+(-[0-9]+)?@(s\.whatsapp\.net|g\.us)$/;
const DEFAULT_LIMIT = 100;

/** Where the owner's local WhatsApp bridge keeps its message store. */
export function defaultWhatsAppStorePath(
  env: NodeJS.ProcessEnv = process.env,
  home: string = homedir()
): string {
  return (
    env.CLIENT_OPS_WHATSAPP_STORE?.trim() ||
    join(home, 'Developer', 'whatsapp-mcp', 'whatsapp-bridge', 'store', 'messages.db')
  );
}

type Row = {
  id: string;
  sender: string;
  content: string | null;
  timestamp: string;
  is_from_me: number;
  media_type: string | null;
  filename: string | null;
  sender_name: string | null;
};

const toIso = (timestamp: string): string => new Date(timestamp.replace(' ', 'T')).toISOString();

function toMessage(row: Row): HistoryMessage {
  const fromMe = row.is_from_me === 1;
  const text = row.content?.trim() ? row.content : row.media_type ? `[${row.media_type}]` : '';
  return {
    id: row.id,
    at: toIso(row.timestamp),
    fromMe,
    sender: fromMe ? 'You' : row.sender_name?.trim() || row.sender,
    text,
    attachments: row.filename ? [row.filename] : [],
  };
}

/**
 * Messages of one WhatsApp chat from the local WhatsApp store, newest page first and returned
 * oldest first. The store is opened read-only and only for a chat the caller names; nothing in it
 * is ever written, sent or copied anywhere. An unreadable store is reported as not available.
 */
export function readChatHistory(
  storePath: string,
  input: HistoryInput
): HistoryPage | { error: 'invalid_chat' } {
  if (!CHAT_JID.test(input.channel)) return { error: 'invalid_chat' };
  if (!existsSync(storePath)) return { messages: [], hasMore: false, available: false };
  const limit = input.limit ?? DEFAULT_LIMIT;
  let db: Database.Database | undefined;
  try {
    db = new Database(storePath, { readonly: true, fileMustExist: true });
    const rows = db
      .prepare<
        {
          chat: string;
          before: string | null;
          after: string | null;
          fromMeOnly: number;
          limit: number;
        },
        Row
      >(
        `select m.id, m.sender, m.content, m.timestamp, m.is_from_me, m.media_type, m.filename,
                c.name as sender_name
           from messages m
           left join chats c on c.jid = m.sender || '@s.whatsapp.net'
          where m.chat_jid = @chat
            and m.deleted_at is null
            and (@before is null or datetime(m.timestamp) < datetime(@before))
            and (@after is null or datetime(m.timestamp) > datetime(@after))
            and (@fromMeOnly = 0 or m.is_from_me = 1)
          order by datetime(m.timestamp) desc, m.id desc
          limit @limit`
      )
      .all({
        chat: input.channel,
        before: input.before ?? null,
        after: input.after ?? null,
        fromMeOnly: input.fromMeOnly ? 1 : 0,
        limit: limit + 1,
      });
    const hasMore = rows.length > limit;
    return {
      messages: rows.slice(0, limit).map(toMessage).reverse(),
      hasMore,
      available: true,
    };
  } catch {
    return { messages: [], hasMore: false, available: false };
  } finally {
    db?.close();
  }
}
