import path from 'path';
import { UserRegistry, UserInfo, UserTier } from './types.js';
import { loadJson, saveJson } from './utils.js';
import { DATA_DIR } from './config.js';

const USER_REGISTRY_PATH = path.join(DATA_DIR, 'users.json');

/**
 * Normalize JID by removing :lid suffix if present
 */
function normalizeJid(jid: string): string {
  return jid.split(':')[0];
}

/**
 * Load user registry from disk
 */
export function loadUserRegistry(): UserRegistry {
  const defaultRegistry: UserRegistry = {
    owner: {
      jid: '',
      name: '',
      addedAt: '',
    },
    family: [],
    friends: [],
  };

  return loadJson<UserRegistry>(USER_REGISTRY_PATH, defaultRegistry);
}

/**
 * Save user registry to disk
 */
export function saveUserRegistry(registry: UserRegistry): void {
  try {
    saveJson(USER_REGISTRY_PATH, registry);
    console.log('[user-registry] Registry saved successfully');
  } catch (error) {
    console.error('[user-registry] Failed to save registry:', error);
    throw error;
  }
}

/**
 * Get tier for a user. Returns 'stranger' if not found.
 */
export function getUserTier(jid: string): UserTier {
  const normalizedJid = normalizeJid(jid);
  const registry = loadUserRegistry();

  // Check if owner
  if (registry.owner.jid && normalizeJid(registry.owner.jid) === normalizedJid) {
    return 'owner';
  }

  // Check if family
  if (registry.family.some(user => normalizeJid(user.jid) === normalizedJid)) {
    return 'family';
  }

  // Check if friend
  if (registry.friends.some(user => normalizeJid(user.jid) === normalizedJid)) {
    return 'friend';
  }

  // Default to stranger
  return 'stranger';
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
  console.log(`[user-registry] Owner initialized: ${name} (${normalizedJid})`);
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

  // Check if user already exists in any tier
  const currentTier = getUserTier(normalizedJid);
  if (currentTier !== 'stranger') {
    console.log(`[user-registry] User ${normalizedJid} already exists as ${currentTier}`);
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
    registry.friends.push(userInfo);
  }

  saveUserRegistry(registry);
  console.log(`[user-registry] Added ${name} (${normalizedJid}) as ${tier}`);
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
    console.log(`[user-registry] Removed user ${normalizedJid} from family`);
    return true;
  }

  // Try to remove from friends
  const friendIndex = registry.friends.findIndex(
    user => normalizeJid(user.jid) === normalizedJid
  );
  if (friendIndex !== -1) {
    registry.friends.splice(friendIndex, 1);
    saveUserRegistry(registry);
    console.log(`[user-registry] Removed user ${normalizedJid} from friends`);
    return true;
  }

  console.log(`[user-registry] User ${normalizedJid} not found in registry`);
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
    return registry.friends;
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

  // Check friends
  const friendUser = registry.friends.find(
    user => normalizeJid(user.jid) === normalizedJid
  );
  if (friendUser) {
    return friendUser;
  }

  return null;
}
