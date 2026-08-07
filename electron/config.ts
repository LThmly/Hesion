import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { DEFAULT_CONFIG, EMPTY_USAGE_STATE, type HesionConfig, type ResponseDepth, type Session, type TaskMode, type ThemeMode, type UsageEvent, type UsageState, type UsageTotals, type ProviderId } from "../shared/types";

function xdgConfigHome(): string {
  return process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config");
}

function asDepth(
  value: unknown,
  fallback: ResponseDepth,
): ResponseDepth {
  return value === "minimal" || value === "medium" || value === "detailed"
    ? value
    : fallback;
}

function asTheme(value: unknown): ThemeMode {
  return value === "light" ? "light" : "dark";
}

function asTaskMode(value: unknown): TaskMode {
  return value === "study" ? "study" : "default";
}

export function configDir(): string {
  return path.join(xdgConfigHome(), "hesion");
}

export function configPath(): string {
  return path.join(configDir(), "config.json");
}

export function sessionsPath(): string {
  return path.join(configDir(), "sessions.json");
}

export function usagePath(): string {
  return path.join(configDir(), "usage.json");
}

export function ensureConfigDir(): void {
  fs.mkdirSync(configDir(), { recursive: true });
}

export function loadConfig(): HesionConfig {
  ensureConfigDir();
  try {
    const raw = fs.readFileSync(configPath(), "utf8");
    const parsed = JSON.parse(raw) as Partial<HesionConfig> & {
      overlayHotkey?: string;
      overlayEnabled?: boolean;
    };
    const { overlayHotkey, overlayEnabled: _o, ...rest } = parsed;
    return {
      ...DEFAULT_CONFIG,
      ...rest,
      compactHotkey:
        rest.compactHotkey || overlayHotkey || DEFAULT_CONFIG.compactHotkey,
      includeActiveWindow:
        rest.includeActiveWindow ?? DEFAULT_CONFIG.includeActiveWindow,
      includeClipboard:
        rest.includeClipboard ?? DEFAULT_CONFIG.includeClipboard,
      showMicrophone: rest.showMicrophone ?? DEFAULT_CONFIG.showMicrophone,
      responseDepthCompact: asDepth(
        rest.responseDepthCompact,
        DEFAULT_CONFIG.responseDepthCompact,
      ),
      responseDepthExpanded: asDepth(
        rest.responseDepthExpanded,
        DEFAULT_CONFIG.responseDepthExpanded,
      ),
      composerPlaceholder:
        typeof rest.composerPlaceholder === "string"
          ? rest.composerPlaceholder
          : DEFAULT_CONFIG.composerPlaceholder,
      theme: asTheme(rest.theme),
      taskMode: asTaskMode(rest.taskMode),
      apiKeys: { ...DEFAULT_CONFIG.apiKeys, ...(parsed.apiKeys || {}) },
    };
  } catch {
    const cfg = { ...DEFAULT_CONFIG };
    saveConfig(cfg);
    return cfg;
  }
}

export function saveConfig(config: HesionConfig): void {
  ensureConfigDir();
  fs.writeFileSync(configPath(), JSON.stringify(config, null, 2), {
    mode: 0o600,
  });
}

export function loadSessions(): Session[] {
  ensureConfigDir();
  try {
    const raw = fs.readFileSync(sessionsPath(), "utf8");
    return JSON.parse(raw) as Session[];
  } catch {
    return [];
  }
}

export function saveSessions(sessions: Session[]): void {
  ensureConfigDir();
  // Strip large image payloads from persisted history to keep disk light
  const slim = sessions.map((s) => ({
    ...s,
    messages: s.messages.map((m) => {
      const textParts = (m.parts || []).filter((p) => p.type === "text");
      const hadImage = (m.parts || []).some((p) => p.type === "image");
      return {
        ...m,
        parts: hadImage
          ? [
              ...textParts,
              { type: "text" as const, text: "[screenshot attached]" },
            ]
          : textParts.length
            ? textParts
            : undefined,
      };
    }),
  }));
  fs.writeFileSync(sessionsPath(), JSON.stringify(slim, null, 2), {
    mode: 0o600,
  });
}

function asTotals(value: unknown): UsageTotals {
  const v = value as Partial<UsageTotals> | null;
  return {
    inputTokens: typeof v?.inputTokens === "number" ? v.inputTokens : 0,
    outputTokens: typeof v?.outputTokens === "number" ? v.outputTokens : 0,
    totalTokens: typeof v?.totalTokens === "number" ? v.totalTokens : 0,
    requests: typeof v?.requests === "number" ? v.requests : 0,
  };
}

export function loadUsage(): UsageState {
  ensureConfigDir();
  try {
    const raw = fs.readFileSync(usagePath(), "utf8");
    const parsed = JSON.parse(raw) as Partial<UsageState>;
    const byProvider: UsageState["byProvider"] = {};
    if (parsed.byProvider && typeof parsed.byProvider === "object") {
      for (const [key, val] of Object.entries(parsed.byProvider)) {
        if (
          key === "openai" ||
          key === "anthropic" ||
          key === "openrouter" ||
          key === "gemini"
        ) {
          byProvider[key as ProviderId] = asTotals(val);
        }
      }
    }
    const recent = Array.isArray(parsed.recent)
      ? parsed.recent
          .filter((e): e is UsageEvent => Boolean(e && typeof e === "object"))
          .slice(0, 100)
      : [];
    return {
      lifetime: asTotals(parsed.lifetime),
      byProvider,
      recent,
    };
  } catch {
    const empty = {
      lifetime: { ...EMPTY_USAGE_STATE.lifetime },
      byProvider: {},
      recent: [],
    };
    saveUsage(empty);
    return empty;
  }
}

export function saveUsage(usage: UsageState): void {
  ensureConfigDir();
  fs.writeFileSync(usagePath(), JSON.stringify(usage, null, 2), {
    mode: 0o600,
  });
}
