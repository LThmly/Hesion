import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type ClipboardEvent,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { useHesion } from "../lib/hesion";
import { useVoiceInput } from "../lib/voice";
import {
  IconAttach,
  IconClipboard,
  IconClose,
  IconMic,
  IconScreen,
  IconSend,
  IconStop,
} from "./Icons";
import { ModelSelect } from "./ModelSelect";
import {
  TaskModeSelect,
  type StudyPanelView,
} from "./TaskModeSelect";
import type { TaskMode } from "@shared/types";

const TEXT_EXTS = new Set([
  "txt",
  "md",
  "markdown",
  "json",
  "csv",
  "tsv",
  "xml",
  "html",
  "htm",
  "css",
  "js",
  "jsx",
  "ts",
  "tsx",
  "mjs",
  "cjs",
  "py",
  "rs",
  "go",
  "java",
  "c",
  "h",
  "cpp",
  "hpp",
  "sh",
  "bash",
  "zsh",
  "toml",
  "yaml",
  "yml",
  "ini",
  "log",
  "sql",
  "env",
]);

function isTextFile(file: File): boolean {
  if (file.type.startsWith("text/")) return true;
  if (file.type === "application/json" || file.type === "application/xml") {
    return true;
  }
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  return TEXT_EXTS.has(ext);
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error("read failed"));
    reader.readAsDataURL(file);
  });
}

function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error("read failed"));
    reader.readAsText(file);
  });
}

export function Composer({
  compact,
  studyView,
  onStudyView,
}: {
  compact?: boolean;
  studyView: StudyPanelView;
  onStudyView: (view: StudyPanelView) => void;
}) {
  const { state, models } = useHesion();
  const [text, setText] = useState("");
  const [pastedContent, setPastedContent] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const session = state.sessions.find((s) => s.id === state.activeSessionId);
  const model = models.find((m) => m.id === session?.model);
  const visionOk = model?.capabilities.includes("vision") ?? false;
  const att = state.pendingAttachment;

  const { recording, busy, toggle } = useVoiceInput((t) =>
    setText((prev) => (prev ? `${prev} ${t}` : t)),
  );

  useEffect(() => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${Math.min(el.scrollHeight, compact ? 88 : 160)}px`;
  }, [text, compact]);

  async function attachImageFile(
    file: File,
    source: "paste" | "file",
  ): Promise<void> {
    const result = await readFileAsDataUrl(file);
    const [meta, data] = result.split(",");
    const mime = meta.match(/data:(.*);base64/)?.[1] || file.type || "image/png";
    await window.hesion.attachImage(data, mime, source);
  }

  function setPastePill(content: string): void {
    const clipped =
      content.length > 50_000 ? `${content.slice(0, 50_000)}\n…` : content;
    setPastedContent(clipped);
  }

  async function handleFiles(files: FileList | File[]): Promise<void> {
    const list = Array.from(files);
    if (list.length === 0) return;
    setLocalError(null);

    try {
      for (const file of list) {
        if (file.type.startsWith("image/")) {
          if (!visionOk) {
            setLocalError("Current model has no vision — pick a vision model.");
            return;
          }
          await attachImageFile(file, "file");
          continue;
        }

        if (isTextFile(file)) {
          const body = await readFileAsText(file);
          const chunk = `── ${file.name} ──\n${body}`;
          setPastedContent((prev) =>
            prev ? `${prev}\n\n${chunk}` : chunk,
          );
          continue;
        }

        setLocalError(
          `Unsupported file type: ${file.name}. Use an image or a text file.`,
        );
        return;
      }
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : String(err));
    }
  }

  async function submit() {
    const value = text.trim();
    if (
      (!value && !att && !pastedContent && !state.screenContextEnabled) ||
      state.streaming
    ) {
      return;
    }
    setSending(true);
    setLocalError(null);
    try {
      const payload = pastedContent
        ? value
          ? `${value}\n\nPasted content:\n${pastedContent}`
          : `Pasted content:\n${pastedContent}`
        : value;
      await window.hesion.sendMessage(payload);
      setText("");
      setPastedContent(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setLocalError(message);
      console.error(err);
    } finally {
      setSending(false);
    }
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void submit();
    }
  }

  function onPaste(e: ClipboardEvent) {
    const items = e.clipboardData?.items;
    if (!items) return;

    for (const item of items) {
      if (item.type.startsWith("image/")) {
        e.preventDefault();
        const file = item.getAsFile();
        if (!file) continue;
        void attachImageFile(file, "paste").catch((err) => {
          setLocalError(err instanceof Error ? err.message : String(err));
        });
        return;
      }
    }

    const plain = e.clipboardData.getData("text/plain");
    if (!plain) return;

    // Short single-line pastes stay in the textarea; larger context becomes a pill
    const isContext =
      plain.length > 40 || plain.includes("\n") || plain.includes("\t");
    if (!isContext) return;

    e.preventDefault();
    setPastePill(plain);
  }

  function onFileChange(e: ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (files?.length) void handleFiles(files);
    e.target.value = "";
  }

  const canSend =
    !sending &&
    !state.streaming &&
    Boolean(text.trim() || att || pastedContent || state.screenContextEnabled);

  const attachmentLabel =
    att?.source === "screen"
      ? "Screenshot ready"
      : att?.source === "paste"
        ? "Image pasted"
        : "Image attached";

  return (
    <div className="composer">
      <form
        className="composer-card"
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          void submit();
        }}
      >
        <input
          ref={fileRef}
          type="file"
          className="file-input-hidden"
          accept="image/*,.txt,.md,.json,.csv,.ts,.tsx,.js,.jsx,.py,.rs,.go,.html,.css,.yml,.yaml,.toml,.log,.sh"
          multiple
          onChange={onFileChange}
        />

        {(att || pastedContent) && (
          <div className="composer-chips">
            {att && (
              <div className="context-pill" title={attachmentLabel}>
                {att.previewDataUrl && (
                  <img src={att.previewDataUrl} alt="" />
                )}
                <span>{attachmentLabel}</span>
                <button
                  type="button"
                  className="context-pill-x"
                  title="Remove"
                  onClick={() => void window.hesion.clearAttachment()}
                >
                  <IconClose size={12} />
                </button>
              </div>
            )}
            {pastedContent && (
              <div
                className="context-pill"
                title={
                  pastedContent.length > 280
                    ? `${pastedContent.slice(0, 280)}…`
                    : pastedContent
                }
              >
                <IconClipboard size={12} className="context-pill-icon" />
                <span>pasted content</span>
                <button
                  type="button"
                  className="context-pill-x"
                  title="Remove"
                  onClick={() => setPastedContent(null)}
                >
                  <IconClose size={12} />
                </button>
              </div>
            )}
          </div>
        )}

        {localError && (
          <div className="attach-note" style={{ color: "var(--danger)" }}>
            {localError}
          </div>
        )}
        {state.screenContextEnabled && !att && (
          <div className="composer-hint">
            screen on — will capture active monitor on send
          </div>
        )}

        <textarea
          ref={taRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
          placeholder={
            (state.config.taskMode ?? "default") === "study"
              ? "Ask to study — cards build as you go…"
              : state.config.composerPlaceholder ||
                "Plan, search, build anything…"
          }
          disabled={sending}
          rows={1}
        />

        <div className="composer-footer">
          {session && (
            <ModelSelect
              models={models}
              value={session.model}
              onChange={(modelId) =>
                void window.hesion.setSessionModel(session.id, modelId)
              }
            />
          )}

          <div className="composer-tools">
            <button
              type="button"
              className={`icon-btn ${state.screenContextEnabled ? "active" : ""}`}
              title={visionOk ? "Include screen" : "Model has no vision"}
              disabled={!visionOk}
              onClick={() =>
                void window.hesion.setScreenContext(!state.screenContextEnabled)
              }
            >
              <IconScreen />
            </button>

            {state.config.showMicrophone && (
              <button
                type="button"
                className={`icon-btn ${recording ? "recording" : ""}`}
                title="Voice input"
                disabled={busy}
                onClick={toggle}
              >
                <IconMic />
              </button>
            )}

            <button
              type="button"
              className="icon-btn"
              title="Attach image or file"
              onClick={() => fileRef.current?.click()}
            >
              <IconAttach />
            </button>
          </div>

          <div className="grow" />

          <div className="composer-tools">
            <TaskModeSelect
              value={state.config.taskMode ?? "default"}
              onChange={(mode: TaskMode) => {
                void window.hesion.updateConfig({ taskMode: mode });
                if (mode === "default") onStudyView("chat");
              }}
              studyView={studyView}
              onStudyView={onStudyView}
              cardCount={session?.flashcards?.length ?? 0}
              studying={state.studying}
              onStartQuiz={() => {
                void window.hesion.generateQuiz();
              }}
            />
          </div>

          {state.streaming ? (
            <button
              type="button"
              className="send-btn stop"
              title="Stop"
              onClick={() => void window.hesion.cancelStream()}
            >
              <IconStop size={12} />
            </button>
          ) : (
            <button
              type="submit"
              className="send-btn"
              title="Send"
              disabled={!canSend}
            >
              <IconSend size={13} />
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
