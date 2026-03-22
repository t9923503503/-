import { existsSync, readFileSync } from 'fs';

const SERVER_ENV_CANDIDATES = ['/etc/kotc-web.env', '.env.local'];

let cachedEnvFileValues: Map<string, string> | null = null;

function parseEnvFile(text: string): Map<string, string> {
  const out = new Map<string, string>();
  text.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const idx = trimmed.indexOf('=');
    if (idx <= 0) return;
    const key = trimmed.slice(0, idx).trim();
    const rawValue = trimmed.slice(idx + 1).trim();
    const value =
      rawValue.startsWith('"') && rawValue.endsWith('"')
        ? rawValue.slice(1, -1)
        : rawValue.startsWith("'") && rawValue.endsWith("'")
          ? rawValue.slice(1, -1)
          : rawValue;
    if (key) out.set(key, value);
  });
  return out;
}

function getEnvFileValues(): Map<string, string> {
  if (cachedEnvFileValues) return cachedEnvFileValues;

  const merged = new Map<string, string>();
  for (const candidate of SERVER_ENV_CANDIDATES) {
    try {
      if (!existsSync(candidate)) continue;
      const parsed = parseEnvFile(readFileSync(candidate, 'utf8'));
      parsed.forEach((value, key) => merged.set(key, value));
    } catch {
      // Ignore missing or unreadable optional env files.
    }
  }

  cachedEnvFileValues = merged;
  return merged;
}

export function readServerEnv(name: string): string {
  const runtimeValue = process.env[name];
  if (runtimeValue != null && String(runtimeValue) !== '') {
    return String(runtimeValue);
  }
  return getEnvFileValues().get(name) ?? '';
}
