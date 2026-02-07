import { logger } from './logger.js';
import { getUserTier } from './user-registry.js';
import {
  UserTier,
  ContextTier,
  AuthorizationResult,
  GroupParticipant,
} from './types.js';

/**
 * Cache entry for stranger detection
 */
interface StrangerCacheEntry {
  hasStrangers: boolean;
  lastChecked: number;
  participants: string[];
}

/**
 * In-memory cache for stranger detection with 5-minute TTL
 * Key: group JID
 * Value: cache entry with timestamp
 */
const strangerCache = new Map<string, StrangerCacheEntry>();

/**
 * Cache TTL: 5 minutes (300000ms)
 */
const CACHE_TTL = 300000;

/**
 * Normalize JID by removing :lid suffix if present
 */
function normalizeJid(jid: string): string {
  return jid.split(':')[0];
}

/**
 * Check if a user can invoke Jarvis
 * Owner and Family can invoke, Friend and Stranger cannot
 *
 * @param senderJid - JID of the message sender
 * @param isGroupChat - Whether this is a group chat
 * @returns Authorization result with tier and invoke permission
 */
export function canInvoke(
  senderJid: string,
  isGroupChat: boolean,
): AuthorizationResult {
  const normalizedJid = normalizeJid(senderJid);
  const tier = getUserTier(normalizedJid);

  // Owner and Family can invoke
  const canInvoke = tier === 'owner' || tier === 'family';

  const result: AuthorizationResult = {
    tier,
    canInvoke,
    reason: canInvoke
      ? `${tier} tier user can invoke Jarvis`
      : `${tier} tier users cannot invoke Jarvis`,
  };

  logger.info(
    {
      senderJid: normalizedJid,
      tier,
      canInvoke,
      isGroupChat,
    },
    '[authorization] Invoke check',
  );

  return result;
}

/**
 * Check if a group has any strangers (users not in registry)
 * Uses in-memory cache with 5-minute TTL for performance
 *
 * @param groupJid - JID of the group
 * @param participants - Array of participant JIDs
 * @param forceRefresh - Force cache refresh
 * @returns True if group has strangers
 */
export function hasStrangers(
  groupJid: string,
  participants: string[],
  forceRefresh = false,
): boolean {
  const normalizedGroupJid = normalizeJid(groupJid);
  const now = Date.now();

  // Check cache if not forcing refresh
  if (!forceRefresh) {
    const cached = strangerCache.get(normalizedGroupJid);
    if (cached) {
      const age = now - cached.lastChecked;
      if (age < CACHE_TTL) {
        // Check if participants list has changed
        const participantsChanged =
          participants.length !== cached.participants.length ||
          participants.some(p => !cached.participants.includes(normalizeJid(p)));

        if (!participantsChanged) {
          logger.debug(
            {
              groupJid: normalizedGroupJid,
              hasStrangers: cached.hasStrangers,
              cacheAge: age,
            },
            '[authorization] Stranger check (cached)',
          );
          return cached.hasStrangers;
        }
      }
    }
  }

  // Check each participant
  const normalizedParticipants = participants.map(normalizeJid);
  let foundStranger = false;

  for (const participantJid of normalizedParticipants) {
    const tier = getUserTier(participantJid);
    if (tier === 'stranger') {
      foundStranger = true;
      break;
    }
  }

  // Update cache
  strangerCache.set(normalizedGroupJid, {
    hasStrangers: foundStranger,
    lastChecked: now,
    participants: normalizedParticipants,
  });

  logger.info(
    {
      groupJid: normalizedGroupJid,
      participantCount: participants.length,
      hasStrangers: foundStranger,
    },
    '[authorization] Stranger check (fresh)',
  );

  return foundStranger;
}

/**
 * Determine which agent context tier to use
 * Considers both sender tier and group's explicit context tier
 *
 * @param senderTier - Tier of the message sender
 * @param groupContextTier - Explicit context tier configured for group (optional)
 * @returns Context tier to use (owner, family, or friend)
 */
export function determineAgentContext(
  senderTier: UserTier,
  groupContextTier?: ContextTier,
): ContextTier {
  // If group has explicit context tier configured, use it
  if (groupContextTier) {
    logger.info(
      {
        senderTier,
        groupContextTier,
        result: groupContextTier,
      },
      '[authorization] Using explicit group context tier',
    );
    return groupContextTier;
  }

  // Otherwise infer from sender tier
  // Strangers default to friend context (most restrictive)
  let contextTier: ContextTier;
  if (senderTier === 'owner') {
    contextTier = 'owner';
  } else if (senderTier === 'family') {
    contextTier = 'family';
  } else {
    // friend or stranger -> friend context
    contextTier = 'friend';
  }

  logger.info(
    {
      senderTier,
      contextTier,
    },
    '[authorization] Context tier inferred from sender',
  );

  return contextTier;
}

/**
 * Get tier information for all participants in a group
 *
 * @param participants - Array of participant JIDs
 * @returns Array of participants with their tiers
 */
export function getParticipantTiers(
  participants: string[],
): GroupParticipant[] {
  return participants.map(jid => {
    const normalizedJid = normalizeJid(jid);
    const tier = getUserTier(normalizedJid);

    return {
      jid: normalizedJid,
      tier,
    } as GroupParticipant;
  });
}

/**
 * Clear stranger detection cache
 * Can clear for specific group or all groups
 *
 * @param groupJid - Optional group JID to clear (clears all if not provided)
 */
export function clearStrangerCache(groupJid?: string): void {
  if (groupJid) {
    const normalizedGroupJid = normalizeJid(groupJid);
    strangerCache.delete(normalizedGroupJid);
    logger.info(
      { groupJid: normalizedGroupJid },
      '[authorization] Cleared stranger cache for group',
    );
  } else {
    const count = strangerCache.size;
    strangerCache.clear();
    logger.info(
      { clearedCount: count },
      '[authorization] Cleared all stranger caches',
    );
  }
}
