/**
 * Container Runner for NanoClaw
 * Spawns agent execution in Apple Container and handles IPC
 */
import { spawn } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

import {
  CONTAINER_IMAGE,
  CONTAINER_MAX_OUTPUT_SIZE,
  CONTAINER_TIMEOUT,
  DATA_DIR,
  GROUPS_DIR,
  loadVaultConfig,
  expandPath,
} from './config.js';
import { logger } from './logger.js';
import { validateAdditionalMounts } from './mount-security.js';
import { ContextTier, RegisteredGroup } from './types.js';

// Sentinel markers for robust output parsing (must match agent-runner)
const OUTPUT_START_MARKER = '---NANOCLAW_OUTPUT_START---';
const OUTPUT_END_MARKER = '---NANOCLAW_OUTPUT_END---';

function getHomeDir(): string {
  const home = process.env.HOME || os.homedir();
  if (!home) {
    throw new Error(
      'Unable to determine home directory: HOME environment variable is not set and os.homedir() returned empty',
    );
  }
  return home;
}

export interface ContainerInput {
  prompt: string;
  sessionId?: string;
  groupFolder: string;
  chatJid: string;
  isMain: boolean;
  isScheduledTask?: boolean;
  effectiveTier?: ContextTier; // Effective tier from authorization logic (overrides group.contextTier)
}

export interface ContainerOutput {
  status: 'success' | 'error';
  result: string | null;
  newSessionId?: string;
  error?: string;
}

interface VolumeMount {
  hostPath: string;
  containerPath: string;
  readonly?: boolean;
}

/**
 * Get the session directory path based on context tier
 * Owner: data/sessions/owner/.claude/
 * Family: data/sessions/family/.claude/
 * Friend: data/sessions/friends/{group}/.claude/
 */
function getSessionDirPath(groupFolder: string, tier: ContextTier): string {
  switch (tier) {
    case 'owner':
      return path.join(DATA_DIR, 'sessions', 'owner', '.claude');
    case 'family':
      return path.join(DATA_DIR, 'sessions', 'family', '.claude');
    case 'friend':
      return path.join(DATA_DIR, 'sessions', 'friends', groupFolder, '.claude');
    default: {
      // Exhaustiveness check: if ContextTier enum is expanded, this will catch it at compile time
      const _exhaustive: never = tier;
      throw new Error(`Unknown context tier: ${String(_exhaustive)}`);
    }
  }
}

/**
 * Validate that a vault path exists and is not blocked
 * Throws error if invalid
 */
function validateVaultMount(vaultPath: string, vaultName: string): void {
  // Resolve to real path to avoid symlink-based bypasses of blocked patterns
  let resolvedPath: string;
  try {
    resolvedPath = fs.realpathSync(vaultPath);
  } catch (err: any) {
    const code = (err && typeof err === 'object' && 'code' in err)
      ? (err as NodeJS.ErrnoException).code
      : undefined;
    if (code === 'ENOENT') {
      throw new Error(
        `${vaultName} vault path does not exist: ${vaultPath}. ` +
          `Please verify the path in data/vault-config.json or disable the vault.`,
      );
    }
    throw new Error(
      `Failed to resolve real path for ${vaultName} vault path "${vaultPath}": ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }

  // Check against blocked patterns to prevent mounting sensitive directories
  const blockedPatterns = ['.ssh', '.gnupg', '.gpg', '.aws', 'credentials'];
  const lowerPath = resolvedPath.toLowerCase();
  for (const pattern of blockedPatterns) {
    if (lowerPath.includes(pattern)) {
      throw new Error(
        `${vaultName} vault path contains blocked pattern "${pattern}": ${vaultPath} (resolved to ${resolvedPath}). ` +
          `Vaults cannot be mounted from sensitive directories.`,
      );
    }
  }

  // Ensure the resolved path is a directory
  const stat = fs.statSync(resolvedPath);
  if (!stat.isDirectory()) {
    throw new Error(
      `${vaultName} vault path is not a directory: ${vaultPath} (resolved to ${resolvedPath})`,
    );
  }
}

function buildVolumeMounts(
  group: RegisteredGroup,
  isMain: boolean,
  effectiveTier?: ContextTier,
): VolumeMount[] {
  const mounts: VolumeMount[] = [];
  const projectRoot = process.cwd();

  // Determine context tier: use effectiveTier if provided (from authorization),
  // otherwise fall back to group's contextTier, or isMain logic for legacy behavior
  const contextTier: ContextTier = effectiveTier || group.contextTier || (isMain ? 'owner' : 'friend');

  logger.debug(
    {
      group: group.name,
      contextTier,
      isMain,
      hasExplicitTier: !!group.contextTier,
    },
    'Building volume mounts for tier-based access',
  );

  // Load vault configuration
  const vaultConfig = loadVaultConfig();

  // Mount vaults and project root based on tier
  switch (contextTier) {
    case 'owner':
      // Owner: Project root + private vault + main vault + group folder + session
      logger.info({ group: group.name }, 'Owner tier: mounting project root + both vaults');

      // Project root (read-write)
      mounts.push({
        hostPath: projectRoot,
        containerPath: '/workspace/project',
        readonly: false,
      });

      // Private vault (owner-only, read-write)
      if (vaultConfig.privateVault?.enabled && vaultConfig.privateVault.path) {
        const privateVaultPath = expandPath(vaultConfig.privateVault.path);
        try {
          validateVaultMount(privateVaultPath, 'Private');
          mounts.push({
            hostPath: privateVaultPath,
            containerPath: '/workspace/vaults/private',
            readonly: false,
          });
          logger.info(
            { path: privateVaultPath },
            'Private vault mounted for owner',
          );
        } catch (err) {
          logger.error(
            {
              group: group.name,
              path: privateVaultPath,
              error: err instanceof Error ? err.message : String(err),
            },
            'Failed to mount private vault - skipping',
          );
        }
      }

      // Main vault (read-write for owner)
      if (vaultConfig.mainVault?.enabled && vaultConfig.mainVault.path) {
        const mainVaultPath = expandPath(vaultConfig.mainVault.path);
        try {
          validateVaultMount(mainVaultPath, 'Main');
          mounts.push({
            hostPath: mainVaultPath,
            containerPath: '/workspace/vaults/main',
            readonly: false,
          });
          logger.info({ path: mainVaultPath }, 'Main vault mounted for owner');
        } catch (err) {
          logger.error(
            {
              group: group.name,
              path: mainVaultPath,
              error: err instanceof Error ? err.message : String(err),
            },
            'Failed to mount main vault - skipping',
          );
        }
      }

      // Group folder
      mounts.push({
        hostPath: path.join(GROUPS_DIR, group.folder),
        containerPath: '/workspace/group',
        readonly: false,
      });
      break;

    case 'family':
      // Family: Main vault + group folder + session (NO private vault, NO project root)
      logger.info({ group: group.name }, 'Family tier: mounting main vault only');

      // Main vault (read-write for family)
      if (vaultConfig.mainVault?.enabled && vaultConfig.mainVault.path) {
        const mainVaultPath = expandPath(vaultConfig.mainVault.path);
        try {
          validateVaultMount(mainVaultPath, 'Main');
          mounts.push({
            hostPath: mainVaultPath,
            containerPath: '/workspace/vaults/main',
            readonly: false,
          });
          logger.info({ path: mainVaultPath }, 'Main vault mounted for family');
        } catch (err) {
          logger.error(
            {
              group: group.name,
              path: mainVaultPath,
              error: err instanceof Error ? err.message : String(err),
            },
            'Failed to mount main vault - skipping',
          );
        }
      }

      // Group folder
      mounts.push({
        hostPath: path.join(GROUPS_DIR, group.folder),
        containerPath: '/workspace/group',
        readonly: false,
      });

      // Global memory directory (read-only for family)
      const globalDirFamily = path.join(GROUPS_DIR, 'global');
      if (fs.existsSync(globalDirFamily)) {
        mounts.push({
          hostPath: globalDirFamily,
          containerPath: '/workspace/global',
          readonly: true,
        });
      }
      break;

    case 'friend':
      // Friend: Group folder + session only (NO vaults, NO project root)
      logger.info({ group: group.name }, 'Friend tier: group folder only, no vault access');

      // Group folder only
      mounts.push({
        hostPath: path.join(GROUPS_DIR, group.folder),
        containerPath: '/workspace/group',
        readonly: false,
      });

      // Global memory directory (read-only for friends)
      const globalDirFriend = path.join(GROUPS_DIR, 'global');
      if (fs.existsSync(globalDirFriend)) {
        mounts.push({
          hostPath: globalDirFriend,
          containerPath: '/workspace/global',
          readonly: true,
        });
      }
      break;
  }

  // Tier-aware session directory
  // Owner: data/sessions/owner/.claude/
  // Family: data/sessions/family/.claude/
  // Friend: data/sessions/friends/{group}/.claude/
  const sessionDir = getSessionDirPath(group.folder, contextTier);
  fs.mkdirSync(sessionDir, { recursive: true });
  mounts.push({
    hostPath: sessionDir,
    containerPath: '/home/node/.claude',
    readonly: false,
  });
  logger.debug(
    { tier: contextTier, path: sessionDir },
    'Session directory mounted',
  );

  // Per-group IPC namespace: each group gets its own IPC directory
  // This prevents cross-group privilege escalation via IPC
  const groupIpcDir = path.join(DATA_DIR, 'ipc', group.folder);
  fs.mkdirSync(path.join(groupIpcDir, 'messages'), { recursive: true });
  fs.mkdirSync(path.join(groupIpcDir, 'tasks'), { recursive: true });
  mounts.push({
    hostPath: groupIpcDir,
    containerPath: '/workspace/ipc',
    readonly: false,
  });

  // Environment file directory (workaround for Apple Container -i env var bug)
  // Only expose specific auth variables needed by Claude Code, not the entire .env
  const envDir = path.join(DATA_DIR, 'env');
  fs.mkdirSync(envDir, { recursive: true });
  const envFile = path.join(projectRoot, '.env');
  if (fs.existsSync(envFile)) {
    const envContent = fs.readFileSync(envFile, 'utf-8');
    const allowedVars = ['CLAUDE_CODE_OAUTH_TOKEN', 'ANTHROPIC_API_KEY'];
    const filteredLines = envContent.split('\n').filter((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) return false;
      return allowedVars.some((v) => trimmed.startsWith(`${v}=`));
    });

    if (filteredLines.length > 0) {
      fs.writeFileSync(
        path.join(envDir, 'env'),
        filteredLines.join('\n') + '\n',
      );
      mounts.push({
        hostPath: envDir,
        containerPath: '/workspace/env-dir',
        readonly: true,
      });
    }
  }

  // Additional mounts validated against external allowlist (tamper-proof from containers)
  if (group.containerConfig?.additionalMounts) {
    const validatedMounts = validateAdditionalMounts(
      group.containerConfig.additionalMounts,
      group.name,
      isMain,
    );
    mounts.push(...validatedMounts);
  }

  return mounts;
}

function buildContainerArgs(mounts: VolumeMount[]): string[] {
  const args: string[] = ['run', '-i', '--rm'];

  // Apple Container: --mount for readonly, -v for read-write
  for (const mount of mounts) {
    if (mount.readonly) {
      args.push(
        '--mount',
        `type=bind,source=${mount.hostPath},target=${mount.containerPath},readonly`,
      );
    } else {
      args.push('-v', `${mount.hostPath}:${mount.containerPath}`);
    }
  }

  args.push(CONTAINER_IMAGE);

  return args;
}

export async function runContainerAgent(
  group: RegisteredGroup,
  input: ContainerInput,
): Promise<ContainerOutput> {
  const startTime = Date.now();

  const groupDir = path.join(GROUPS_DIR, group.folder);
  fs.mkdirSync(groupDir, { recursive: true });

  const mounts = buildVolumeMounts(group, input.isMain, input.effectiveTier);
  const containerArgs = buildContainerArgs(mounts);

  logger.debug(
    {
      group: group.name,
      mounts: mounts.map(
        (m) =>
          `${m.hostPath} -> ${m.containerPath}${m.readonly ? ' (ro)' : ''}`,
      ),
      containerArgs: containerArgs.join(' '),
    },
    'Container mount configuration',
  );

  logger.info(
    {
      group: group.name,
      mountCount: mounts.length,
      isMain: input.isMain,
    },
    'Spawning container agent',
  );

  const logsDir = path.join(GROUPS_DIR, group.folder, 'logs');
  fs.mkdirSync(logsDir, { recursive: true });

  return new Promise((resolve) => {
    const container = spawn('container', containerArgs, {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    let stdoutTruncated = false;
    let stderrTruncated = false;

    container.stdin.write(JSON.stringify(input));
    container.stdin.end();

    container.stdout.on('data', (data) => {
      if (stdoutTruncated) return;
      const chunk = data.toString();
      const remaining = CONTAINER_MAX_OUTPUT_SIZE - stdout.length;
      if (chunk.length > remaining) {
        stdout += chunk.slice(0, remaining);
        stdoutTruncated = true;
        logger.warn(
          { group: group.name, size: stdout.length },
          'Container stdout truncated due to size limit',
        );
      } else {
        stdout += chunk;
      }
    });

    container.stderr.on('data', (data) => {
      const chunk = data.toString();
      const lines = chunk.trim().split('\n');
      for (const line of lines) {
        if (line) logger.debug({ container: group.folder }, line);
      }
      if (stderrTruncated) return;
      const remaining = CONTAINER_MAX_OUTPUT_SIZE - stderr.length;
      if (chunk.length > remaining) {
        stderr += chunk.slice(0, remaining);
        stderrTruncated = true;
        logger.warn(
          { group: group.name, size: stderr.length },
          'Container stderr truncated due to size limit',
        );
      } else {
        stderr += chunk;
      }
    });

    const timeout = setTimeout(() => {
      logger.error({ group: group.name }, 'Container timeout, killing');
      container.kill('SIGKILL');
      resolve({
        status: 'error',
        result: null,
        error: `Container timed out after ${CONTAINER_TIMEOUT}ms`,
      });
    }, group.containerConfig?.timeout || CONTAINER_TIMEOUT);

    container.on('close', (code) => {
      clearTimeout(timeout);
      const duration = Date.now() - startTime;

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const logFile = path.join(logsDir, `container-${timestamp}.log`);
      const isVerbose =
        process.env.LOG_LEVEL === 'debug' || process.env.LOG_LEVEL === 'trace';

      const logLines = [
        `=== Container Run Log ===`,
        `Timestamp: ${new Date().toISOString()}`,
        `Group: ${group.name}`,
        `IsMain: ${input.isMain}`,
        `Duration: ${duration}ms`,
        `Exit Code: ${code}`,
        `Stdout Truncated: ${stdoutTruncated}`,
        `Stderr Truncated: ${stderrTruncated}`,
        ``,
      ];

      if (isVerbose) {
        logLines.push(
          `=== Input ===`,
          JSON.stringify(input, null, 2),
          ``,
          `=== Container Args ===`,
          containerArgs.join(' '),
          ``,
          `=== Mounts ===`,
          mounts
            .map(
              (m) =>
                `${m.hostPath} -> ${m.containerPath}${m.readonly ? ' (ro)' : ''}`,
            )
            .join('\n'),
          ``,
          `=== Stderr${stderrTruncated ? ' (TRUNCATED)' : ''} ===`,
          stderr,
          ``,
          `=== Stdout${stdoutTruncated ? ' (TRUNCATED)' : ''} ===`,
          stdout,
        );
      } else {
        logLines.push(
          `=== Input Summary ===`,
          `Prompt length: ${input.prompt.length} chars`,
          `Session ID: ${input.sessionId || 'new'}`,
          ``,
          `=== Mounts ===`,
          mounts
            .map((m) => `${m.containerPath}${m.readonly ? ' (ro)' : ''}`)
            .join('\n'),
          ``,
        );

        if (code !== 0) {
          logLines.push(
            `=== Stderr (last 500 chars) ===`,
            stderr.slice(-500),
            ``,
          );
        }
      }

      fs.writeFileSync(logFile, logLines.join('\n'));
      logger.debug({ logFile, verbose: isVerbose }, 'Container log written');

      if (code !== 0) {
        logger.error(
          {
            group: group.name,
            code,
            duration,
            stderr: stderr.slice(-500),
            logFile,
          },
          'Container exited with error',
        );

        resolve({
          status: 'error',
          result: null,
          error: `Container exited with code ${code}: ${stderr.slice(-200)}`,
        });
        return;
      }

      try {
        // Extract JSON between sentinel markers for robust parsing
        const startIdx = stdout.indexOf(OUTPUT_START_MARKER);
        const endIdx = stdout.indexOf(OUTPUT_END_MARKER);

        let jsonLine: string;
        if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
          jsonLine = stdout
            .slice(startIdx + OUTPUT_START_MARKER.length, endIdx)
            .trim();
        } else {
          // Fallback: last non-empty line (backwards compatibility)
          const lines = stdout.trim().split('\n');
          jsonLine = lines[lines.length - 1];
        }

        const output: ContainerOutput = JSON.parse(jsonLine);

        logger.info(
          {
            group: group.name,
            duration,
            status: output.status,
            hasResult: !!output.result,
          },
          'Container completed',
        );

        resolve(output);
      } catch (err) {
        logger.error(
          {
            group: group.name,
            stdout: stdout.slice(-500),
            error: err,
          },
          'Failed to parse container output',
        );

        resolve({
          status: 'error',
          result: null,
          error: `Failed to parse container output: ${err instanceof Error ? err.message : String(err)}`,
        });
      }
    });

    container.on('error', (err) => {
      clearTimeout(timeout);
      logger.error({ group: group.name, error: err }, 'Container spawn error');
      resolve({
        status: 'error',
        result: null,
        error: `Container spawn error: ${err.message}`,
      });
    });
  });
}

export function writeTasksSnapshot(
  groupFolder: string,
  isMain: boolean,
  tasks: Array<{
    id: string;
    groupFolder: string;
    prompt: string;
    schedule_type: string;
    schedule_value: string;
    status: string;
    next_run: string | null;
  }>,
): void {
  // Write filtered tasks to the group's IPC directory
  const groupIpcDir = path.join(DATA_DIR, 'ipc', groupFolder);
  fs.mkdirSync(groupIpcDir, { recursive: true });

  // Main sees all tasks, others only see their own
  const filteredTasks = isMain
    ? tasks
    : tasks.filter((t) => t.groupFolder === groupFolder);

  const tasksFile = path.join(groupIpcDir, 'current_tasks.json');
  fs.writeFileSync(tasksFile, JSON.stringify(filteredTasks, null, 2));
}

export interface AvailableGroup {
  jid: string;
  name: string;
  lastActivity: string;
  isRegistered: boolean;
}

/**
 * Write available groups snapshot for the container to read.
 * Only main group can see all available groups (for activation).
 * Non-main groups only see their own registration status.
 */
export function writeGroupsSnapshot(
  groupFolder: string,
  isMain: boolean,
  groups: AvailableGroup[],
  registeredJids: Set<string>,
): void {
  const groupIpcDir = path.join(DATA_DIR, 'ipc', groupFolder);
  fs.mkdirSync(groupIpcDir, { recursive: true });

  // Main sees all groups; others see nothing (they can't activate groups)
  const visibleGroups = isMain ? groups : [];

  const groupsFile = path.join(groupIpcDir, 'available_groups.json');
  fs.writeFileSync(
    groupsFile,
    JSON.stringify(
      {
        groups: visibleGroups,
        lastSync: new Date().toISOString(),
      },
      null,
      2,
    ),
  );
}
