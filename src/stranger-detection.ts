import type { WASocket } from '@whiskeysockets/baileys';
import { logger } from './logger.js';
import { hasStrangers } from './authorization.js';
import { updateGroupParticipants } from './db.js';
import { loadUserRegistry, getUserTier } from './user-registry.js';
import { normalizeJid } from './utils.js';

/**
 * Detect strangers in a group by fetching WhatsApp metadata
 * Returns the list of stranger JIDs found
 *
 * @param sock - WhatsApp socket connection
 * @param groupJid - JID of the group to check
 * @returns Array of stranger JIDs (empty if no strangers)
 */
export async function detectStrangersInGroup(
  sock: WASocket,
  groupJid: string,
): Promise<string[]> {
  try {
    // Fetch group metadata from WhatsApp
    const metadata = await sock.groupMetadata(groupJid);

    // Extract participant JIDs
    const participantJids = metadata.participants.map((p) => p.id);

    logger.info(
      {
        groupJid,
        participantCount: participantJids.length,
      },
      '[stranger-detection] Fetched group metadata',
    );

    // Check for strangers using authorization module
    const hasStrangersInGroup = hasStrangers(groupJid, participantJids, true);

    if (!hasStrangersInGroup) {
      return [];
    }

    // Find which specific participants are strangers
    const strangers = participantJids.filter((jid) => {
      const tier = getUserTier(jid);
      return tier === 'stranger';
    });

    logger.info(
      {
        groupJid,
        strangerCount: strangers.length,
        strangers: strangers.map(normalizeJid),
      },
      '[stranger-detection] Strangers detected in group',
    );

    return strangers;
  } catch (error) {
    logger.error(
      {
        groupJid,
        err: error,
      },
      '[stranger-detection] Failed to fetch group metadata',
    );
    // Re-throw to let caller handle the error
    throw new Error(
      `Failed to fetch group metadata: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/**
 * Sync group participants to database
 * Fetches current participants from WhatsApp and updates the database
 *
 * @param sock - WhatsApp socket connection
 * @param groupJid - JID of the group to sync
 */
export async function syncGroupParticipants(
  sock: WASocket,
  groupJid: string,
): Promise<void> {
  try {
    // Fetch group metadata from WhatsApp using the raw group JID
    const metadata = await sock.groupMetadata(groupJid);

    // Extract raw participant JIDs from metadata
    const participantJids = metadata.participants.map((p) => p.id);

    // Normalize group JID and participant JIDs before updating the database
    const normalizedGroupJid = normalizeJid(groupJid);
    const normalizedParticipantJids = Array.from(
      new Set(participantJids.map((jid) => normalizeJid(jid))),
    );

    // Update database with current (normalized) participants
    updateGroupParticipants(normalizedGroupJid, normalizedParticipantJids);

    logger.info(
      {
        groupJid: normalizedGroupJid,
        participantCount: normalizedParticipantJids.length,
      },
      '[stranger-detection] Synced group participants to database',
    );
  } catch (error) {
    logger.error(
      {
        groupJid,
        err: error,
      },
      '[stranger-detection] Failed to sync group participants',
    );
    // Re-throw to let caller handle the error
    throw new Error(
      `Failed to sync group participants: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/**
 * Combined check: Should we ignore this thread?
 * Checks if group has strangers and returns result with participants list
 *
 * @param groupJid - JID of the group
 * @param participants - Array of participant JIDs
 * @returns Object with shouldIgnore flag and participant details
 */
export function shouldIgnoreThread(
  groupJid: string,
  participants: string[],
): {
  shouldIgnore: boolean;
  hasStrangers: boolean;
  strangers: string[];
} {
  // Check for strangers
  const hasStrangersInGroup = hasStrangers(groupJid, participants);

  if (!hasStrangersInGroup) {
    return {
      shouldIgnore: false,
      hasStrangers: false,
      strangers: [],
    };
  }

  // Find which specific participants are strangers
  const strangerList = participants.filter((jid) => {
    const tier = getUserTier(jid);
    return tier === 'stranger';
  });

  logger.info(
    {
      groupJid,
      hasStrangers: true,
      strangerCount: strangerList.length,
    },
    '[stranger-detection] Thread should be ignored (strangers present)',
  );

  return {
    shouldIgnore: true,
    hasStrangers: true,
    strangers: strangerList,
  };
}

/**
 * Notify owner of strangers in a group via DM
 * Sends a secure notification to the owner about strangers blocking a thread
 *
 * @param sock - WhatsApp socket connection
 * @param groupJid - JID of the group with strangers
 * @param strangers - Array of stranger JIDs
 */
export async function notifyOwnerOfStrangers(
  sock: WASocket,
  groupJid: string,
  strangers: string[],
): Promise<void> {
  try {
    const registry = loadUserRegistry();

    if (!registry.owner.jid) {
      logger.warn(
        '[stranger-detection] Cannot notify owner - owner not initialized',
      );
      return;
    }

    const ownerJid = registry.owner.jid;

    // Get group name (try to fetch metadata, fallback to JID)
    let groupName = groupJid;
    try {
      const metadata = await sock.groupMetadata(groupJid);
      groupName = metadata.subject || groupJid;
    } catch {
      // Fallback to JID if metadata fetch fails
    }

    // Format stranger list (show phone numbers without domain)
    const strangerList = strangers
      .map((jid) => {
        const normalized = normalizeJid(jid);
        // Extract phone number part
        const phone = normalized.split('@')[0];
        return `  • +${phone}`;
      })
      .join('\n');

    const message = `🚨 *Stranger Alert*

A group with strangers has been detected and ignored:

*Group:* ${groupName}

*Strangers detected (${strangers.length}):*
${strangerList}

All messages in this group will be ignored until strangers are removed or added to your user registry.`;

    // Send DM to owner
    await sock.sendMessage(ownerJid, { text: message });

    logger.info(
      {
        groupJid,
        groupName,
        strangerCount: strangers.length,
        ownerJid: normalizeJid(ownerJid),
      },
      '[stranger-detection] Notified owner of strangers in group',
    );
  } catch (error) {
    logger.error(
      {
        groupJid,
        err: error,
      },
      '[stranger-detection] Failed to notify owner',
    );
    // Don't re-throw - notification failure shouldn't block processing
  }
}
