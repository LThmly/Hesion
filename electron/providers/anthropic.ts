import type { ChatMessage, ContentPart } from "../../shared/types";
import {
  flattenUserContent,
  parseModelId,
  requireKey,
  textFromParts,
  type StreamParams,
} from "./types";

function toAnthropicContent(parts: ContentPart[]) {
  return parts.map((p) => {
    if (p.type === "text") {
      return { type: "text" as const, text: p.text };
    }
    return {
      type: "image" as const,
      source: {
        type: "base64" as const,
        media_type: p.mimeType,
        data: p.data,
      },
    };
  });
}

function toMessages(messages: ChatMessage[]) {
  const out: Array<{
    role: "user" | "assistant";
    content: string | ReturnType<typeof toAnthropicContent>;
  }> = [];

  for (const m of messages) {
    if (m.role === "system") continue;
    if (m.role === "assistant") {
      out.push({ role: "assistant", content: m.content });
      continue;
    }
    const parts = flattenUserContent(m.parts, m.content);
    const hasImage = parts.some((p) => p.type === "image");
    out.push({
      role: "user",
      content: hasImage
        ? toAnthropicContent(parts)
        : textFromParts(parts, m.content),
    });
  }
  return out;
}

export async function streamAnthropic(params: StreamParams): Promise<void> {
  const { model } = parseModelId(params.modelId);
  const key = requireKey(params.apiKeys, "anthropic");

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
    },
    signal: params.signal,
    body: JSON.stringify({
      model,
      max_tokens: 4096,
      stream: true,
      system: params.systemPrompt || undefined,
      messages: toMessages(params.messages),
      // Server-side web search — Anthropic runs the tool, no client loop needed.
      tools: [
        {
          type: "web_search_20250305",
          name: "web_search",
          max_uses: 5,
        },
      ],
    }),
  });

  if (!res.ok || !res.body) {
    const errText = await res.text().catch(() => res.statusText);
    params.onChunk({
      type: "error",
      error: `anthropic error ${res.status}: ${errText}`,
    });
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let inputTokens = 0;
  let outputTokens = 0;

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
          type?: string;
          delta?: { type?: string; text?: string };
          message?: { usage?: { input_tokens?: number; output_tokens?: number } };
          usage?: { input_tokens?: number; output_tokens?: number };
          error?: { message?: string };
        };
        if (json.type === "error") {
          params.onChunk({
            type: "error",
            error: json.error?.message || "anthropic stream error",
          });
          return;
        }
        if (json.type === "message_start" && json.message?.usage) {
          inputTokens = json.message.usage.input_tokens ?? inputTokens;
          outputTokens = json.message.usage.output_tokens ?? outputTokens;
        }
        if (json.type === "message_delta" && json.usage) {
          if (typeof json.usage.input_tokens === "number") {
            inputTokens = json.usage.input_tokens;
          }
          if (typeof json.usage.output_tokens === "number") {
            outputTokens = json.usage.output_tokens;
          }
        }
        if (
          json.type === "content_block_delta" &&
          json.delta?.type === "text_delta" &&
          json.delta.text
        ) {
          params.onChunk({ type: "delta", text: json.delta.text });
        }
        if (json.type === "message_stop") {
          params.onChunk({
            type: "done",
            usage: {
              inputTokens,
              outputTokens,
              totalTokens: inputTokens + outputTokens,
            },
          });
          return;
        }
      } catch {
        // ignore
      }
    }
  }
  params.onChunk({
    type: "done",
    usage:
      inputTokens || outputTokens
        ? {
            inputTokens,
            outputTokens,
            totalTokens: inputTokens + outputTokens,
          }
        : undefined,
  });
}
