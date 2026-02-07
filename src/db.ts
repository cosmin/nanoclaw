import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

import { proto } from '@whiskeysockets/baileys';

import { STORE_DIR } from './config.js';
import { NewMessage, ScheduledTask, TaskRunLog } from './types.js';

let db: Database.Database;

export function initDatabase(): void {
  const dbPath = path.join(STORE_DIR, 'messages.db');
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });

  db = new Database(dbPath);
  db.exec(`
    CREATE TABLE IF NOT EXISTS chats (
      jid TEXT PRIMARY KEY,
      name TEXT,
      last_message_time TEXT
    );
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT,
      chat_jid TEXT,
      sender TEXT,
      sender_name TEXT,
      content TEXT,
      timestamp TEXT,
      PRIMARY KEY (id, chat_jid),
      FOREIGN KEY (chat_jid) REFERENCES chats(jid)
    );
    CREATE INDEX IF NOT EXISTS idx_timestamp ON messages(timestamp);

    CREATE TABLE IF NOT EXISTS scheduled_tasks (
      id TEXT PRIMARY KEY,
      group_folder TEXT NOT NULL,
      chat_jid TEXT NOT NULL,
      prompt TEXT NOT NULL,
      schedule_type TEXT NOT NULL,
      schedule_value TEXT NOT NULL,
      next_run TEXT,
      last_run TEXT,
      last_result TEXT,
      status TEXT DEFAULT 'active',
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_next_run ON scheduled_tasks(next_run);
    CREATE INDEX IF NOT EXISTS idx_status ON scheduled_tasks(status);

    CREATE TABLE IF NOT EXISTS task_run_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id TEXT NOT NULL,
      run_at TEXT NOT NULL,
      duration_ms INTEGER NOT NULL,
      status TEXT NOT NULL,
      result TEXT,
      error TEXT,
      FOREIGN KEY (task_id) REFERENCES scheduled_tasks(id)
    );
    CREATE INDEX IF NOT EXISTS idx_task_run_logs ON task_run_logs(task_id, run_at);
  `);

  // Add context_mode column if it doesn't exist (migration for existing DBs)
  try {
    db.exec(
      `ALTER TABLE scheduled_tasks ADD COLUMN context_mode TEXT DEFAULT 'isolated'`,
    );
  } catch {
    /* column already exists */
  }

  // Create group_participants table (Phase 1: Stranger detection)
  db.exec(`
    CREATE TABLE IF NOT EXISTS group_participants (
      group_jid TEXT NOT NULL,
      user_jid TEXT NOT NULL,
      joined_at TEXT NOT NULL,
      is_active INTEGER DEFAULT 1,
      PRIMARY KEY (group_jid, user_jid)
    );
    CREATE INDEX IF NOT EXISTS idx_group_participants_group
      ON group_participants(group_jid);
    CREATE INDEX IF NOT EXISTS idx_group_participants_user
      ON group_participants(user_jid);
  `);

  // Create stranger_detection_cache table (Phase 1: Performance optimization)
  db.exec(`
    CREATE TABLE IF NOT EXISTS stranger_detection_cache (
      group_jid TEXT PRIMARY KEY,
      has_strangers INTEGER NOT NULL,
      last_checked TEXT NOT NULL,
      participant_snapshot TEXT NOT NULL
    );
  `);

  // Create email_messages table (Phase 1: Email integration)
  db.exec(`
    CREATE TABLE IF NOT EXISTS email_messages (
      message_id TEXT PRIMARY KEY,
      thread_id TEXT NOT NULL,
      from_address TEXT NOT NULL,
      to_address TEXT NOT NULL,
      subject TEXT,
      body TEXT,
      received_at TEXT NOT NULL,
      processed_at TEXT,
      user_tier TEXT,
      session_key TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_email_thread
      ON email_messages(thread_id);
    CREATE INDEX IF NOT EXISTS idx_email_received
      ON email_messages(received_at);
  `);

  // Create email_sent table (Phase 1: Email integration)
  db.exec(`
    CREATE TABLE IF NOT EXISTS email_sent (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      in_reply_to TEXT,
      thread_id TEXT,
      to_address TEXT NOT NULL,
      subject TEXT NOT NULL,
      body TEXT NOT NULL,
      sent_at TEXT NOT NULL,
      smtp_message_id TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_email_sent_thread
      ON email_sent(thread_id);
  `);
}

/**
 * Store chat metadata only (no message content).
 * Used for all chats to enable group discovery without storing sensitive content.
 */
export function storeChatMetadata(
  chatJid: string,
  timestamp: string,
  name?: string,
): void {
  if (name) {
    // Update with name, preserving existing timestamp if newer
    db.prepare(
      `
      INSERT INTO chats (jid, name, last_message_time) VALUES (?, ?, ?)
      ON CONFLICT(jid) DO UPDATE SET
        name = excluded.name,
        last_message_time = MAX(last_message_time, excluded.last_message_time)
    `,
    ).run(chatJid, name, timestamp);
  } else {
    // Update timestamp only, preserve existing name if any
    db.prepare(
      `
      INSERT INTO chats (jid, name, last_message_time) VALUES (?, ?, ?)
      ON CONFLICT(jid) DO UPDATE SET
        last_message_time = MAX(last_message_time, excluded.last_message_time)
    `,
    ).run(chatJid, chatJid, timestamp);
  }
}

/**
 * Update chat name without changing timestamp for existing chats.
 * New chats get the current time as their initial timestamp.
 * Used during group metadata sync.
 */
export function updateChatName(chatJid: string, name: string): void {
  db.prepare(
    `
    INSERT INTO chats (jid, name, last_message_time) VALUES (?, ?, ?)
    ON CONFLICT(jid) DO UPDATE SET name = excluded.name
  `,
  ).run(chatJid, name, new Date().toISOString());
}

export interface ChatInfo {
  jid: string;
  name: string;
  last_message_time: string;
}

/**
 * Get all known chats, ordered by most recent activity.
 */
export function getAllChats(): ChatInfo[] {
  return db
    .prepare(
      `
    SELECT jid, name, last_message_time
    FROM chats
    ORDER BY last_message_time DESC
  `,
    )
    .all() as ChatInfo[];
}

/**
 * Get timestamp of last group metadata sync.
 */
export function getLastGroupSync(): string | null {
  // Store sync time in a special chat entry
  const row = db
    .prepare(`SELECT last_message_time FROM chats WHERE jid = '__group_sync__'`)
    .get() as { last_message_time: string } | undefined;
  return row?.last_message_time || null;
}

/**
 * Record that group metadata was synced.
 */
export function setLastGroupSync(): void {
  const now = new Date().toISOString();
  db.prepare(
    `INSERT OR REPLACE INTO chats (jid, name, last_message_time) VALUES ('__group_sync__', '__group_sync__', ?)`,
  ).run(now);
}

/**
 * Store a message with full content.
 * Only call this for registered groups where message history is needed.
 * Bot's own outgoing messages are never stored (filtered at the upsert handler).
 */
export function storeMessage(
  msg: proto.IWebMessageInfo,
  chatJid: string,
  pushName?: string,
): void {
  if (!msg.key) return;

  const content =
    msg.message?.conversation ||
    msg.message?.extendedTextMessage?.text ||
    msg.message?.imageMessage?.caption ||
    msg.message?.videoMessage?.caption ||
    '';

  const timestamp = new Date(Number(msg.messageTimestamp) * 1000).toISOString();
  const sender = msg.key.participant || msg.key.remoteJid || '';
  const senderName = pushName || sender.split('@')[0];
  const msgId = msg.key.id || '';

  db.prepare(
    `INSERT OR REPLACE INTO messages (id, chat_jid, sender, sender_name, content, timestamp) VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(
    msgId,
    chatJid,
    sender,
    senderName,
    content,
    timestamp,
  );
}

export function getNewMessages(
  jids: string[],
  lastTimestamp: string,
): { messages: NewMessage[]; newTimestamp: string } {
  if (jids.length === 0) return { messages: [], newTimestamp: lastTimestamp };

  const placeholders = jids.map(() => '?').join(',');
  const sql = `
    SELECT id, chat_jid, sender, sender_name, content, timestamp
    FROM messages
    WHERE timestamp > ? AND chat_jid IN (${placeholders})
    ORDER BY timestamp
  `;

  const rows = db
    .prepare(sql)
    .all(lastTimestamp, ...jids) as NewMessage[];

  let newTimestamp = lastTimestamp;
  for (const row of rows) {
    if (row.timestamp > newTimestamp) newTimestamp = row.timestamp;
  }

  return { messages: rows, newTimestamp };
}

export function getMessagesSince(
  chatJid: string,
  sinceTimestamp: string,
): NewMessage[] {
  const sql = `
    SELECT id, chat_jid, sender, sender_name, content, timestamp
    FROM messages
    WHERE chat_jid = ? AND timestamp > ?
    ORDER BY timestamp
  `;
  return db
    .prepare(sql)
    .all(chatJid, sinceTimestamp) as NewMessage[];
}

export function createTask(
  task: Omit<ScheduledTask, 'last_run' | 'last_result'>,
): void {
  db.prepare(
    `
    INSERT INTO scheduled_tasks (id, group_folder, chat_jid, prompt, schedule_type, schedule_value, context_mode, next_run, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `,
  ).run(
    task.id,
    task.group_folder,
    task.chat_jid,
    task.prompt,
    task.schedule_type,
    task.schedule_value,
    task.context_mode || 'isolated',
    task.next_run,
    task.status,
    task.created_at,
  );
}

export function getTaskById(id: string): ScheduledTask | undefined {
  return db.prepare('SELECT * FROM scheduled_tasks WHERE id = ?').get(id) as
    | ScheduledTask
    | undefined;
}

export function getTasksForGroup(groupFolder: string): ScheduledTask[] {
  return db
    .prepare(
      'SELECT * FROM scheduled_tasks WHERE group_folder = ? ORDER BY created_at DESC',
    )
    .all(groupFolder) as ScheduledTask[];
}

export function getAllTasks(): ScheduledTask[] {
  return db
    .prepare('SELECT * FROM scheduled_tasks ORDER BY created_at DESC')
    .all() as ScheduledTask[];
}

export function updateTask(
  id: string,
  updates: Partial<
    Pick<
      ScheduledTask,
      'prompt' | 'schedule_type' | 'schedule_value' | 'next_run' | 'status'
    >
  >,
): void {
  const fields: string[] = [];
  const values: unknown[] = [];

  if (updates.prompt !== undefined) {
    fields.push('prompt = ?');
    values.push(updates.prompt);
  }
  if (updates.schedule_type !== undefined) {
    fields.push('schedule_type = ?');
    values.push(updates.schedule_type);
  }
  if (updates.schedule_value !== undefined) {
    fields.push('schedule_value = ?');
    values.push(updates.schedule_value);
  }
  if (updates.next_run !== undefined) {
    fields.push('next_run = ?');
    values.push(updates.next_run);
  }
  if (updates.status !== undefined) {
    fields.push('status = ?');
    values.push(updates.status);
  }

  if (fields.length === 0) return;

  values.push(id);
  db.prepare(
    `UPDATE scheduled_tasks SET ${fields.join(', ')} WHERE id = ?`,
  ).run(...values);
}

export function deleteTask(id: string): void {
  // Delete child records first (FK constraint)
  db.prepare('DELETE FROM task_run_logs WHERE task_id = ?').run(id);
  db.prepare('DELETE FROM scheduled_tasks WHERE id = ?').run(id);
}

export function getDueTasks(): ScheduledTask[] {
  const now = new Date().toISOString();
  return db
    .prepare(
      `
    SELECT * FROM scheduled_tasks
    WHERE status = 'active' AND next_run IS NOT NULL AND next_run <= ?
    ORDER BY next_run
  `,
    )
    .all(now) as ScheduledTask[];
}

export function updateTaskAfterRun(
  id: string,
  nextRun: string | null,
  lastResult: string,
): void {
  const now = new Date().toISOString();
  db.prepare(
    `
    UPDATE scheduled_tasks
    SET next_run = ?, last_run = ?, last_result = ?, status = CASE WHEN ? IS NULL THEN 'completed' ELSE status END
    WHERE id = ?
  `,
  ).run(nextRun, now, lastResult, nextRun, id);
}

export function logTaskRun(log: TaskRunLog): void {
  db.prepare(
    `
    INSERT INTO task_run_logs (task_id, run_at, duration_ms, status, result, error)
    VALUES (?, ?, ?, ?, ?, ?)
  `,
  ).run(
    log.task_id,
    log.run_at,
    log.duration_ms,
    log.status,
    log.result,
    log.error,
  );
}

export function getTaskRunLogs(taskId: string, limit = 10): TaskRunLog[] {
  return db
    .prepare(
      `
    SELECT task_id, run_at, duration_ms, status, result, error
    FROM task_run_logs
    WHERE task_id = ?
    ORDER BY run_at DESC
    LIMIT ?
  `,
    )
    .all(taskId, limit) as TaskRunLog[];
}

/**
 * Update group participants in the database.
 * Marks existing participants as inactive and inserts/activates current participants.
 * Uses a transaction to make the change atomic.
 */
export function updateGroupParticipants(
  groupJid: string,
  participants: string[],
): void {
  const now = new Date().toISOString();

  // Wrap in a transaction to make the update atomic
  const tx = db.transaction(
    (txGroupJid: string, txParticipants: string[], txNow: string) => {
      // Mark all existing participants as inactive
      db.prepare(
        `UPDATE group_participants SET is_active = 0 WHERE group_jid = ?`,
      ).run(txGroupJid);

      // Insert or reactivate each participant
      const stmt = db.prepare(`
        INSERT INTO group_participants (group_jid, user_jid, joined_at, is_active)
        VALUES (?, ?, ?, 1)
        ON CONFLICT(group_jid, user_jid) DO UPDATE SET is_active = 1
      `);

      for (const participant of txParticipants) {
        stmt.run(txGroupJid, participant, txNow);
      }
    },
  );

  tx(groupJid, participants, now);
}

/**
 * Get all active participants for a group.
 */
export function getGroupParticipants(groupJid: string): string[] {
  const rows = db
    .prepare(
      `
    SELECT user_jid
    FROM group_participants
    WHERE group_jid = ? AND is_active = 1
  `,
    )
    .all(groupJid) as { user_jid: string }[];

  return rows.map((row) => row.user_jid);
}

/**
 * Get stranger detection cache for a group.
 */
export function getStrangerCache(groupJid: string): {
  has_strangers: number;
  last_checked: string;
  participant_snapshot: string;
} | null {
  const row = db
    .prepare(
      `
    SELECT has_strangers, last_checked, participant_snapshot
    FROM stranger_detection_cache
    WHERE group_jid = ?
  `,
    )
    .get(groupJid) as
    | {
        has_strangers: number;
        last_checked: string;
        participant_snapshot: string;
      }
    | undefined;

  return row || null;
}

/**
 * Set stranger detection cache for a group.
 */
export function setStrangerCache(
  groupJid: string,
  hasStrangers: boolean,
  participants: string[],
): void {
  const now = new Date().toISOString();
  // Sort a copy of the array to avoid mutating the caller's array
  const snapshot = JSON.stringify([...participants].sort());

  db.prepare(
    `
    INSERT OR REPLACE INTO stranger_detection_cache (group_jid, has_strangers, last_checked, participant_snapshot)
    VALUES (?, ?, ?, ?)
  `,
  ).run(groupJid, hasStrangers ? 1 : 0, now, snapshot);
}

/**
 * Clear stranger detection cache for a specific group.
 */
export function clearStrangerCacheForGroup(groupJid: string): void {
  db.prepare(`DELETE FROM stranger_detection_cache WHERE group_jid = ?`).run(
    groupJid,
  );
}
