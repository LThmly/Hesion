import type { ChatMessage, ContentPart } from "../../shared/types";
import { webSearch, fetchPage } from "../webSearch";
import {
  flattenUserContent,
  parseModelId,
  requireKey,
  textFromParts,
  type StreamParams,
} from "./types";

const WEB_SEARCH_FUNCTION = {
  type: "function" as const,
  function: {
    name: "web_search",
    description:
      "Search the live web for up-to-date information. Use for current events, docs, prices, news, and anything that may be past your knowledge cutoff.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Search query",
        },
      },
      required: ["query"],
    },
  },
};

const FETCH_URL_FUNCTION = {
  type: "function" as const,
  function: {
    name: "fetch_url",
    description:
      "Fetch and read the text content of a web page. Use after web_search to verify details that snippets may miss or misrepresent.",
    parameters: {
      type: "object",
      properties: {
        url: {
          type: "string",
          description: "Absolute http(s) URL to fetch",
        },
      },
      required: ["url"],
    },
  },
};

type OpenAIMessage = {
  role: string;
  content?: string | ReturnType<typeof toOpenAIContent> | null;
  tool_calls?: Array<{
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }>;
  tool_call_id?: string;
};

function toOpenAIContent(parts: ContentPart[]) {
  return parts.map((p) => {
    if (p.type === "text") {
      return { type: "text" as const, text: p.text };
    }
    return {
      type: "image_url" as const,
      image_url: {
        url: `data:${p.mimeType};base64,${p.data}`,
      },
    };
  });
}

function toChatMessages(
  systemPrompt: string,
  messages: ChatMessage[],
): OpenAIMessage[] {
  const out: OpenAIMessage[] = [];
  if (systemPrompt.trim()) {
    out.push({ role: "system", content: systemPrompt });
  }
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
        ? toOpenAIContent(parts)
        : textFromParts(parts, m.content),
    });
  }
  return out;
}

/** Responses API input items (OpenAI native web_search path). */
function toResponsesInput(messages: ChatMessage[]): unknown[] {
  const input: unknown[] = [];
  for (const m of messages) {
    if (m.role === "system") continue;
    if (m.role === "assistant") {
      input.push({ role: "assistant", content: m.content });
      continue;
    }
    const parts = flattenUserContent(m.parts, m.content);
    const hasImage = parts.some((p) => p.type === "image");
    if (!hasImage) {
      input.push({
        role: "user",
        content: textFromParts(parts, m.content),
      });
      continue;
    }
    input.push({
      role: "user",
      content: parts.map((p) => {
        if (p.type === "text") {
          return { type: "input_text", text: p.text };
        }
        return {
          type: "input_image",
          image_url: `data:${p.mimeType};base64,${p.data}`,
        };
      }),
    });
  }
  return input;
}

/**
 * OpenAI official path: Responses API + hosted web_search.
 * Avoids broken third-party HTML scraping and GPT-5.6 tool/reasoning conflicts.
 */
async function streamOpenAIResponses(params: StreamParams): Promise<void> {
  const { model } = parseModelId(params.modelId);
  const key = requireKey(params.apiKeys, "openai");

  const res = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    signal: params.signal,
    body: JSON.stringify({
      model,
      stream: true,
      // Agentic search: open_page / find_in_page need reasoning (not "none").
      reasoning: { effort: "low" },
      tools: [
        {
          type: "web_search",
          search_context_size: "high",
        },
      ],
      instructions: params.systemPrompt || undefined,
      input: toResponsesInput(params.messages),
    }),
  });

  if (!res.ok || !res.body) {
    const errText = await res.text().catch(() => res.statusText);
    params.onChunk({
      type: "error",
      error: `openai error ${res.status}: ${errText}`,
    });
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

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
      if (!data || data === "[DONE]") continue;
      try {
        const json = JSON.parse(data) as {
          type?: string;
          delta?: string;
          text?: string;
          response?: {
            usage?: {
              input_tokens?: number;
              output_tokens?: number;
              total_tokens?: number;
            };
          };
          error?: { message?: string };
        };
        if (json.type === "response.output_text.delta" && json.delta) {
          params.onChunk({ type: "delta", text: json.delta });
        } else if (json.type === "response.output_text.delta" && json.text) {
          params.onChunk({ type: "delta", text: json.text });
        } else if (json.type === "error") {
          params.onChunk({
            type: "error",
            error: json.error?.message || "openai responses error",
          });
          return;
        } else if (
          json.type === "response.completed" ||
          json.type === "response.incomplete"
        ) {
          const u = json.response?.usage;
          params.onChunk({
            type: "done",
            usage: u
              ? {
                  inputTokens: u.input_tokens ?? 0,
                  outputTokens: u.output_tokens ?? 0,
                  totalTokens:
                    u.total_tokens ??
                    (u.input_tokens ?? 0) + (u.output_tokens ?? 0),
                }
              : undefined,
          });
          return;
        } else if (json.type === "response.failed") {
          params.onChunk({
            type: "error",
            error: json.error?.message || "openai response failed",
          });
          return;
        }
      } catch {
        // ignore partial JSON
      }
    }
  }
  params.onChunk({ type: "done" });
}

type ToolCallAcc = {
  id: string;
  name: string;
  arguments: string;
};

async function streamChatOnce(
  params: StreamParams,
  baseUrl: string,
  provider: "openrouter",
  messages: OpenAIMessage[],
  key: string,
): Promise<{
  text: string;
  toolCalls: ToolCallAcc[];
  done: boolean;
  usage?: { inputTokens: number; outputTokens: number; totalTokens: number };
}> {
  const { model } = parseModelId(params.modelId);
  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
      "HTTP-Referer": "https://hesion.local",
      "X-Title": "Hesion",
    },
    signal: params.signal,
    body: JSON.stringify({
      model,
      stream: true,
      stream_options: { include_usage: true },
      messages,
      tools: [WEB_SEARCH_FUNCTION, FETCH_URL_FUNCTION],
      tool_choice: "auto",
    }),
  });

  if (!res.ok || !res.body) {
    const errText = await res.text().catch(() => res.statusText);
    throw new Error(`${provider} error ${res.status}: ${errText}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let text = "";
  const toolCalls = new Map<number, ToolCallAcc>();
  let finishReason: string | null = null;
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
      if (data === "[DONE]") continue;
      try {
        const json = JSON.parse(data) as {
          usage?: {
            prompt_tokens?: number;
            completion_tokens?: number;
            total_tokens?: number;
          };
          choices?: Array<{
            finish_reason?: string | null;
            delta?: {
              content?: string;
              tool_calls?: Array<{
                index?: number;
                id?: string;
                function?: { name?: string; arguments?: string };
              }>;
            };
          }>;
        };
        if (json.usage) {
          usage = {
            inputTokens: json.usage.prompt_tokens ?? 0,
            outputTokens: json.usage.completion_tokens ?? 0,
            totalTokens:
              json.usage.total_tokens ??
              (json.usage.prompt_tokens ?? 0) +
                (json.usage.completion_tokens ?? 0),
          };
        }
        const choice = json.choices?.[0];
        if (!choice) continue;
        if (choice.finish_reason) finishReason = choice.finish_reason;
        const delta = choice.delta;
        if (delta?.content) {
          text += delta.content;
          params.onChunk({ type: "delta", text: delta.content });
        }
        for (const tc of delta?.tool_calls ?? []) {
          const idx = tc.index ?? 0;
          const cur = toolCalls.get(idx) ?? {
            id: "",
            name: "",
            arguments: "",
          };
          if (tc.id) cur.id = tc.id;
          if (tc.function?.name) cur.name += tc.function.name;
          if (tc.function?.arguments) cur.arguments += tc.function.arguments;
          toolCalls.set(idx, cur);
        }
      } catch {
        // ignore
      }
    }
  }

  const calls = [...toolCalls.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, v]) => v)
    .filter((c) => c.name === "web_search" || c.name === "fetch_url");

  return {
    text,
    toolCalls: calls,
    done: finishReason !== "tool_calls" || calls.length === 0,
    usage,
  };
}

async function streamOpenRouterWithTools(params: StreamParams): Promise<void> {
  const key = requireKey(params.apiKeys, "openrouter");
  const messages = toChatMessages(params.systemPrompt, params.messages);
  const maxRounds = 4;
  let usage:
    | { inputTokens: number; outputTokens: number; totalTokens: number }
    | undefined;

  for (let round = 0; round < maxRounds; round++) {
    const result = await streamChatOnce(
      params,
      "https://openrouter.ai/api/v1",
      "openrouter",
      messages,
      key,
    );
    if (result.usage) {
      usage = usage
        ? {
            inputTokens: usage.inputTokens + result.usage.inputTokens,
            outputTokens: usage.outputTokens + result.usage.outputTokens,
            totalTokens: usage.totalTokens + result.usage.totalTokens,
          }
        : result.usage;
    }
    if (result.done || result.toolCalls.length === 0) {
      params.onChunk({ type: "done", usage });
      return;
    }

    messages.push({
      role: "assistant",
      content: result.text || null,
      tool_calls: result.toolCalls.map((c) => ({
        id: c.id || `call_${round}`,
        type: "function" as const,
        function: { name: c.name, arguments: c.arguments || "{}" },
      })),
    });

    for (const call of result.toolCalls) {
      let toolResult = "Tool failed.";
      try {
        const args = JSON.parse(call.arguments || "{}") as {
          query?: string;
          url?: string;
        };
        if (call.name === "web_search") {
          const query = args.query?.trim() || "";
          toolResult = query
            ? await webSearch(query, params.signal)
            : "Missing search query.";
        } else if (call.name === "fetch_url") {
          const url = args.url?.trim() || "";
          toolResult = url
            ? await fetchPage(url, params.signal)
            : "Missing URL.";
        } else {
          toolResult = `Unknown tool: ${call.name}`;
        }
      } catch {
        toolResult = "Invalid tool arguments.";
      }
      messages.push({
        role: "tool",
        tool_call_id: call.id || `call_${round}`,
        content: toolResult,
      });
    }
  }

  params.onChunk({ type: "done", usage });
}

export async function streamOpenAI(params: StreamParams): Promise<void> {
  try {
    await streamOpenAIResponses(params);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (!message.includes("abort")) {
      params.onChunk({ type: "error", error: message });
    }
  }
}

export async function streamOpenRouter(params: StreamParams): Promise<void> {
  try {
    await streamOpenRouterWithTools(params);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (!message.includes("abort")) {
      params.onChunk({ type: "error", error: message });
    }
  }
}
