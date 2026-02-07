export interface AdditionalMount {
  hostPath: string; // Absolute path on host (supports ~ for home)
  containerPath: string; // Path inside container (under /workspace/extra/)
  readonly?: boolean; // Default: true for safety
}

/**
 * Mount Allowlist - Security configuration for additional mounts
 * This file should be stored at ~/.config/nanoclaw/mount-allowlist.json
 * and is NOT mounted into any container, making it tamper-proof from agents.
 */
export interface MountAllowlist {
  // Directories that can be mounted into containers
  allowedRoots: AllowedRoot[];
  // Glob patterns for paths that should never be mounted (e.g., ".ssh", ".gnupg")
  blockedPatterns: string[];
}

export type MountAccess = 'rw' | 'ro';

export interface AllowedRoot {
  // Absolute path or ~ for home (e.g., "~/projects", "/var/repos")
  path: string;
  // Per-tier access: "rw" = read-write, "ro" = read-only, absent = no access
  // Strangers never get access regardless of config
  // Friends can only have "ro" (enforced in validation)
  access: {
    owner?: MountAccess;
    family?: MountAccess;
    friend?: 'ro';
  };
  // Optional description for documentation
  description?: string;
}

export interface ContainerConfig {
  additionalMounts?: AdditionalMount[];
  timeout?: number; // Default: 300000 (5 minutes)
  env?: Record<string, string>;
}

export interface RegisteredGroup {
  name: string;
  folder: string;
  trigger: string;
  added_at: string;
  contextTier?: ContextTier; // NEW: Context tier for this group
  containerConfig?: ContainerConfig;
}

export interface Session {
  [folder: string]: string;
}

export interface NewMessage {
  id: string;
  chat_jid: string;
  sender: string;
  sender_name: string;
  content: string;
  timestamp: string;
}

export interface ScheduledTask {
  id: string;
  group_folder: string;
  chat_jid: string;
  prompt: string;
  schedule_type: 'cron' | 'interval' | 'once';
  schedule_value: string;
  context_mode: 'group' | 'isolated';
  next_run: string | null;
  last_run: string | null;
  last_result: string | null;
  status: 'active' | 'paused' | 'completed';
  created_at: string;
}

export interface TaskRunLog {
  task_id: string;
  run_at: string;
  duration_ms: number;
  status: 'success' | 'error';
  result: string | null;
  error: string | null;
}

// User Authorization Types
export type UserTier = 'owner' | 'family' | 'friend' | 'stranger';
export type ContextTier = 'owner' | 'family' | 'friend';

export interface UserInfo {
  jid: string;
  name: string;
  addedAt: string;
  addedBy?: string;
}

export interface UserRegistry {
  owner: UserInfo;
  family: UserInfo[];
  friend: UserInfo[];
}

// Vault Configuration Types
export interface VaultSettings {
  path: string;
  enabled: boolean;
}

export interface VaultConfig {
  mainVault?: VaultSettings;
  privateVault?: VaultSettings;
}

// Email Types
export interface EmailUser {
  tier: UserTier;
  name: string;
}

export interface EmailRegistry {
  users: Record<string, EmailUser>;
  settings: {
    allowUnknownSenders: boolean;
  };
}

export interface EmailConfig {
  provider: string;
  email: string;
  imap: {
    host: string;
    port: number;
    tls: boolean;
  };
  smtp: {
    host: string;
    port: number;
    secure: boolean;
  };
}

// Authorization Types
export interface AuthorizationResult {
  canInvoke: boolean;
  tier: UserTier;
  reason?: string;
}

export interface GroupParticipant {
  jid: string;
  tier: UserTier;
}
