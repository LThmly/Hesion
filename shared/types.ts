export type ProviderId = "openai" | "anthropic" | "openrouter" | "gemini";

export type ModelCapability = "vision" | "tools" | "audio";

export interface ModelInfo {
  id: string;
  label: string;
  provider: ProviderId;
  capabilities: ModelCapability[];
}

export interface ApiKeys {
  openai?: string;
  anthropic?: string;
  openrouter?: string;
  gemini?: string;
}

export type CaptureMode = "output" | "region" | "window";

export type ResponseDepth = "minimal" | "medium" | "detailed";

export type ThemeMode = "dark" | "light";

export type TaskMode = "default" | "study";

export interface HesionConfig {
  apiKeys: ApiKeys;
  defaultModel: string;
  compactHotkey: string;
  captureMode: CaptureMode;
  systemPrompt: string;
  includeActiveWindow: boolean;
  includeClipboard: boolean;
  showMicrophone: boolean;
  /** Verbosity while in compact mode */
  responseDepthCompact: ResponseDepth;
  /** Verbosity while expanded */
  responseDepthExpanded: ResponseDepth;
  /** Placeholder text in the expanded composer */
  composerPlaceholder: string;
  theme: ThemeMode;
  /** Task mode unlocks feature surfaces (Study tools, etc.) */
  taskMode: TaskMode;
}

export interface Flashcard {
  id: string;
  front: string;
  back: string;
  sourceMessageId?: string;
  createdAt: number;
}

export interface QuizQuestion {
  id: string;
  prompt: string;
  choices: string[];
  correctIndex: number;
  explanation?: string;
}

export interface Quiz {
  id: string;
  questions: QuizQuestion[];
  createdAt: number;
}

export interface ContentPartText {
  type: "text";
  text: string;
}

export interface ContentPartImage {
  type: "image";
  /** base64 without data-url prefix */
  data: string;
  mimeType: string;
}

export type ContentPart = ContentPartText | ContentPartImage;

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  /** On-demand deeper explanation (compact "Explain more"); not part of content. */
  detail?: string;
  parts?: ContentPart[];
  createdAt: number;
  model?: string;
}

export interface Session {
  id: string;
  title: string;
  model: string;
  messages: ChatMessage[];
  /** Study mode flashcard deck for this session */
  flashcards?: Flashcard[];
  createdAt: number;
  updatedAt: number;
}

export interface AppState {
  sessions: Session[];
  activeSessionId: string | null;
  config: HesionConfig;
  screenContextEnabled: boolean;
  pendingAttachment: PendingAttachment | null;
  compactMode: boolean;
  streaming: boolean;
  /** Streaming a compact "Explain more" detail for the last assistant message. */
  elaborating: boolean;
  /** Study harvest / quiz generation in flight */
  studying: boolean;
  /** Ephemeral quiz from generateQuiz (not persisted) */
  activeQuiz: Quiz | null;
  studyError: string | null;
  /** Aggregated LLM token usage */
  usage: UsageState;
}

export interface PendingAttachment {
  data: string;
  mimeType: string;
  previewDataUrl: string;
  source: "screen" | "paste" | "file";
  capturedAt: number;
}

export interface StreamChunk {
  type: "delta" | "done" | "error";
  text?: string;
  error?: string;
  messageId?: string;
  usage?: TokenUsage;
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

export type UsagePurpose = "chat" | "elaborate" | "harvest" | "quiz";

export interface UsageEvent {
  id: string;
  at: number;
  model: string;
  provider: ProviderId;
  purpose: UsagePurpose;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

export interface UsageTotals {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  requests: number;
}

export interface UsageState {
  lifetime: UsageTotals;
  byProvider: Partial<Record<ProviderId, UsageTotals>>;
  recent: UsageEvent[];
}

export const EMPTY_USAGE_TOTALS: UsageTotals = {
  inputTokens: 0,
  outputTokens: 0,
  totalTokens: 0,
  requests: 0,
};

export const EMPTY_USAGE_STATE: UsageState = {
  lifetime: { ...EMPTY_USAGE_TOTALS },
  byProvider: {},
  recent: [],
};

export function emptyUsageTotals(): UsageTotals {
  return { ...EMPTY_USAGE_TOTALS };
}

export function mergeTokenUsage(
  a?: TokenUsage | null,
  b?: TokenUsage | null,
): TokenUsage | undefined {
  if (!a && !b) return undefined;
  const inputTokens = (a?.inputTokens ?? 0) + (b?.inputTokens ?? 0);
  const outputTokens = (a?.outputTokens ?? 0) + (b?.outputTokens ?? 0);
  const totalTokens =
    (a?.totalTokens || (a ? a.inputTokens + a.outputTokens : 0)) +
    (b?.totalTokens || (b ? b.inputTokens + b.outputTokens : 0));
  return { inputTokens, outputTokens, totalTokens };
}

export interface SendMessageRequest {
  sessionId: string;
  text: string;
  includeScreen: boolean;
  includeActiveWindow?: boolean;
  includeClipboard?: boolean;
}

export const DEFAULT_MODELS: ModelInfo[] = [
  // OpenAI — GPT-5.6 family
  {
    id: "openai:gpt-5.6-sol",
    label: "GPT-5.6 Sol",
    provider: "openai",
    capabilities: ["vision", "tools"],
  },
  {
    id: "openai:gpt-5.6-terra",
    label: "GPT-5.6 Terra",
    provider: "openai",
    capabilities: ["vision", "tools"],
  },
  {
    id: "openai:gpt-5.6-luna",
    label: "GPT-5.6 Luna",
    provider: "openai",
    capabilities: ["vision", "tools"],
  },
  // Anthropic — Claude 5
  {
    id: "anthropic:claude-fable-5",
    label: "Claude Fable 5",
    provider: "anthropic",
    capabilities: ["vision", "tools"],
  },
  {
    id: "anthropic:claude-opus-5",
    label: "Claude Opus 5",
    provider: "anthropic",
    capabilities: ["vision", "tools"],
  },
  {
    id: "anthropic:claude-sonnet-5",
    label: "Claude Sonnet 5",
    provider: "anthropic",
    capabilities: ["vision", "tools"],
  },
  {
    id: "anthropic:claude-haiku-4-5",
    label: "Claude Haiku 4.5",
    provider: "anthropic",
    capabilities: ["vision", "tools"],
  },
  // Google — Gemini 3 / 2.5
  {
    id: "gemini:gemini-3.1-pro-preview",
    label: "Gemini 3.1 Pro",
    provider: "gemini",
    capabilities: ["vision", "tools"],
  },
  {
    id: "gemini:gemini-3.6-flash",
    label: "Gemini 3.6 Flash",
    provider: "gemini",
    capabilities: ["vision", "tools", "audio"],
  },
  {
    id: "gemini:gemini-2.5-pro",
    label: "Gemini 2.5 Pro",
    provider: "gemini",
    capabilities: ["vision", "tools"],
  },
  {
    id: "gemini:gemini-2.5-flash",
    label: "Gemini 2.5 Flash",
    provider: "gemini",
    capabilities: ["vision", "tools", "audio"],
  },
  // OpenRouter mirrors
  {
    id: "openrouter:openai/gpt-5.6-sol",
    label: "OR · GPT-5.6 Sol",
    provider: "openrouter",
    capabilities: ["vision", "tools"],
  },
  {
    id: "openrouter:openai/gpt-5.6-terra",
    label: "OR · GPT-5.6 Terra",
    provider: "openrouter",
    capabilities: ["vision", "tools"],
  },
  {
    id: "openrouter:anthropic/claude-fable-5",
    label: "OR · Claude Fable 5",
    provider: "openrouter",
    capabilities: ["vision", "tools"],
  },
  {
    id: "openrouter:anthropic/claude-opus-5",
    label: "OR · Claude Opus 5",
    provider: "openrouter",
    capabilities: ["vision", "tools"],
  },
  {
    id: "openrouter:anthropic/claude-sonnet-5",
    label: "OR · Claude Sonnet 5",
    provider: "openrouter",
    capabilities: ["vision", "tools"],
  },
  {
    id: "openrouter:google/gemini-3.1-pro-preview",
    label: "OR · Gemini 3.1 Pro",
    provider: "openrouter",
    capabilities: ["vision", "tools"],
  },
  {
    id: "openrouter:google/gemini-3.6-flash",
    label: "OR · Gemini 3.6 Flash",
    provider: "openrouter",
    capabilities: ["vision", "tools"],
  },
];

/** Models whose provider has a non-empty API key configured. */
export function modelsForApiKeys(
  models: ModelInfo[],
  apiKeys: ApiKeys,
): ModelInfo[] {
  return models.filter((m) => {
    const key = apiKeys[m.provider];
    return typeof key === "string" && key.trim().length > 0;
  });
}

export const DEFAULT_CONFIG: HesionConfig = {
  apiKeys: {},
  defaultModel: "openai:gpt-5.6-luna",
  compactHotkey: "Alt+Shift+Space",
  captureMode: "output",
  systemPrompt:
    "You are Hesion, a desktop assistant. When a screenshot is attached, ground your answer in what you see.",
  includeActiveWindow: true,
  includeClipboard: false,
  showMicrophone: true,
  responseDepthCompact: "minimal",
  responseDepthExpanded: "medium",
  composerPlaceholder: "Plan, search, build anything…",
  theme: "dark",
  taskMode: "default",
};

export const RESPONSE_DEPTH_PROMPTS: Record<ResponseDepth, string> = {
  minimal:
    "Response depth: minimal. Give only the essential answer — for math, the result alone. No steps, preamble, lists, or filler. Prefer under 20 words. No markdown unless required.",
  medium:
    "Response depth: medium. Be concise but clear. Lead with the answer, then a short explanation when it helps. Skip long lectures and unnecessary asides.",
  detailed:
    "Response depth: detailed. Explain thoroughly. Include reasoning, steps, and useful context. Structure the answer when it improves clarity.",
};

/** Fixed compact HUD format — replaces response-depth in compact mode. */
export const COMPACT_MODE_PROMPT = `You are in compact mode (a one-line HUD). Every reply MUST use this exact structure:

<<answer>>
<final answer only — one short line, e.g. 1.2 A (choice 1) or A — 1.2 A>
<<explain>>
<clear explanation with reasoning; a short paragraph or a few steps — enough to understand why, not just the result>

Rules:
- <<answer>> must stand alone with no preamble or steps.
- <<explain>> is shown when the user expands; make it genuinely useful, not a single vague sentence.
- Do NOT include a <<detail>> section — deeper elaboration is requested separately later.
- For ALL math, use $...$ or $$...$$ only. Write commands with a single backslash: $\\infty$, $\\Omega$, $\\to$, never \\\\infty or \\backslash\\text{infty}. Never put TeX in bare parentheses.`;

export const COMPACT_ELABORATE_PROMPT = `The user wants a bit more depth on your previous answer. Keep it compact: about 2–4 short paragraphs or a few tight steps — more than <<explain>>, but not a long lecture. Cover the key reasoning and one or two important caveats; skip fluff, repetition, and exhaustive edge-case catalogs. Use markdown. For math use $...$ / $$...$$ with single-backslash commands ($\\infty$, $\\Omega$, $\\to$). For values at infinity or switching times, keep everything in ONE math span: $i_5(\\infty)=1.2$ and $i_L(0^-)=0$ — never $i_5$\\infty$ or $i_L(0^$. Do not use <<answer>>, <<explain>>, or <<detail>> tags. Do not restate the one-line answer.`;

export const STUDY_HARVEST_PROMPT = `You extract study flashcards from a conversation. Reply with JSON ONLY (no markdown fences):
{"cards":[{"front":"concept or question","back":"concise conceptual answer"}]}

Rules:
- 5–15 cards grounded in the conversation (and any notes about attached images/slides).
- Cards MUST be about concepts only: definitions, meaning, purpose, when/why something applies, comparisons, and distinctions.
- STRICTLY FORBIDDEN on front or back: equations, formulas, symbolic math, TeX/LaTeX, numeric plug-and-chug, worked calculation steps, or "solve for" style content.
- If the chat is mostly math, translate it into conceptual understanding (e.g. what a term means, what an approach assumes) — never put the equation itself on a card.
- Front is a short conceptual prompt; back is a short conceptual answer in plain language.
- Skip chit-chat and meta instructions.
- If nothing conceptual is learnable, return {"cards":[]}.`;

export const STUDY_HARVEST_PASSIVE_PROMPT = `You add flashcards for what was JUST studied. Reply with JSON ONLY (no markdown fences):
{"cards":[{"front":"concept or question","back":"concise conceptual answer"}]}

Rules:
- Focus on the latest user question and assistant answer (and any image/slide notes).
- Extract 2–6 cards for CONCEPTS only: definitions, meaning, purpose, when/why, assumptions, comparisons, distinctions.
- STRICTLY FORBIDDEN on front or back: equations, formulas, symbolic math, TeX/LaTeX, numeric results, calculation steps, or algebra rearrangements.
- Prefer "what does X mean / when do you use X / how does X differ from Y" over any math expression.
- Front is a short conceptual prompt; back is plain-language conceptual answer.
- Do NOT repeat ideas already in the existing flashcards list.
- Skip greetings, meta talk, and pure process chatter with no study content.
- If nothing new and conceptual is learnable, return {"cards":[]}.`;

export const STUDY_QUIZ_PROMPT = `You write a short multiple-choice quiz from study material. Reply with JSON ONLY (no markdown fences):
{"questions":[{"prompt":"question text","choices":["A","B","C","D"],"correctIndex":0,"explanation":"one sentence"}]}

Rules:
- Exactly 4–8 questions.
- Each question has exactly 4 choices; correctIndex is 0–3.
- Ground questions in the provided flashcards and/or conversation.
- Explanations are brief and teaching-oriented.
- No markdown fences, no prose outside JSON.`;

export function systemPromptFor(
  base: string,
  depth: ResponseDepth,
  compactMode: boolean,
  taskMode: TaskMode = "default",
): string {
  const searchLine =
    "You have live web search. Use it for anything that may be past your knowledge cutoff or that needs current sources. When searching: prefer multiple independent sources; if titles/snippets disagree or look incomplete, keep searching or open the pages instead of guessing; never treat a single headline as proof something does not exist.";
  const studyLine =
    taskMode === "study"
      ? "Study mode is on: flashcards are built automatically from your Q&A. Answer normally; do not change style unless asked."
      : "";
  if (compactMode) {
    return [base.trim(), COMPACT_MODE_PROMPT, searchLine, studyLine]
      .filter(Boolean)
      .join("\n\n");
  }
  const depthLine = RESPONSE_DEPTH_PROMPTS[depth];
  const modeLine = "You are in the full chat view.";
  return [base.trim(), modeLine, depthLine, searchLine, studyLine]
    .filter(Boolean)
    .join("\n\n");
}
