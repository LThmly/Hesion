import type {
  ApiKeys,
  ChatMessage,
  ContentPart,
  ProviderId,
  StreamChunk,
} from "../../shared/types";

export interface StreamParams {
  modelId: string;
  systemPrompt: string;
  messages: ChatMessage[];
  apiKeys: ApiKeys;
  signal?: AbortSignal;
  onChunk: (chunk: StreamChunk) => void;
}

export function parseModelId(modelId: string): {
  provider: ProviderId;
  model: string;
} {
  const idx = modelId.indexOf(":");
  if (idx === -1) {
    return { provider: "openai", model: modelId };
  }
  return {
    provider: modelId.slice(0, idx) as ProviderId,
    model: modelId.slice(idx + 1),
  };
}

export function requireKey(keys: ApiKeys, provider: ProviderId): string {
  const key = keys[provider];
  if (!key) {
    throw new Error(
      `Missing API key for ${provider}. Add it in Settings.`,
    );
  }
  return key;
}

export function flattenUserContent(parts: ContentPart[] | undefined, text: string): ContentPart[] {
  if (parts?.length) return parts;
  return [{ type: "text", text }];
}

export function textFromParts(
  parts: ContentPart[] | undefined,
  fallback: string,
): string {
  if (!parts?.length) return fallback;
  const text = parts
    .filter((p): p is Extract<ContentPart, { type: "text" }> => p.type === "text")
    .map((p) => p.text)
    .join("\n\n")
    .trim();
  return text || fallback;
}
