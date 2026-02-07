import { exec, execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

import makeWASocket, {
  DisconnectReason,
  WASocket,
  makeCacheableSignalKeyStore,
  useMultiFileAuthState,
} from '@whiskeysockets/baileys';

import {
  ASSISTANT_NAME,
  DATA_DIR,
  IPC_POLL_INTERVAL,
  MAIN_GROUP_FOLDER,
  POLL_INTERVAL,
  STORE_DIR,
  TIMEZONE,
  TRIGGER_PATTERN,
} from './config.js';
import {
  AvailableGroup,
  runContainerAgent,
  writeGroupsSnapshot,
  writeTasksSnapshot,
} from './container-runner.js';
import {
  getAllChats,
  getAllTasks,
  getLastGroupSync,
  getMessagesSince,
  getNewMessages,
  getTaskById,
  initDatabase,
  setLastGroupSync,
  storeChatMetadata,
  storeMessage,
  updateChatName,
} from './db.js';
import { startSchedulerLoop } from './task-scheduler.js';
import { ContextTier, NewMessage, RegisteredGroup, Session } from './types.js';
import { loadJson, saveJson } from './utils.js';
import { logger } from './logger.js';
import { getUserTier, getUsersByTier } from './user-registry.js';
import {
  canInvoke,
  hasStrangers,
  determineAgentContext,
} from './authorization.js';

const GROUP_SYNC_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours

let sock: WASocket;
let lastTimestamp = '';
let sessions: Session = {};
let registeredGroups: Record<string, RegisteredGroup> = {};
let lastAgentTimestamp: Record<string, string> = {};
// LID to phone number mapping loaded from Baileys auth state
let lidToPhoneMap: Record<string, string> = {};
// Guards to prevent duplicate loops on WhatsApp reconnect
let messageLoopRunning = false;
let ipcWatcherRunning = false;
let groupSyncTimerStarted = false;

/**
 * Load all LID→phone mappings from Baileys auth state files.
 * Baileys stores reverse mappings as `lid-mapping-{lidUser}_reverse.json` → phoneUser.
 */
function loadLidMappings(): void {
  const authDir = path.join(STORE_DIR, 'auth');
  try {
    const files = fs.readdirSync(authDir);
    let count = 0;
    for (const file of files) {
      const match = file.match(/^lid-mapping-(\d+)_reverse\.json$/);
      if (!match) continue;
      const lidUser = match[1];
      try {
        const phoneUser = JSON.parse(fs.readFileSync(path.join(authDir, file), 'utf-8'));
        if (typeof phoneUser === 'string') {
          lidToPhoneMap[lidUser] = `${phoneUser}@s.whatsapp.net`;
          count++;
        }
      } catch {
        // skip invalid files
      }
    }
    logger.info({ count }, 'Loaded LID-to-phone mappings from auth state');
  } catch (err) {
    logger.warn({ err }, 'Failed to load LID mappings from auth state');
  }
}

/**
 * Translate a JID from LID format to phone format using Baileys mappings.
 * Returns the original JID if no mapping exists.
 */
function translateJid(jid: string): string {
  if (!jid.endsWith('@lid')) return jid;
  const lidUser = jid.split('@')[0].split(':')[0];
  const phoneJid = lidToPhoneMap[lidUser];
  if (phoneJid) {
    logger.debug({ lidJid: jid, phoneJid }, 'Translated LID to phone JID');
    return phoneJid;
  }
  return jid;
}

async function setTyping(jid: string, isTyping: boolean): Promise<void> {
  try {
    await sock.sendPresenceUpdate(isTyping ? 'composing' : 'paused', jid);
  } catch (err) {
    logger.debug({ jid, err }, 'Failed to update typing status');
  }
}

function loadState(): void {
  const statePath = path.join(DATA_DIR, 'router_state.json');
  const state = loadJson<{
    last_timestamp?: string;
    last_agent_timestamp?: Record<string, string>;
  }>(statePath, {});
  lastTimestamp = state.last_timestamp || '';
  lastAgentTimestamp = state.last_agent_timestamp || {};
  sessions = loadJson(path.join(DATA_DIR, 'sessions.json'), {});
  registeredGroups = loadJson(
    path.join(DATA_DIR, 'registered_groups.json'),
    {},
  );
  logger.info(
    { groupCount: Object.keys(registeredGroups).length },
    'State loaded',
  );
}

function saveState(): void {
  saveJson(path.join(DATA_DIR, 'router_state.json'), {
    last_timestamp: lastTimestamp,
    last_agent_timestamp: lastAgentTimestamp,
  });
  saveJson(path.join(DATA_DIR, 'sessions.json'), sessions);
}

function registerGroup(jid: string, group: RegisteredGroup): void {
  registeredGroups[jid] = group;
  saveJson(path.join(DATA_DIR, 'registered_groups.json'), registeredGroups);

  // Create group folder
  const groupDir = path.join(DATA_DIR, '..', 'groups', group.folder);
  fs.mkdirSync(path.join(groupDir, 'logs'), { recursive: true });

  logger.info(
    { jid, name: group.name, folder: group.folder },
    'Group registered',
  );
}

/**
 * Sync group metadata from WhatsApp.
 * Fetches all participating groups and stores their names in the database.
 * Called on startup, daily, and on-demand via IPC.
 */
async function syncGroupMetadata(force = false): Promise<void> {
  // Check if we need to sync (skip if synced recently, unless forced)
  if (!force) {
    const lastSync = getLastGroupSync();
    if (lastSync) {
      const lastSyncTime = new Date(lastSync).getTime();
      const now = Date.now();
      if (now - lastSyncTime < GROUP_SYNC_INTERVAL_MS) {
        logger.debug({ lastSync }, 'Skipping group sync - synced recently');
        return;
      }
    }
  }

  try {
    logger.info('Syncing group metadata from WhatsApp...');
    const groups = await sock.groupFetchAllParticipating();

    let count = 0;
    for (const [jid, metadata] of Object.entries(groups)) {
      if (metadata.subject) {
        updateChatName(jid, metadata.subject);
        count++;
      }
    }

    setLastGroupSync();
    logger.info({ count }, 'Group metadata synced');
  } catch (err) {
    logger.error({ err }, 'Failed to sync group metadata');
  }
}

/**
 * Get available groups list for the agent.
 * Returns groups ordered by most recent activity.
 */
function getAvailableGroups(): AvailableGroup[] {
  const chats = getAllChats();
  const registeredJids = new Set(Object.keys(registeredGroups));

  return chats
    .filter((c) => c.jid !== '__group_sync__' && c.jid.endsWith('@g.us'))
    .map((c) => ({
      jid: c.jid,
      name: c.name,
      lastActivity: c.last_message_time,
      isRegistered: registeredJids.has(c.jid),
    }));
}

async function processMessage(msg: NewMessage): Promise<void> {
  const group = registeredGroups[msg.chat_jid];
  if (!group) return;

  const content = msg.content.trim();
  const isMainGroup = group.folder === MAIN_GROUP_FOLDER;
  const isGroupChat = msg.chat_jid.endsWith('@g.us');
  const senderJid = translateJid(msg.sender);

  // ========== PHASE 2: TIER-BASED AUTHORIZATION ==========

  // Get sender tier
  const senderTier = getUserTier(senderJid);
  logger.info(
    { senderJid, senderTier, chatJid: msg.chat_jid },
    '[authorization] Message received',
  );

  // Stranger detection for group chats
  if (isGroupChat) {
    try {
      const metadata = await sock.groupMetadata(msg.chat_jid);
      const participants = metadata.participants.map((p) => p.id);

      if (hasStrangers(msg.chat_jid, participants)) {
        logger.warn(
          {
            chatJid: msg.chat_jid,
            groupName: group.name,
            senderJid,
          },
          '[authorization] Strangers detected in group - ignoring thread',
        );

        // Notify owner about stranger in group
        const ownerUsers = getUsersByTier('owner');
        if (ownerUsers.length > 0 && ownerUsers[0].jid) {
          const ownerJid = ownerUsers[0].jid;
          const warningMsg = `⚠️ Security Alert: Strangers detected in group "${group.name}". All messages from this group are being ignored until strangers are removed or added to your user registry.`;
          await sendMessage(ownerJid, warningMsg);
          logger.info(
            { ownerJid, groupName: group.name },
            '[authorization] Notified owner of strangers in group',
          );
        }
        return; // Ignore entire thread
      }
    } catch (err) {
      logger.error(
        { err, chatJid: msg.chat_jid },
        '[authorization] Failed to fetch group metadata for stranger detection',
      );
      // Fail secure: if we can't check for strangers, don't process
      return;
    }
  }

  // Check message trigger (main group or explicit @trigger)
  const hasTrigger = isMainGroup || TRIGGER_PATTERN.test(content);

  // Authorization check: can this user invoke Jarvis?
  const authResult = canInvoke(senderJid, isGroupChat);

  // Handle based on authorization result and trigger
  if (!authResult.canInvoke) {
    // Friends and strangers cannot invoke Jarvis
    if (senderTier === 'friend' && hasTrigger) {
      logger.info(
        {
          senderJid,
          senderTier,
          chatJid: msg.chat_jid,
        },
        '[authorization] Friend attempted to invoke - storing as passive context only',
      );
      // Message is already stored in DB - just don't process
      return;
    }

    // Strangers are ignored completely (already handled above for groups)
    logger.info(
      {
        senderJid,
        senderTier,
        reason: authResult.reason,
      },
      '[authorization] User cannot invoke - ignoring',
    );
    return;
  }

  // Owner/Family can invoke - check for trigger requirement
  if (!hasTrigger) {
    // Store as passive context for later use
    logger.debug(
      {
        senderJid,
        senderTier,
        chatJid: msg.chat_jid,
      },
      '[authorization] Authorized user message without trigger - passive context',
    );
    return;
  }

  // ========== LEGACY GROUP-BASED CHECK (Dual Authorization) ==========
  // Keep existing group registration checks as fallback
  if (!isMainGroup && !TRIGGER_PATTERN.test(content)) {
    return;
  }

  // ========== MESSAGE PROCESSING ==========

  // Determine which agent context to use based on tier and group config
  const agentContextTier = determineAgentContext(
    senderTier,
    group.contextTier,
  );
  logger.info(
    {
      senderTier,
      groupContextTier: group.contextTier,
      agentContextTier,
    },
    '[authorization] Determined agent context',
  );

  // Get all messages since last agent interaction so the session has full context
  const sinceTimestamp = lastAgentTimestamp[msg.chat_jid] || '';
  const missedMessages = getMessagesSince(
    msg.chat_jid,
    sinceTimestamp,
  );

  const lines = missedMessages.map((m) => {
    // Escape XML special characters in content
    const escapeXml = (s: string) =>
      s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    return `<message sender="${escapeXml(m.sender_name)}" time="${m.timestamp}">${escapeXml(m.content)}</message>`;
  });
  const prompt = `<messages>\n${lines.join('\n')}\n</messages>`;

  if (!prompt) return;

  logger.info(
    {
      group: group.name,
      messageCount: missedMessages.length,
      senderTier,
      agentContextTier,
    },
    'Processing message',
  );

  await setTyping(msg.chat_jid, true);
  const response = await runAgent(group, prompt, msg.chat_jid, agentContextTier);
  await setTyping(msg.chat_jid, false);

  if (response) {
    lastAgentTimestamp[msg.chat_jid] = msg.timestamp;
    await sendMessage(msg.chat_jid, response);
  }
}


async function runAgent(
  group: RegisteredGroup,
  prompt: string,
  chatJid: string,
  effectiveTier?: ContextTier,
): Promise<string | null> {
  const isMain = group.folder === MAIN_GROUP_FOLDER;
  const sessionId = sessions[group.folder];

  // Update tasks snapshot for container to read (filtered by group)
  const tasks = getAllTasks();
  writeTasksSnapshot(
    group.folder,
    isMain,
    tasks.map((t) => ({
      id: t.id,
      groupFolder: t.group_folder,
      prompt: t.prompt,
      schedule_type: t.schedule_type,
      schedule_value: t.schedule_value,
      status: t.status,
      next_run: t.next_run,
    })),
  );

  // Update available groups snapshot (main group only can see all groups)
  const availableGroups = getAvailableGroups();
  writeGroupsSnapshot(
    group.folder,
    isMain,
    availableGroups,
    new Set(Object.keys(registeredGroups)),
  );

  try {
    const output = await runContainerAgent(group, {
      prompt,
      sessionId,
      groupFolder: group.folder,
      chatJid,
      isMain,
      effectiveTier,
    });

    if (output.newSessionId) {
      sessions[group.folder] = output.newSessionId;
      saveJson(path.join(DATA_DIR, 'sessions.json'), sessions);
    }

    if (output.status === 'error') {
      logger.error(
        { group: group.name, error: output.error },
        'Container agent error',
      );
      return null;
    }

    return output.result;
  } catch (err) {
    logger.error({ group: group.name, err }, 'Agent error');
    return null;
  }
}

async function sendMessage(jid: string, text: string): Promise<void> {
  try {
    await sock.sendMessage(jid, { text });
    logger.info({ jid, length: text.length }, 'Message sent');
  } catch (err) {
    logger.error({ jid, err }, 'Failed to send message');
  }
}

function startIpcWatcher(): void {
  if (ipcWatcherRunning) {
    logger.debug('IPC watcher already running, skipping duplicate start');
    return;
  }
  ipcWatcherRunning = true;

  const ipcBaseDir = path.join(DATA_DIR, 'ipc');
  fs.mkdirSync(ipcBaseDir, { recursive: true });

  const processIpcFiles = async () => {
    // Scan all group IPC directories (identity determined by directory)
    let groupFolders: string[];
    try {
      groupFolders = fs.readdirSync(ipcBaseDir).filter((f) => {
        const stat = fs.statSync(path.join(ipcBaseDir, f));
        return stat.isDirectory() && f !== 'errors';
      });
    } catch (err) {
      logger.error({ err }, 'Error reading IPC base directory');
      setTimeout(processIpcFiles, IPC_POLL_INTERVAL);
      return;
    }

    for (const sourceGroup of groupFolders) {
      const isMain = sourceGroup === MAIN_GROUP_FOLDER;
      const messagesDir = path.join(ipcBaseDir, sourceGroup, 'messages');
      const tasksDir = path.join(ipcBaseDir, sourceGroup, 'tasks');

      // Process messages from this group's IPC directory
      try {
        if (fs.existsSync(messagesDir)) {
          const messageFiles = fs
            .readdirSync(messagesDir)
            .filter((f) => f.endsWith('.json'));
          for (const file of messageFiles) {
            const filePath = path.join(messagesDir, file);
            try {
              const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
              if (data.type === 'message' && data.chatJid && data.text) {
                // Authorization: verify this group can send to this chatJid
                const targetGroup = registeredGroups[data.chatJid];
                if (
                  isMain ||
                  (targetGroup && targetGroup.folder === sourceGroup)
                ) {
                    await sendMessage(
                    data.chatJid,
                    data.text,
                  );
                  logger.info(
                    { chatJid: data.chatJid, sourceGroup },
                    'IPC message sent',
                  );
                } else {
                  logger.warn(
                    { chatJid: data.chatJid, sourceGroup },
                    'Unauthorized IPC message attempt blocked',
                  );
                }
              }
              fs.unlinkSync(filePath);
            } catch (err) {
              logger.error(
                { file, sourceGroup, err },
                'Error processing IPC message',
              );
              const errorDir = path.join(ipcBaseDir, 'errors');
              fs.mkdirSync(errorDir, { recursive: true });
              fs.renameSync(
                filePath,
                path.join(errorDir, `${sourceGroup}-${file}`),
              );
            }
          }
        }
      } catch (err) {
        logger.error(
          { err, sourceGroup },
          'Error reading IPC messages directory',
        );
      }

      // Process tasks from this group's IPC directory
      try {
        if (fs.existsSync(tasksDir)) {
          const taskFiles = fs
            .readdirSync(tasksDir)
            .filter((f) => f.endsWith('.json'));
          for (const file of taskFiles) {
            const filePath = path.join(tasksDir, file);
            try {
              const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
              // Pass source group identity to processTaskIpc for authorization
              await processTaskIpc(data, sourceGroup, isMain);
              fs.unlinkSync(filePath);
            } catch (err) {
              logger.error(
                { file, sourceGroup, err },
                'Error processing IPC task',
              );
              const errorDir = path.join(ipcBaseDir, 'errors');
              fs.mkdirSync(errorDir, { recursive: true });
              fs.renameSync(
                filePath,
                path.join(errorDir, `${sourceGroup}-${file}`),
              );
            }
          }
        }
      } catch (err) {
        logger.error({ err, sourceGroup }, 'Error reading IPC tasks directory');
      }
    }

    setTimeout(processIpcFiles, IPC_POLL_INTERVAL);
  };

  processIpcFiles();
  logger.info('IPC watcher started (per-group namespaces)');
}

async function processTaskIpc(
  data: {
    type: string;
    taskId?: string;
    prompt?: string;
    schedule_type?: string;
    schedule_value?: string;
    context_mode?: string;
    groupFolder?: string;
    chatJid?: string;
    // For register_group
    jid?: string;
    name?: string;
    folder?: string;
    trigger?: string;
    containerConfig?: RegisteredGroup['containerConfig'];
    // For user management
    userJid?: string;
    userName?: string;
    tier?: 'family' | 'friend';
  },
  sourceGroup: string, // Verified identity from IPC directory
  isMain: boolean, // Verified from directory path
): Promise<void> {
  // Import db functions dynamically to avoid circular deps
  const {
    createTask,
    updateTask,
    deleteTask,
    getTaskById: getTask,
  } = await import('./db.js');
  const { CronExpressionParser } = await import('cron-parser');
  const {
    addUser,
    removeUser,
    getUsersByTier,
    getUserTier: getTier,
  } = await import('./user-registry.js');

  // Determine privilege level from group's context tier
  const group = Object.values(registeredGroups).find(
    (g) => g.folder === sourceGroup,
  );
  const contextTier = group?.contextTier || 'friend';
  const isOwner = contextTier === 'owner';
  const isFamily = contextTier === 'family';

  switch (data.type) {
    case 'schedule_task':
      if (
        data.prompt &&
        data.schedule_type &&
        data.schedule_value &&
        data.groupFolder
      ) {
        // Authorization: Only owner and family can schedule tasks
        // Friends cannot schedule tasks
        const targetGroup = data.groupFolder;
        if (!isOwner && !isFamily) {
          logger.warn(
            { contextTier, sourceGroup, targetGroup },
            'Insufficient privilege for schedule_task',
          );
          break;
        }
        if (!isOwner && targetGroup !== sourceGroup) {
          logger.warn(
            { contextTier, sourceGroup, targetGroup },
            'Unauthorized schedule_task attempt blocked',
          );
          break;
        }

        // Resolve the correct JID for the target group (don't trust IPC payload)
        const targetJid = Object.entries(registeredGroups).find(
          ([, group]) => group.folder === targetGroup,
        )?.[0];

        if (!targetJid) {
          logger.warn(
            { targetGroup },
            'Cannot schedule task: target group not registered',
          );
          break;
        }

        const scheduleType = data.schedule_type as 'cron' | 'interval' | 'once';

        let nextRun: string | null = null;
        if (scheduleType === 'cron') {
          try {
            const interval = CronExpressionParser.parse(data.schedule_value, {
              tz: TIMEZONE,
            });
            nextRun = interval.next().toISOString();
          } catch {
            logger.warn(
              { scheduleValue: data.schedule_value },
              'Invalid cron expression',
            );
            break;
          }
        } else if (scheduleType === 'interval') {
          const ms = parseInt(data.schedule_value, 10);
          if (isNaN(ms) || ms <= 0) {
            logger.warn(
              { scheduleValue: data.schedule_value },
              'Invalid interval',
            );
            break;
          }
          nextRun = new Date(Date.now() + ms).toISOString();
        } else if (scheduleType === 'once') {
          const scheduled = new Date(data.schedule_value);
          if (isNaN(scheduled.getTime())) {
            logger.warn(
              { scheduleValue: data.schedule_value },
              'Invalid timestamp',
            );
            break;
          }
          nextRun = scheduled.toISOString();
        }

        const taskId = `task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const contextMode =
          data.context_mode === 'group' || data.context_mode === 'isolated'
            ? data.context_mode
            : 'isolated';
        createTask({
          id: taskId,
          group_folder: targetGroup,
          chat_jid: targetJid,
          prompt: data.prompt,
          schedule_type: scheduleType,
          schedule_value: data.schedule_value,
          context_mode: contextMode,
          next_run: nextRun,
          status: 'active',
          created_at: new Date().toISOString(),
        });
        logger.info(
          { taskId, sourceGroup, targetGroup, contextMode, contextTier },
          'Task created via IPC',
        );
      }
      break;

    case 'pause_task':
      if (data.taskId) {
        const task = getTask(data.taskId);
        if (task && (isOwner || (isFamily && task.group_folder === sourceGroup))) {
          updateTask(data.taskId, { status: 'paused' });
          logger.info(
            { taskId: data.taskId, sourceGroup, contextTier },
            'Task paused via IPC',
          );
        } else {
          logger.warn(
            { taskId: data.taskId, sourceGroup, contextTier },
            'Unauthorized task pause attempt',
          );
        }
      }
      break;

    case 'resume_task':
      if (data.taskId) {
        const task = getTask(data.taskId);
        if (task && (isOwner || (isFamily && task.group_folder === sourceGroup))) {
          updateTask(data.taskId, { status: 'active' });
          logger.info(
            { taskId: data.taskId, sourceGroup, contextTier },
            'Task resumed via IPC',
          );
        } else {
          logger.warn(
            { taskId: data.taskId, sourceGroup, contextTier },
            'Unauthorized task resume attempt',
          );
        }
      }
      break;

    case 'cancel_task':
      if (data.taskId) {
        const task = getTask(data.taskId);
        if (task && (isOwner || (isFamily && task.group_folder === sourceGroup))) {
          deleteTask(data.taskId);
          logger.info(
            { taskId: data.taskId, sourceGroup, contextTier },
            'Task cancelled via IPC',
          );
        } else {
          logger.warn(
            { taskId: data.taskId, sourceGroup, contextTier },
            'Unauthorized task cancel attempt',
          );
        }
      }
      break;

    case 'refresh_groups':
      // Only owner can request a refresh
      if (isOwner) {
        logger.info(
          { sourceGroup, contextTier },
          'Group metadata refresh requested via IPC',
        );
        await syncGroupMetadata(true);
        // Write updated snapshot immediately
        const availableGroups = getAvailableGroups();
        const { writeGroupsSnapshot: writeGroups } =
          await import('./container-runner.js');
        writeGroups(
          sourceGroup,
          isOwner,
          availableGroups,
          new Set(Object.keys(registeredGroups)),
        );
      } else {
        logger.warn(
          { sourceGroup, contextTier },
          'Unauthorized refresh_groups attempt blocked',
        );
      }
      break;

    case 'register_group':
      // Only owner can register new groups
      if (!isOwner) {
        logger.warn(
          { sourceGroup, contextTier },
          'Unauthorized register_group attempt blocked',
        );
        break;
      }
      if (data.jid && data.name && data.folder && data.trigger) {
        registerGroup(data.jid, {
          name: data.name,
          folder: data.folder,
          trigger: data.trigger,
          added_at: new Date().toISOString(),
          containerConfig: data.containerConfig,
        });
      } else {
        logger.warn(
          { data },
          'Invalid register_group request - missing required fields',
        );
      }
      break;

    case 'add_user':
      // Only owner can add users
      if (!isOwner) {
        logger.warn(
          { sourceGroup, contextTier },
          'Unauthorized add_user attempt blocked',
        );
        break;
      }
      if (data.userJid && data.userName && data.tier) {
        const success = addUser(data.userJid, data.userName, data.tier);
        if (success) {
          logger.info(
            { userJid: data.userJid, tier: data.tier, sourceGroup },
            'User added via IPC',
          );
        } else {
          logger.warn(
            { userJid: data.userJid },
            'User already exists or add failed',
          );
        }
      } else {
        logger.warn(
          { data },
          'Invalid add_user request - missing required fields',
        );
      }
      break;

    case 'remove_user':
      // Only owner can remove users
      if (!isOwner) {
        logger.warn(
          { sourceGroup, contextTier },
          'Unauthorized remove_user attempt blocked',
        );
        break;
      }
      if (data.userJid) {
        try {
          const success = removeUser(data.userJid);
          if (success) {
            logger.info(
              { userJid: data.userJid, sourceGroup },
              'User removed via IPC',
            );
          } else {
            logger.warn({ userJid: data.userJid }, 'User not found in registry');
          }
        } catch (error) {
          logger.error(
            { userJid: data.userJid, error },
            'Failed to remove user (may be owner)',
          );
        }
      } else {
        logger.warn({ data }, 'Invalid remove_user request - missing userJid');
      }
      break;

    case 'list_users':
      // Only owner and family can list users
      if (!isOwner && !isFamily) {
        logger.warn(
          { sourceGroup, contextTier },
          'Unauthorized list_users attempt blocked',
        );
        break;
      }
      try {
        const ownerUsers = getUsersByTier('owner');
        const familyUsers = getUsersByTier('family');
        const friendUsers = getUsersByTier('friend');
        logger.info(
          {
            sourceGroup,
            contextTier,
            ownerCount: ownerUsers.length,
            familyCount: familyUsers.length,
            friendCount: friendUsers.length,
          },
          'Users listed via IPC',
        );
        // Note: The actual list would be written to a response file if needed
        // For now, we just log it as the agent would read from data/users.json
      } catch (error) {
        logger.error({ error, sourceGroup }, 'Failed to list users');
      }
      break;

    case 'get_my_tier':
      // All users can check their own tier
      // This would require the userJid to be passed in the data
      if (data.userJid) {
        const tier = getTier(data.userJid);
        logger.info(
          { userJid: data.userJid, tier, sourceGroup },
          'User tier queried via IPC',
        );
      } else {
        logger.warn({ data }, 'Invalid get_my_tier request - missing userJid');
      }
      break;

    default:
      logger.warn({ type: data.type }, 'Unknown IPC task type');
  }
}

async function connectWhatsApp(): Promise<void> {
  const authDir = path.join(STORE_DIR, 'auth');
  fs.mkdirSync(authDir, { recursive: true });

  const { state, saveCreds } = await useMultiFileAuthState(authDir);

  sock = makeWASocket({
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, logger),
    },
    printQRInTerminal: false,
    logger,
    browser: ['NanoClaw', 'Chrome', '1.0.0'],
  });

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      const msg =
        'WhatsApp authentication required. Run /setup in Claude Code.';
      logger.error(msg);
      exec(
        `osascript -e 'display notification "${msg}" with title "NanoClaw" sound name "Basso"'`,
      );
      setTimeout(() => process.exit(1), 1000);
    }

    if (connection === 'close') {
      const reason = (lastDisconnect?.error as any)?.output?.statusCode;
      const shouldReconnect = reason !== DisconnectReason.loggedOut;
      logger.info({ reason, shouldReconnect }, 'Connection closed');

      if (shouldReconnect) {
        logger.info('Reconnecting...');
        connectWhatsApp();
      } else {
        logger.info('Logged out. Run /setup to re-authenticate.');
        process.exit(0);
      }
    } else if (connection === 'open') {
      logger.info('Connected to WhatsApp');
      
      // Load all LID-to-phone mappings from Baileys auth state
      loadLidMappings();
      
      // Sync group metadata on startup (respects 24h cache)
      syncGroupMetadata().catch((err) =>
        logger.error({ err }, 'Initial group sync failed'),
      );
      // Set up daily sync timer (only once)
      if (!groupSyncTimerStarted) {
        groupSyncTimerStarted = true;
        setInterval(() => {
          syncGroupMetadata().catch((err) =>
            logger.error({ err }, 'Periodic group sync failed'),
          );
        }, GROUP_SYNC_INTERVAL_MS);
      }
      startSchedulerLoop({
        sendMessage,
        registeredGroups: () => registeredGroups,
        getSessions: () => sessions,
      });
      startIpcWatcher();
      startMessageLoop();
    }
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('messages.upsert', ({ messages }) => {
    for (const msg of messages) {
      if (!msg.message) continue;
      if (msg.key.fromMe) continue; // Ignore bot's own outgoing messages
      const rawJid = msg.key.remoteJid;
      if (!rawJid || rawJid === 'status@broadcast') continue;

      // Translate LID JID to phone JID if applicable
      const chatJid = translateJid(rawJid);

      const timestamp = new Date(
        Number(msg.messageTimestamp) * 1000,
      ).toISOString();

      // Always store chat metadata for group discovery
      storeChatMetadata(chatJid, timestamp);

      // Only store full message content for registered groups
      if (registeredGroups[chatJid]) {
        storeMessage(
          msg,
          chatJid,
          msg.pushName || undefined,
        );
      }
    }
  });
}

async function startMessageLoop(): Promise<void> {
  if (messageLoopRunning) {
    logger.debug('Message loop already running, skipping duplicate start');
    return;
  }
  messageLoopRunning = true;
  logger.info(`NanoClaw running (trigger: @${ASSISTANT_NAME})`);

  while (true) {
    try {
      const jids = Object.keys(registeredGroups);
      const { messages } = getNewMessages(jids, lastTimestamp);

      if (messages.length > 0)
        logger.info({ count: messages.length }, 'New messages');
      for (const msg of messages) {
        try {
          await processMessage(msg);
          // Only advance timestamp after successful processing for at-least-once delivery
          lastTimestamp = msg.timestamp;
          saveState();
        } catch (err) {
          logger.error(
            { err, msg: msg.id },
            'Error processing message, will retry',
          );
          // Stop processing this batch - failed message will be retried next loop
          break;
        }
      }
    } catch (err) {
      logger.error({ err }, 'Error in message loop');
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL));
  }
}

function ensureContainerSystemRunning(): void {
  try {
    execSync('container system status', { stdio: 'pipe' });
    logger.debug('Apple Container system already running');
  } catch {
    logger.info('Starting Apple Container system...');
    try {
      execSync('container system start', { stdio: 'pipe', timeout: 30000 });
      logger.info('Apple Container system started');
    } catch (err) {
      logger.error({ err }, 'Failed to start Apple Container system');
      console.error(
        '\n╔════════════════════════════════════════════════════════════════╗',
      );
      console.error(
        '║  FATAL: Apple Container system failed to start                 ║',
      );
      console.error(
        '║                                                                ║',
      );
      console.error(
        '║  Agents cannot run without Apple Container. To fix:           ║',
      );
      console.error(
        '║  1. Install from: https://github.com/apple/container/releases ║',
      );
      console.error(
        '║  2. Run: container system start                               ║',
      );
      console.error(
        '║  3. Restart NanoClaw                                          ║',
      );
      console.error(
        '╚════════════════════════════════════════════════════════════════╝\n',
      );
      throw new Error('Apple Container system is required but failed to start');
    }
  }
}

/**
 * Migrate session structure from single main session to tier-based sessions.
 *
 * Old structure: data/sessions/main/.claude/
 * New structure:
 *   - data/sessions/owner/.claude/ (for owner)
 *   - data/sessions/family/.claude/ (for family)
 *   - data/sessions/friends/{group}/.claude/ (per-group for friends)
 *
 * This function is idempotent and safe to run multiple times.
 */
function migrateSessionStructure(): void {
  const sessionsDir = path.join(DATA_DIR, 'sessions');
  const oldMainPath = path.join(sessionsDir, 'main', '.claude');
  const newOwnerPath = path.join(sessionsDir, 'owner', '.claude');
  const familyPath = path.join(sessionsDir, 'family', '.claude');
  const friendsDir = path.join(sessionsDir, 'friends');

  logger.info('Starting session structure migration...');

  // Migrate main → owner only if owner doesn't already exist
  if (fs.existsSync(newOwnerPath)) {
    logger.debug('Owner session already exists; skipping main → owner migration');
  } else {
    // Create backup if old main session exists
    if (fs.existsSync(oldMainPath)) {
      const backupPath = path.join(sessionsDir, `main-backup-${Date.now()}`);
      try {
        fs.cpSync(path.join(sessionsDir, 'main'), backupPath, { recursive: true });
        logger.info({ backupPath }, 'Created backup of old main session');
      } catch (err) {
        logger.error({ err, backupPath }, 'Failed to create backup');
        throw new Error('Migration aborted: could not create backup');
      }

      // Migrate main → owner
      try {
        fs.mkdirSync(path.dirname(newOwnerPath), { recursive: true });
        fs.cpSync(oldMainPath, newOwnerPath, { recursive: true });
        logger.info({ from: oldMainPath, to: newOwnerPath }, 'Migrated main session to owner');
      } catch (err) {
        logger.error({ err }, 'Failed to migrate main session to owner');
        throw new Error('Migration aborted: could not copy session data');
      }
    } else {
      // No old session, just create new owner directory
      fs.mkdirSync(newOwnerPath, { recursive: true });
      logger.info({ path: newOwnerPath }, 'Created new owner session directory');
    }
  }

  // Always ensure family and friends directories exist (even if owner already existed)
  if (!fs.existsSync(familyPath)) {
    fs.mkdirSync(familyPath, { recursive: true });
    logger.info({ path: familyPath }, 'Created family session directory');
  } else {
    logger.debug({ path: familyPath }, 'Family session directory already exists');
  }

  if (!fs.existsSync(friendsDir)) {
    fs.mkdirSync(friendsDir, { recursive: true });
    logger.info({ path: friendsDir }, 'Created friends session directory');
  } else {
    logger.debug({ path: friendsDir }, 'Friends session directory already exists');
  }

  logger.info('Session structure migration completed successfully');
  logger.info('Note: Old main session backed up and can be removed manually once verified');
  logger.info('Note: Existing non-main group sessions remain in data/sessions/{group}/ and are not migrated');
}

async function main(): Promise<void> {
  ensureContainerSystemRunning();
  migrateSessionStructure();
  initDatabase();
  logger.info('Database initialized');
  loadState();
  await connectWhatsApp();
}

main().catch((err) => {
  logger.error({ err }, 'Failed to start NanoClaw');
  process.exit(1);
});
