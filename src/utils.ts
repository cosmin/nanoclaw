import fs from 'fs';
import path from 'path';

export function loadJson<T>(filePath: string, defaultValue: T): T {
  try {
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    }
  } catch {
    // Return default on error
  }
  return defaultValue;
}

export function saveJson(filePath: string, data: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

/**
 * Normalize JID by removing LID-style suffix (e.g. ":1") from the local part,
 * while preserving the domain (if any).
 */
export function normalizeJid(jid: string): string {
  // Split into local part and domain (if present)
  const [localPart, domain] = jid.split('@', 2);

  // Remove any suffix after the first ":" only from the local part
  const normalizedLocal = localPart.split(':')[0];

  // Reattach domain if it exists
  return domain ? `${normalizedLocal}@${domain}` : normalizedLocal;
}
