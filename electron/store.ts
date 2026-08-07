import { randomUUID } from "node:crypto";
import {
  COMPACT_ELABORATE_PROMPT,
  DEFAULT_CONFIG,
  EMPTY_USAGE_STATE,
  STUDY_HARVEST_PROMPT,
  STUDY_HARVEST_PASSIVE_PROMPT,
  STUDY_QUIZ_PROMPT,
  emptyUsageTotals,
  systemPromptFor,
  type AppState,
  type ChatMessage,
  type ContentPart,
  type Flashcard,
  type HesionConfig,
  type PendingAttachment,
  type Quiz,
  type QuizQuestion,
  type Session,
  type TokenUsage,
  type UsagePurpose,
  type UsageState,
} from "../shared/types";
import {
  loadConfig,
  loadSessions,
  loadUsage,
  saveConfig,
  saveSessions,
  saveUsage,
} from "./config";
import {
  captureScreen,
  deleteCapture,
  getActiveWindowMeta,
  getClipboardText,
} from "./capture";
import { streamChat } from "./providers";
import { parseModelId } from "./providers/types";

type Listener = (state: AppState) => void;

function normalizeFront(front: string): string {
  return front.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Reject equation / formula cards — harvest prompts ask for concepts only. */
function looksLikeEquationCard(front: string, back: string): boolean {
  const text = `${front}\n${back}`;
  if (/\$/.test(text)) return true;
  if (/\\[a-zA-Z]+/.test(text)) return true; // TeX commands
  if (/[=≈≠≤≥∝→←]/.test(text) && /[a-zA-Z]\s*[=≈≠≤≥]/.test(text)) return true;
  if (/\b(sin|cos|tan|log|ln|sqrt|integral|derivative)\s*\(/i.test(text)) {
    return true;
  }
  if (/\d+\s*[+\-*/^]\s*\d+/.test(text)) return true;
  if (/[_^]\{/.test(text)) return true;
  return false;
}

function extractJsonObject(raw: string): unknown {
  let text = raw.trim();
  const fence = text.match(/^```(?:json)?\s*([\s\S]*?)```$/i);
  if (fence) text = fence[1]!.trim();
  const start = text.search(/[{[]/);
  if (start === -1) throw new Error("No JSON in model response");
  text = text.slice(start);
  // Prefer object/array from first brace to last matching close
  const lastBrace = Math.max(text.lastIndexOf("}"), text.lastIndexOf("]"));
  if (lastBrace > 0) text = text.slice(0, lastBrace + 1);
  return JSON.parse(text) as unknown;
}

function messageStudyLine(m: ChatMessage): string {
  const partsNote = (m.parts || []).some((p) => p.type === "image")
    ? " [image/screenshot attached]"
    : "";
  const body = (m.content || "").trim() || "(empty)";
  return `${m.role}: ${body}${partsNote}`;
}

function buildStudyContext(session: Session, includeDeck: boolean): string {
  const recent = session.messages.slice(-40);
  const lines = recent.map(messageStudyLine);
  if (includeDeck && session.flashcards?.length) {
    lines.push("", "Existing flashcards:");
    for (const c of session.flashcards) {
      lines.push(`- Front: ${c.front}`);
      lines.push(`  Back: ${c.back}`);
    }
  }
  return lines.join("\n");
}

async function collectCompletion(params: {
  modelId: string;
  systemPrompt: string;
  messages: ChatMessage[];
  apiKeys: AppState["config"]["apiKeys"];
  signal?: AbortSignal;
  onUsage?: (usage: TokenUsage) => void;
}): Promise<string> {
  let text = "";
  await streamChat({
    modelId: params.modelId,
    systemPrompt: params.systemPrompt,
    messages: params.messages,
    apiKeys: params.apiKeys,
    signal: params.signal,
    onChunk: (chunk) => {
      if (chunk.type === "delta" && chunk.text) text += chunk.text;
      else if (chunk.type === "done" && chunk.usage) {
        params.onUsage?.(chunk.usage);
      } else if (chunk.type === "error") {
        throw new Error(chunk.error || "Model error");
      }
    },
  });
  return text;
}

export class Store {
  private sessions: Session[] = [];
  private activeSessionId: string | null = null;
  private config: HesionConfig = { ...DEFAULT_CONFIG };
  private screenContextEnabled = false;
  private pendingAttachment: PendingAttachment | null = null;
  private pendingCapturePath: string | null = null;
  private compactMode = false;
  private streaming = false;
  private elaborating = false;
  private studying = false;
  private activeQuiz: Quiz | null = null;
  private studyError: string | null = null;
  private usage: UsageState = {
    lifetime: emptyUsageTotals(),
    byProvider: {},
    recent: [],
  };
  private abort: AbortController | null = null;
  private listeners = new Set<Listener>();

  init(): void {
    this.config = loadConfig();
    this.usage = loadUsage();
    const legacy = this.config as HesionConfig & {
      overlayHotkey?: string;
      compactHotkey?: string;
    };
    if (!legacy.compactHotkey && legacy.overlayHotkey) {
      this.config = { ...this.config, compactHotkey: legacy.overlayHotkey };
      this.persistConfig();
    }
    this.sessions = loadSessions();
    if (this.sessions.length === 0) {
      const session = this.createSessionInternal();
      this.sessions = [session];
      this.activeSessionId = session.id;
      this.persistSessions();
    } else {
      this.activeSessionId = this.sessions[0].id;
    }
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    fn(this.getState());
    return () => this.listeners.delete(fn);
  }

  getState(): AppState {
    return {
      sessions: this.sessions,
      activeSessionId: this.activeSessionId,
      config: this.config,
      screenContextEnabled: this.screenContextEnabled,
      pendingAttachment: this.pendingAttachment
        ? {
            ...this.pendingAttachment,
            // Don't push huge base64 twice — preview is enough for UI
            data: "",
          }
        : null,
      compactMode: this.compactMode,
      streaming: this.streaming,
      elaborating: this.elaborating,
      studying: this.studying,
      activeQuiz: this.activeQuiz,
      studyError: this.studyError,
      usage: this.usage,
    };
  }

  /** Full attachment including base64 for send path */
  getPendingAttachmentFull(): PendingAttachment | null {
    return this.pendingAttachment;
  }

  private emit(): void {
    const state = this.getState();
    for (const fn of this.listeners) fn(state);
  }

  private persistSessions(): void {
    saveSessions(this.sessions);
  }

  private persistConfig(): void {
    saveConfig(this.config);
  }

  private persistUsage(): void {
    saveUsage(this.usage);
  }

  private recordUsage(
    modelId: string,
    purpose: UsagePurpose,
    usage?: TokenUsage,
  ): void {
    if (!usage) return;
    const inputTokens = usage.inputTokens || 0;
    const outputTokens = usage.outputTokens || 0;
    const totalTokens =
      usage.totalTokens || inputTokens + outputTokens;
    if (!inputTokens && !outputTokens && !totalTokens) return;

    const { provider } = parseModelId(modelId);
    const add = (t: { inputTokens: number; outputTokens: number; totalTokens: number; requests: number }) => ({
      inputTokens: t.inputTokens + inputTokens,
      outputTokens: t.outputTokens + outputTokens,
      totalTokens: t.totalTokens + totalTokens,
      requests: t.requests + 1,
    });

    const providerTotals = this.usage.byProvider[provider] ?? emptyUsageTotals();
    this.usage = {
      lifetime: add(this.usage.lifetime),
      byProvider: {
        ...this.usage.byProvider,
        [provider]: add(providerTotals),
      },
      recent: [
        {
          id: randomUUID(),
          at: Date.now(),
          model: modelId,
          provider,
          purpose,
          inputTokens,
          outputTokens,
          totalTokens,
        },
        ...this.usage.recent,
      ].slice(0, 100),
    };
    this.persistUsage();
  }

  clearUsage(): void {
    this.usage = {
      lifetime: { ...EMPTY_USAGE_STATE.lifetime },
      byProvider: {},
      recent: [],
    };
    this.persistUsage();
    this.emit();
  }

  private createSessionInternal(model?: string): Session {
    const now = Date.now();
    return {
      id: randomUUID(),
      title: "New chat",
      model: model || this.config.defaultModel,
      messages: [],
      createdAt: now,
      updatedAt: now,
    };
  }

  createSession(): Session {
    const session = this.createSessionInternal();
    this.sessions = [session, ...this.sessions];
    this.activeSessionId = session.id;
    this.persistSessions();
    this.emit();
    return session;
  }

  deleteSession(id: string): void {
    this.sessions = this.sessions.filter((s) => s.id !== id);
    if (this.activeSessionId === id) {
      this.activeSessionId = this.sessions[0]?.id ?? null;
      if (!this.activeSessionId) {
        const s = this.createSessionInternal();
        this.sessions = [s];
        this.activeSessionId = s.id;
      }
    }
    this.persistSessions();
    this.emit();
  }

  setActiveSession(id: string): void {
    if (!this.sessions.find((s) => s.id === id)) return;
    this.activeSessionId = id;
    this.emit();
  }

  renameSession(id: string, title: string): void {
    this.sessions = this.sessions.map((s) =>
      s.id === id ? { ...s, title, updatedAt: Date.now() } : s,
    );
    this.persistSessions();
    this.emit();
  }

  setSessionModel(id: string, model: string): void {
    this.sessions = this.sessions.map((s) =>
      s.id === id ? { ...s, model, updatedAt: Date.now() } : s,
    );
    this.config = { ...this.config, defaultModel: model };
    this.persistSessions();
    this.persistConfig();
    this.emit();
  }

  updateConfig(partial: Partial<HesionConfig>): void {
    this.config = {
      ...this.config,
      ...partial,
      apiKeys: {
        ...this.config.apiKeys,
        ...(partial.apiKeys || {}),
      },
    };
    this.persistConfig();
    this.emit();
  }

  setScreenContextEnabled(enabled: boolean): void {
    this.screenContextEnabled = enabled;
    this.emit();
  }

  setCompactMode(enabled: boolean): void {
    this.compactMode = enabled;
    this.emit();
  }

  clearAttachment(): void {
    if (this.pendingCapturePath) {
      void deleteCapture(this.pendingCapturePath);
      this.pendingCapturePath = null;
    }
    this.pendingAttachment = null;
    this.emit();
  }

  setAttachmentFromData(
    data: string,
    mimeType: string,
    source: PendingAttachment["source"],
  ): void {
    this.pendingAttachment = {
      data,
      mimeType,
      previewDataUrl: `data:${mimeType};base64,${data}`,
      source,
      capturedAt: Date.now(),
    };
    this.emit();
  }

  async captureForContext(): Promise<void> {
    const result = await captureScreen(this.config.captureMode);
    if (this.pendingCapturePath) {
      void deleteCapture(this.pendingCapturePath);
    }
    this.pendingCapturePath = result.filePath;
    this.pendingAttachment = {
      data: result.data,
      mimeType: result.mimeType,
      previewDataUrl: result.previewDataUrl,
      source: "screen",
      capturedAt: Date.now(),
    };
    this.emit();
  }

  async cancelStream(): Promise<void> {
    this.abort?.abort();
    this.abort = null;
    this.streaming = false;
    this.elaborating = false;
    this.studying = false;
    this.emit();
  }

  async sendMessage(text: string, opts?: { forceScreen?: boolean }): Promise<void> {
    const session = this.sessions.find((s) => s.id === this.activeSessionId);
    if (!session) throw new Error("No active session");
    if (this.streaming || this.elaborating || this.studying) {
      throw new Error("Already streaming");
    }

    let userText = text.trim();
    if (
      !userText &&
      !this.pendingAttachment &&
      !opts?.forceScreen &&
      !this.screenContextEnabled
    ) {
      throw new Error("Empty message");
    }

    const extras: string[] = [];
    if (this.config.includeActiveWindow) {
      const meta = await getActiveWindowMeta();
      if (meta) extras.push(meta);
    }
    if (this.config.includeClipboard) {
      const clip = await getClipboardText();
      if (clip) extras.push(`Clipboard:\n${clip}`);
    }

    const includeScreen =
      opts?.forceScreen ||
      this.screenContextEnabled ||
      this.pendingAttachment?.source === "screen";

    if (includeScreen && !this.pendingAttachment) {
      try {
        await this.captureForContext();
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        // Surface capture failure in the chat instead of failing silently
        const errId = randomUUID();
        this.sessions = this.sessions.map((s) =>
          s.id === session.id
            ? {
                ...s,
                messages: [
                  ...s.messages,
                  {
                    id: randomUUID(),
                    role: "user",
                    content: userText || "(screen capture)",
                    createdAt: Date.now(),
                  },
                  {
                    id: errId,
                    role: "assistant",
                    content: `Error: could not capture screen.\n${message}`,
                    createdAt: Date.now(),
                    model: session.model,
                  },
                ],
                updatedAt: Date.now(),
              }
            : s,
        );
        this.persistSessions();
        this.emit();
        return;
      }
    }

    const parts: ContentPart[] = [];
    const attachment = this.pendingAttachment;
    if (attachment) {
      parts.push({
        type: "image",
        data: attachment.data,
        mimeType: attachment.mimeType,
      });
    }

    const apiText = userText || "(see attached screenshot)";
    const composed =
      extras.length > 0 ? `${extras.join("\n\n")}\n\n${apiText}` : apiText;

    parts.unshift({ type: "text", text: composed });

    const userMsg: ChatMessage = {
      id: randomUUID(),
      role: "user",
      // Keep chrome (active window / clipboard) out of the visible transcript.
      content: userText,
      parts,
      createdAt: Date.now(),
    };

    const assistantId = randomUUID();
    const assistantMsg: ChatMessage = {
      id: assistantId,
      role: "assistant",
      content: "",
      createdAt: Date.now(),
      model: session.model,
    };

    const title =
      session.messages.length === 0
        ? (userText || "Screen chat").slice(0, 48)
        : session.title;

    this.sessions = this.sessions.map((s) =>
      s.id === session.id
        ? {
            ...s,
            title,
            messages: [...s.messages, userMsg, assistantMsg],
            updatedAt: Date.now(),
          }
        : s,
    );

    // Clear attachment after attaching to message
    this.clearAttachment();
    this.streaming = true;
    this.abort = new AbortController();
    this.emit();

    const current = this.sessions.find((s) => s.id === session.id)!;
    const history = current.messages.filter((m) => m.id !== assistantId);

    let aborted = false;
    let replyOk = false;

    try {
      await streamChat({
        modelId: session.model,
        systemPrompt: systemPromptFor(
          this.config.systemPrompt,
          this.compactMode
            ? this.config.responseDepthCompact
            : this.config.responseDepthExpanded,
          this.compactMode,
          this.config.taskMode ?? "default",
        ),
        messages: history,
        apiKeys: this.config.apiKeys,
        signal: this.abort.signal,
        onChunk: (chunk) => {
          if (chunk.type === "delta" && chunk.text) {
            this.sessions = this.sessions.map((s) => {
              if (s.id !== session.id) return s;
              return {
                ...s,
                messages: s.messages.map((m) =>
                  m.id === assistantId
                    ? { ...m, content: m.content + chunk.text! }
                    : m,
                ),
                updatedAt: Date.now(),
              };
            });
            this.emit();
          } else if (chunk.type === "done") {
            this.recordUsage(session.model, "chat", chunk.usage);
          } else if (chunk.type === "error") {
            this.sessions = this.sessions.map((s) => {
              if (s.id !== session.id) return s;
              return {
                ...s,
                messages: s.messages.map((m) =>
                  m.id === assistantId
                    ? {
                        ...m,
                        content:
                          m.content ||
                          `Error: ${chunk.error || "unknown error"}`,
                      }
                    : m,
                ),
              };
            });
            this.emit();
          }
        },
      });
      const after = this.sessions.find((s) => s.id === session.id);
      const assistant = after?.messages.find((m) => m.id === assistantId);
      const content = (assistant?.content || "").trim();
      replyOk =
        content.length > 0 && !content.startsWith("Error:");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes("abort")) {
        aborted = true;
      } else {
        this.sessions = this.sessions.map((s) => {
          if (s.id !== session.id) return s;
          return {
            ...s,
            messages: s.messages.map((m) =>
              m.id === assistantId
                ? { ...m, content: m.content || `Error: ${message}` }
                : m,
            ),
          };
        });
      }
    } finally {
      this.streaming = false;
      this.abort = null;
      this.persistSessions();
      this.emit();
    }

    if (
      !aborted &&
      replyOk &&
      (this.config.taskMode ?? "default") === "study"
    ) {
      await this.harvestFlashcards({
        passive: true,
        sourceMessageId: assistantId,
      });
    }
  }

  /** Deeper explanation for the last assistant reply (compact "Explain more"). */
  async elaborate(): Promise<void> {
    const session = this.sessions.find((s) => s.id === this.activeSessionId);
    if (!session) throw new Error("No active session");
    if (this.streaming || this.elaborating || this.studying) {
      throw new Error("Already streaming");
    }

    const lastAssistant = [...session.messages]
      .reverse()
      .find((m) => m.role === "assistant");
    if (!lastAssistant?.content.trim()) {
      throw new Error("Nothing to elaborate on");
    }

    const targetId = lastAssistant.id;
    this.sessions = this.sessions.map((s) =>
      s.id === session.id
        ? {
            ...s,
            messages: s.messages.map((m) =>
              m.id === targetId ? { ...m, detail: "" } : m,
            ),
            updatedAt: Date.now(),
          }
        : s,
    );

    this.elaborating = true;
    this.abort = new AbortController();
    this.emit();

    const history: ChatMessage[] = [
      ...session.messages,
      {
        id: randomUUID(),
        role: "user",
        content:
          "Please go deeper on your previous answer as requested.",
        createdAt: Date.now(),
      },
    ];

    const searchLine =
      "You have live web search. Use it when needed for current or uncertain facts.";
    const systemPrompt = [
      this.config.systemPrompt.trim(),
      COMPACT_ELABORATE_PROMPT,
      searchLine,
    ]
      .filter(Boolean)
      .join("\n\n");

    try {
      await streamChat({
        modelId: session.model,
        systemPrompt,
        messages: history,
        apiKeys: this.config.apiKeys,
        signal: this.abort.signal,
        onChunk: (chunk) => {
          if (chunk.type === "delta" && chunk.text) {
            this.sessions = this.sessions.map((s) => {
              if (s.id !== session.id) return s;
              return {
                ...s,
                messages: s.messages.map((m) =>
                  m.id === targetId
                    ? { ...m, detail: (m.detail ?? "") + chunk.text! }
                    : m,
                ),
                updatedAt: Date.now(),
              };
            });
            this.emit();
          } else if (chunk.type === "done") {
            this.recordUsage(session.model, "elaborate", chunk.usage);
          } else if (chunk.type === "error") {
            this.sessions = this.sessions.map((s) => {
              if (s.id !== session.id) return s;
              return {
                ...s,
                messages: s.messages.map((m) =>
                  m.id === targetId
                    ? {
                        ...m,
                        detail:
                          m.detail ||
                          `Error: ${chunk.error || "unknown error"}`,
                      }
                    : m,
                ),
              };
            });
            this.emit();
          }
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (!message.includes("abort")) {
        this.sessions = this.sessions.map((s) => {
          if (s.id !== session.id) return s;
          return {
            ...s,
            messages: s.messages.map((m) =>
              m.id === targetId
                ? { ...m, detail: m.detail || `Error: ${message}` }
                : m,
            ),
          };
        });
      }
    } finally {
      this.elaborating = false;
      this.abort = null;
      this.persistSessions();
      this.emit();
    }
  }

  deleteFlashcard(cardId: string): void {
    const sessionId = this.activeSessionId;
    if (!sessionId) return;
    this.sessions = this.sessions.map((s) => {
      if (s.id !== sessionId) return s;
      return {
        ...s,
        flashcards: (s.flashcards || []).filter((c) => c.id !== cardId),
        updatedAt: Date.now(),
      };
    });
    this.persistSessions();
    this.emit();
  }

  clearActiveQuiz(): void {
    this.activeQuiz = null;
    this.studyError = null;
    this.emit();
  }

  async harvestFlashcards(opts?: {
    passive?: boolean;
    sourceMessageId?: string;
  }): Promise<void> {
    const passive = Boolean(opts?.passive);
    const session = this.sessions.find((s) => s.id === this.activeSessionId);
    if (!session) throw new Error("No active session");
    if (this.streaming || this.elaborating || this.studying) {
      if (passive) return;
      throw new Error("Already streaming");
    }
    if (session.messages.length === 0) {
      if (!passive) {
        this.studyError = "Chat is empty — ask something first.";
        this.emit();
      }
      return;
    }

    this.studying = true;
    if (!passive) this.studyError = null;
    this.abort = new AbortController();
    this.emit();

    const context = buildStudyContext(session, true);
    const prompt = passive
      ? STUDY_HARVEST_PASSIVE_PROMPT
      : STUDY_HARVEST_PROMPT;
    const userContent = passive
      ? `Add new flashcards from the latest exchange. Existing cards are listed so you can avoid duplicates.\n\n${context}`
      : `Extract flashcards from this conversation:\n\n${context}`;
    const history: ChatMessage[] = [
      {
        id: randomUUID(),
        role: "user",
        content: userContent,
        createdAt: Date.now(),
      },
    ];

    try {
      const raw = await collectCompletion({
        modelId: session.model,
        systemPrompt: prompt,
        messages: history,
        apiKeys: this.config.apiKeys,
        signal: this.abort.signal,
        onUsage: (usage) => this.recordUsage(session.model, "harvest", usage),
      });
      const parsed = extractJsonObject(raw) as {
        cards?: { front?: unknown; back?: unknown }[];
      };
      const incoming = Array.isArray(parsed.cards) ? parsed.cards : [];
      const now = Date.now();
      const existing = session.flashcards || [];
      const seen = new Set(existing.map((c) => normalizeFront(c.front)));
      const merged: Flashcard[] = [...existing];
      for (const item of incoming) {
        const front = typeof item.front === "string" ? item.front.trim() : "";
        const back = typeof item.back === "string" ? item.back.trim() : "";
        if (!front || !back) continue;
        if (looksLikeEquationCard(front, back)) continue;
        const key = normalizeFront(front);
        if (seen.has(key)) continue;
        seen.add(key);
        merged.push({
          id: randomUUID(),
          front,
          back,
          sourceMessageId: opts?.sourceMessageId,
          createdAt: now,
        });
      }
      if (!passive && merged.length === existing.length) {
        this.studyError =
          incoming.length === 0
            ? "Could not extract flashcards from the chat."
            : "No new cards (duplicates skipped).";
      }
      this.sessions = this.sessions.map((s) =>
        s.id === session.id
          ? { ...s, flashcards: merged, updatedAt: Date.now() }
          : s,
      );
      this.persistSessions();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (!message.includes("abort") && !passive) {
        this.studyError = message.includes("JSON")
          ? "Failed to parse flashcards from the model."
          : message;
      }
    } finally {
      this.studying = false;
      this.abort = null;
      this.emit();
    }
  }

  async generateQuiz(): Promise<void> {
    const session = this.sessions.find((s) => s.id === this.activeSessionId);
    if (!session) throw new Error("No active session");
    if (this.streaming || this.elaborating || this.studying) {
      throw new Error("Already streaming");
    }
    if (session.messages.length === 0 && !(session.flashcards?.length)) {
      this.studyError = "Need chat or flashcards to quiz from.";
      this.emit();
      return;
    }

    this.studying = true;
    this.studyError = null;
    this.activeQuiz = null;
    this.abort = new AbortController();
    this.emit();

    const context = buildStudyContext(session, true);
    const history: ChatMessage[] = [
      {
        id: randomUUID(),
        role: "user",
        content: `Create a quiz from this study material:\n\n${context}`,
        createdAt: Date.now(),
      },
    ];

    try {
      const raw = await collectCompletion({
        modelId: session.model,
        systemPrompt: STUDY_QUIZ_PROMPT,
        messages: history,
        apiKeys: this.config.apiKeys,
        signal: this.abort.signal,
        onUsage: (usage) => this.recordUsage(session.model, "quiz", usage),
      });
      const parsed = extractJsonObject(raw) as {
        questions?: {
          prompt?: unknown;
          choices?: unknown;
          correctIndex?: unknown;
          explanation?: unknown;
        }[];
      };
      const list = Array.isArray(parsed.questions) ? parsed.questions : [];
      const questions: QuizQuestion[] = [];
      for (const q of list) {
        const prompt = typeof q.prompt === "string" ? q.prompt.trim() : "";
        const choices = Array.isArray(q.choices)
          ? q.choices
              .filter((c): c is string => typeof c === "string")
              .map((c) => c.trim())
              .filter(Boolean)
          : [];
        const correctIndex =
          typeof q.correctIndex === "number" ? q.correctIndex : -1;
        if (!prompt || choices.length !== 4) continue;
        if (correctIndex < 0 || correctIndex > 3) continue;
        questions.push({
          id: randomUUID(),
          prompt,
          choices: choices.slice(0, 4),
          correctIndex,
          explanation:
            typeof q.explanation === "string"
              ? q.explanation.trim()
              : undefined,
        });
      }
      if (questions.length === 0) {
        this.studyError = "Could not build a quiz from this material.";
      } else {
        this.activeQuiz = {
          id: randomUUID(),
          questions,
          createdAt: Date.now(),
        };
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (!message.includes("abort")) {
        this.studyError = message.includes("JSON")
          ? "Failed to parse quiz from the model."
          : message;
      }
    } finally {
      this.studying = false;
      this.abort = null;
      this.emit();
    }
  }

  exportSessionMarkdown(id: string): string {
    const session = this.sessions.find((s) => s.id === id);
    if (!session) return "";
    const lines = [`# ${session.title}`, "", `Model: ${session.model}`, ""];
    for (const m of session.messages) {
      lines.push(`## ${m.role}`, "", m.content, "");
    }
    return lines.join("\n");
  }
}

export const store = new Store();
