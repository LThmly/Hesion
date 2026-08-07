import type { ChatMessage, ContentPart } from "../../shared/types";
import {
  flattenUserContent,
  parseModelId,
  requireKey,
  type StreamParams,
} from "./types";

function toGeminiParts(parts: ContentPart[]) {
  return parts.map((p) => {
    if (p.type === "text") return { text: p.text };
    return {
      inline_data: {
        mime_type: p.mimeType,
        data: p.data,
      },
    };
  });
}

function toContents(messages: ChatMessage[]) {
  const contents: Array<{
    role: "user" | "model";
    parts: ReturnType<typeof toGeminiParts> | Array<{ text: string }>;
  }> = [];

  for (const m of messages) {
    if (m.role === "system") continue;
    if (m.role === "assistant") {
      contents.push({ role: "model", parts: [{ text: m.content }] });
      continue;
    }
    const parts = flattenUserContent(m.parts, m.content);
    contents.push({ role: "user", parts: toGeminiParts(parts) });
  }
  return contents;
}

export async function streamGemini(params: StreamParams): Promise<void> {
  const { model } = parseModelId(params.modelId);
  const key = requireKey(params.apiKeys, "gemini");
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${encodeURIComponent(key)}`;

  const body: Record<string, unknown> = {
    contents: toContents(params.messages),
    // Google Search grounding — Gemini retrieves live web results when useful.
    tools: [{ google_search: {} }],
  };
  if (params.systemPrompt.trim()) {
    body.systemInstruction = { parts: [{ text: params.systemPrompt }] };
  }

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal: params.signal,
    body: JSON.stringify(body),
  });

  if (!res.ok || !res.body) {
    const errText = await res.text().catch(() => res.statusText);
    params.onChunk({
      type: "error",
      error: `gemini error ${res.status}: ${errText}`,
    });
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let usage:
    | { inputTokens: number; outputTokens: number; totalTokens: number }
    | undefined;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const data = trimmed.slice(5).trim();
      if (!data) continue;
      try {
        const json = JSON.parse(data) as {
          candidates?: Array<{
            content?: { parts?: Array<{ text?: string }> };
          }>;
          usageMetadata?: {
            promptTokenCount?: number;
            candidatesTokenCount?: number;
            totalTokenCount?: number;
          };
        };
        const text = json.candidates?.[0]?.content?.parts
          ?.map((p) => p.text || "")
          .join("");
        if (text) params.onChunk({ type: "delta", text });
        if (json.usageMetadata) {
          const inputTokens = json.usageMetadata.promptTokenCount ?? 0;
          const outputTokens = json.usageMetadata.candidatesTokenCount ?? 0;
          usage = {
            inputTokens,
            outputTokens,
            totalTokens:
              json.usageMetadata.totalTokenCount ?? inputTokens + outputTokens,
          };
        }
      } catch {
        // ignore
      }
    }
  }
  params.onChunk({ type: "done", usage });
}
