import path from 'path';
import fs from 'fs';
import { UserRegistry, UserInfo, UserTier } from './types.js';
import { loadJson } from './utils.js';
import { DATA_DIR } from './config.js';
import { logger } from './logger.js';

const USER_REGISTRY_PATH = path.join(DATA_DIR, 'users.json');

/**
 * In-memory cache for user registry with timestamps
 * Reduces disk I/O for frequent tier lookups
 */
let registryCache: { registry: UserRegistry; loadedAt: number } | null = null;
const CACHE_TTL_MS = 5000; // 5 second cache

/**
 * Normalize JID by removing LID-style suffix (e.g. ":1") from the local part,
 * while preserving the domain (if any).
 */
function normalizeJid(jid: string): string {
  // Split into local part and domain (if present)
  const [localPart, domain] = jid.split('@', 2);

  // Remove any suffix after the first ":" only from the local part
  const normalizedLocal = localPart.split(':')[0];

  // Reattach domain if it exists
  return domain ? `${normalizedLocal}@${domain}` : normalizedLocal;
}

/**
 * Load user registry from disk with caching
 */
export function loadUserRegistry(): UserRegistry {
  const now = Date.now();

  // Return cached registry if still valid
  if (registryCache && now - registryCache.loadedAt < CACHE_TTL_MS) {
    return registryCache.registry;
  }

  const defaultRegistry: UserRegistry = {
    owner: {
      jid: '',
      name: '',
      addedAt: '',
    },
    family: [],
    friend: [],
  };

  const registry = loadJson<UserRegistry>(USER_REGISTRY_PATH, defaultRegistry);

  // Update cache
  registryCache = {
    registry,
    loadedAt: now,
  };

  return registry;
}

/**
 * Invalidate the registry cache
 * Call this after modifying the registry to force a reload
 */
export function invalidateRegistryCache(): void {
  registryCache = null;
}

/**
 * Save user registry to disk atomically (using temp file + rename)
 */
export function saveUserRegistry(registry: UserRegistry): void {
  try {
    const tmpPath = `${USER_REGISTRY_PATH}.tmp`;
    const content = JSON.stringify(registry, null, 2);

    // Ensure directory exists
    fs.mkdirSync(path.dirname(USER_REGISTRY_PATH), { recursive: true });

    // Write to temp file first
    fs.writeFileSync(tmpPath, content, 'utf-8');

    // Atomic rename
    fs.renameSync(tmpPath, USER_REGISTRY_PATH);

    // Invalidate cache after write
    invalidateRegistryCache();

    logger.info('[user-registry] Registry saved successfully');
  } catch (error) {
    logger.error({ error }, '[user-registry] Failed to save registry');
    throw error;
  }
}

/**
 * Get tier for a user from a given registry. Returns 'stranger' if not found.
 */
function getUserTierFromRegistry(
  normalizedJid: string,
  registry: UserRegistry,
): UserTier {
  // Check if owner
  if (
    registry.owner.jid &&
    normalizeJid(registry.owner.jid) === normalizedJid
  ) {
    return 'owner';
  }

  // Check if family
  if (registry.family.some((user) => normalizeJid(user.jid) === normalizedJid)) {
    return 'family';
  }

  // Check if friend
  if (
    registry.friend.some((user) => normalizeJid(user.jid) === normalizedJid)
  ) {
    return 'friend';
  }

  // Default to stranger
  return 'stranger';
}

/**
 * Get tier for a user. Returns 'stranger' if not found.
 */
export function getUserTier(jid: string): UserTier {
  const normalizedJid = normalizeJid(jid);
  const registry = loadUserRegistry();
  return getUserTierFromRegistry(normalizedJid, registry);
}

/**
 * Initialize owner during first setup
 * Throws error if owner is already set
 */
export function initializeOwner(jid: string, name: string): void {
  const registry = loadUserRegistry();

  if (registry.owner.jid) {
    throw new Error('Owner already initialized');
  }

  const normalizedJid = normalizeJid(jid);
  registry.owner = {
    jid: normalizedJid,
    name,
    addedAt: new Date().toISOString(),
  };

  saveUserRegistry(registry);
  logger.info(`[user-registry] Owner initialized: ${name} (${normalizedJid})`);
}

/**
 * Add a user to family or friends tier
 * Returns false if user already exists, true if added
 */
export function addUser(
  jid: string,
  name: string,
  tier: 'family' | 'friend',
  addedBy?: string,
): boolean {
  const normalizedJid = normalizeJid(jid);
  const registry = loadUserRegistry();

  // Check if user already exists in any tier (using the already-loaded registry)
  const currentTier = getUserTierFromRegistry(normalizedJid, registry);
  if (currentTier !== 'stranger') {
    logger.info(
      `[user-registry] User ${normalizedJid} already exists as ${currentTier}`,
    );
    return false;
  }

  const userInfo: UserInfo = {
    jid: normalizedJid,
    name,
    addedAt: new Date().toISOString(),
    addedBy: addedBy ? normalizeJid(addedBy) : undefined,
  };

  if (tier === 'family') {
    registry.family.push(userInfo);
  } else {
    registry.friend.push(userInfo);
  }

  saveUserRegistry(registry);
  logger.info(`[user-registry] Added ${name} (${normalizedJid}) as ${tier}`);
  return true;
}

/**
 * Remove a user from the registry
 * Cannot remove owner
 * Returns true if removed, false if not found
 */
export function removeUser(jid: string): boolean {
  const normalizedJid = normalizeJid(jid);
  const registry = loadUserRegistry();

  // Protect owner
  if (registry.owner.jid && normalizeJid(registry.owner.jid) === normalizedJid) {
    throw new Error('Cannot remove owner from registry');
  }

  // Try to remove from family
  const familyIndex = registry.family.findIndex(
    user => normalizeJid(user.jid) === normalizedJid
  );
  if (familyIndex !== -1) {
    registry.family.splice(familyIndex, 1);
    saveUserRegistry(registry);
    logger.info(`[user-registry] Removed user ${normalizedJid} from family`);
    return true;
  }

  // Try to remove from friend
  const friendIndex = registry.friend.findIndex(
    user => normalizeJid(user.jid) === normalizedJid
  );
  if (friendIndex !== -1) {
    registry.friend.splice(friendIndex, 1);
    saveUserRegistry(registry);
    logger.info(`[user-registry] Removed user ${normalizedJid} from friend`);
    return true;
  }

  logger.info(`[user-registry] User ${normalizedJid} not found in registry`);
  return false;
}

/**
 * Get all users in a specific tier
 */
export function getUsersByTier(tier: 'owner' | 'family' | 'friend'): UserInfo[] {
  const registry = loadUserRegistry();

  if (tier === 'owner') {
    return registry.owner.jid ? [registry.owner] : [];
  } else if (tier === 'family') {
    return registry.family;
  } else {
    return registry.friend;
  }
}

/**
 * Get user information by JID
 * Returns null if not found
 */
export function getUserInfo(jid: string): UserInfo | null {
  const normalizedJid = normalizeJid(jid);
  const registry = loadUserRegistry();

  // Check owner
  if (registry.owner.jid && normalizeJid(registry.owner.jid) === normalizedJid) {
    return registry.owner;
  }

  // Check family
  const familyUser = registry.family.find(
    user => normalizeJid(user.jid) === normalizedJid
  );
  if (familyUser) {
    return familyUser;
  }

  // Check friend
  const friendUser = registry.friend.find(
    user => normalizeJid(user.jid) === normalizedJid
  );
  if (friendUser) {
    return friendUser;
  }

  return null;
}
