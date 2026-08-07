import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { HesionProvider, useActiveSession, useHesion } from "./lib/hesion";
import { MessageList } from "./components/MessageList";
import { Composer } from "./components/Composer";
import { SessionsDrawer } from "./components/SessionsDrawer";
import { SettingsModal } from "./components/Settings";
import { LoadingDots } from "./components/LoadingDots";
import { Markdown } from "./components/Markdown";
import { StudyWorkspace } from "./components/StudyPanel";
import { type StudyPanelView } from "./components/TaskModeSelect";
import { splitCompactAnswer } from "./lib/compactAnswer";
import { useVoiceInput } from "./lib/voice";
import {
  IconChevronDown,
  IconChevronUp,
  IconCompact,
  IconExpand,
  IconMic,
  IconPlus,
  IconScreen,
  IconSend,
  IconSettings,
  IconStop,
} from "./components/Icons";
import logoUrl from "../assets/logo.png";
import logoDarkUrl from "../assets/logo-dark.png";

const COMPACT_CHROME_H = 56;

type CompactSendState = {
  canSend: boolean;
  sending: boolean;
  streaming: boolean;
};

function useTypewriter(target: string, messageId: string | undefined) {
  const [displayed, setDisplayed] = useState("");

  useEffect(() => {
    setDisplayed("");
  }, [messageId]);

  useEffect(() => {
    if (displayed === target) return;
    if (!target.startsWith(displayed)) {
      setDisplayed("");
      return;
    }
    const remaining = target.length - displayed.length;
    const step = Math.max(1, Math.ceil(remaining / 12));
    const id = window.setTimeout(() => {
      setDisplayed(target.slice(0, displayed.length + step));
    }, 16);
    return () => window.clearTimeout(id);
  }, [target, displayed]);

  return displayed;
}

const ChromeLogo = memo(function ChromeLogo({
  title,
  onClick,
  light,
}: {
  title: string;
  onClick: () => void;
  light?: boolean;
}) {
  return (
    <button
      type="button"
      className="icon-btn logo-btn chrome-logo"
      title={title}
      onClick={onClick}
    >
      <img
        className="btn-logo"
        src={light ? logoDarkUrl : logoUrl}
        alt=""
        draggable={false}
      />
    </button>
  );
});

function CompactChrome({
  bindSubmit,
  active,
  onSendState,
}: {
  bindSubmit: (fn: () => Promise<void>) => void;
  active: boolean;
  onSendState: (state: CompactSendState) => void;
}) {
  const { state } = useHesion();
  const session = useActiveSession();
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [answerExpanded, setAnswerExpanded] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const explainRef = useRef<HTMLDivElement>(null);
  const explainMeasureRef = useRef<HTMLDivElement>(null);
  /** Window height while only the short explain is open — lock for "Explain more". */
  const explainHeightRef = useRef<number | null>(null);

  const lastAssistant = [...(session?.messages ?? [])]
    .reverse()
    .find((m) => m.role === "assistant");
  const targetAnswer = lastAssistant?.content ?? "";
  const answer = useTypewriter(targetAnswer, lastAssistant?.id);
  const { answer: shortAnswer, explain } = splitCompactAnswer(answer);
  const fullSplit = splitCompactAnswer(targetAnswer);
  const hasExplain = Boolean(fullSplit.explain);
  const detail = lastAssistant?.detail ?? "";
  const elaborating = state.elaborating;
  const showToggle = Boolean(answer) && (hasExplain || answerExpanded);

  useEffect(() => {
    function onVoice(e: Event) {
      const t = (e as CustomEvent<string>).detail;
      if (!t) return;
      setText((prev) => (prev ? `${prev} ${t}` : t));
    }
    window.addEventListener("hesion:compact-voice", onVoice);
    return () => window.removeEventListener("hesion:compact-voice", onVoice);
  }, []);

  async function submit() {
    const value = text.trim();
    if (
      (!value && !state.pendingAttachment && !state.screenContextEnabled) ||
      state.streaming
    ) {
      return;
    }
    setSending(true);
    try {
      await window.hesion.sendMessage(value);
      setText("");
    } catch (err) {
      console.error(err);
    } finally {
      setSending(false);
    }
  }

  useEffect(() => {
    bindSubmit(submit);
  });

  useEffect(() => {
    onSendState({
      canSend:
        active &&
        !sending &&
        !state.streaming &&
        Boolean(
          text.trim() ||
            state.pendingAttachment ||
            state.screenContextEnabled,
        ),
      sending,
      streaming: state.streaming,
    });
  }, [
    active,
    sending,
    state.streaming,
    state.pendingAttachment,
    state.screenContextEnabled,
    text,
    onSendState,
  ]);

  // New answer → collapse expanded chrome
  useEffect(() => {
    setAnswerExpanded(false);
    setDetailOpen(false);
    explainHeightRef.current = null;
  }, [lastAssistant?.id]);

  useLayoutEffect(() => {
    if (!active) {
      document.documentElement.classList.remove("hesion-compact-tall");
      document.documentElement.style.removeProperty("--compact-chrome-h");
      return;
    }

    const applyHeight = async (height: number) => {
      document.documentElement.style.setProperty(
        "--compact-chrome-h",
        `${height}px`,
      );
      document.documentElement.classList.toggle(
        "hesion-compact-tall",
        height > COMPACT_CHROME_H,
      );
      await window.hesion.setCompactHeight(height);
    };

    // Do NOT resize on mere compact-enter — main's applyCompactMode owns that.
    if (!answerExpanded) {
      if (document.documentElement.classList.contains("hesion-compact-tall")) {
        void applyHeight(COMPACT_CHROME_H);
      }
      return;
    }

    const measureEl = explainMeasureRef.current;
    if (!measureEl) return;

    let raf = 0;
    const sync = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        // Explain-more grows to the normal (non-compact) window height;
        // extra detail content scrolls inside.
        if (detailOpen || elaborating) {
          void window.hesion.getExpandedHeight().then((expandedH) => {
            const next = Math.max(
              expandedH,
              explainHeightRef.current ?? COMPACT_CHROME_H,
            );
            void applyHeight(next);
          });
          return;
        }

        const next = Math.max(
          COMPACT_CHROME_H,
          COMPACT_CHROME_H + measureEl.scrollHeight + 10,
        );
        explainHeightRef.current = next;
        void applyHeight(next);
      });
    };

    sync();
    const ro = new ResizeObserver(sync);
    // Chevron-only: size to full short explain + button (no scroll).
    if (!detailOpen && !elaborating) {
      ro.observe(measureEl);
    }
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [answerExpanded, detailOpen, explain, detail, elaborating, answer, active]);

  useEffect(() => {
    if (!active) {
      setAnswerExpanded(false);
      setDetailOpen(false);
      explainHeightRef.current = null;
    }
  }, [active]);

  useEffect(() => {
    return () => {
      document.documentElement.classList.remove("hesion-compact-tall");
      document.documentElement.style.removeProperty("--compact-chrome-h");
    };
  }, []);

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      void submit();
    }
  }

  return (
    <div className="chrome-compact-root">
      <div
        className={`chrome-main ${active ? "is-active" : ""}`}
        aria-hidden={!active}
      >
        <div className="compact-toolbar">
          <input
            className="compact-input"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Ask…"
            disabled={sending || !active}
            tabIndex={active ? 0 : -1}
          />

          <div className="compact-answer-slot">
            <div
              className="compact-answer"
              title={
                hasExplain
                  ? fullSplit.answer || targetAnswer || undefined
                  : targetAnswer || undefined
              }
            >
              {answer ? (
                <Markdown compact>{shortAnswer || "—"}</Markdown>
              ) : state.streaming ? (
                <LoadingDots label="Thinking" />
              ) : (
                "—"
              )}
            </div>
            {showToggle && (
              <button
                type="button"
                className="icon-btn compact-answer-toggle"
                title={answerExpanded ? "Hide explanation" : "Show explanation"}
                tabIndex={active ? 0 : -1}
                onClick={() => setAnswerExpanded((v) => !v)}
              >
                {answerExpanded ? (
                  <IconChevronUp size={14} />
                ) : (
                  <IconChevronDown size={14} />
                )}
              </button>
            )}
          </div>
        </div>
      </div>

      {active && answerExpanded && (
        <div
          className={`compact-explain ${detailOpen || elaborating ? "is-scrollable" : ""}`}
          ref={explainRef}
        >
          <div className="compact-explain-inner" ref={explainMeasureRef}>
            <div className="compact-answer is-expanded">
              <Markdown compact>
                {explain || shortAnswer || answer}
              </Markdown>
            </div>
            {!detailOpen && !elaborating && (
              <button
                type="button"
                className="compact-more-btn"
                tabIndex={0}
                disabled={state.streaming}
                onClick={() => {
                  setDetailOpen(true);
                  if (!detail) {
                    void window.hesion.elaborate().catch((err) => {
                      console.error(err);
                    });
                  }
                }}
              >
                Explain more
              </button>
            )}
            {(detailOpen || elaborating) && (
              <div className="compact-detail">
                {detail ? (
                  <Markdown compact>{detail}</Markdown>
                ) : (
                  <LoadingDots label="Explaining" />
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/** Fixed-width action rail — mode toggle never moves; peers crossfade in place. */
function ChromeActions({
  compact,
  onOpenSettings,
  sendState,
}: {
  compact: boolean;
  onOpenSettings: () => void;
  sendState: CompactSendState;
}) {
  const { state, models } = useHesion();
  const session = useActiveSession();
  const model = models.find((m) => m.id === session?.model);
  const visionOk = model?.capabilities.includes("vision") ?? false;
  const { recording, busy, toggle } = useVoiceInput((t) => {
    window.dispatchEvent(
      new CustomEvent("hesion:compact-voice", { detail: t }),
    );
  });

  return (
    <div className="chrome-actions" aria-label="Window actions">
      <div className="chrome-action-cell is-compact-only">
        <button
          type="button"
          className={`icon-btn chrome-action ${compact ? "is-active" : ""} ${state.screenContextEnabled ? "active" : ""}`}
          title="Include screen"
          disabled={!visionOk || !compact}
          tabIndex={compact ? 0 : -1}
          onClick={() =>
            void window.hesion.setScreenContext(!state.screenContextEnabled)
          }
        >
          <IconScreen size={14} />
        </button>
      </div>

      <div className="chrome-action-cell">
        <button
          type="button"
          className={`icon-btn chrome-action ${!compact ? "is-active" : ""}`}
          title="New chat"
          tabIndex={!compact ? 0 : -1}
          onClick={() => void window.hesion.createSession()}
        >
          <IconPlus />
        </button>
        {state.config.showMicrophone ? (
          <button
            type="button"
            className={`icon-btn chrome-action ${compact ? "is-active" : ""} ${recording ? "recording" : ""}`}
            title="Voice"
            disabled={busy || !compact}
            tabIndex={compact ? 0 : -1}
            onClick={toggle}
          >
            <IconMic size={14} />
          </button>
        ) : null}
      </div>

      <div className="chrome-action-cell chrome-action-cell-mode">
        <button
          type="button"
          className="icon-btn chrome-mode-btn"
          title={compact ? "Expand" : "Compact mode"}
          onClick={() => void window.hesion.setCompactMode(!compact)}
        >
          <span
            className={`chrome-mode-icon ${!compact ? "is-active" : ""}`}
            aria-hidden={!compact ? undefined : true}
          >
            <IconCompact />
          </span>
          <span
            className={`chrome-mode-icon ${compact ? "is-active" : ""}`}
            aria-hidden={compact ? undefined : true}
          >
            <IconExpand />
          </span>
        </button>
      </div>

      <div className="chrome-action-cell is-expanded-only">
        <button
          type="button"
          className={`icon-btn chrome-action ${!compact ? "is-active" : ""}`}
          title="Settings"
          tabIndex={!compact ? 0 : -1}
          onClick={onOpenSettings}
        >
          <IconSettings />
        </button>
      </div>

      <div className="chrome-action-cell is-compact-only">
        {sendState.streaming ? (
          <button
            type="button"
            className={`send-btn stop chrome-action ${compact ? "is-active" : ""}`}
            title="Stop"
            tabIndex={compact ? 0 : -1}
            onClick={() => void window.hesion.cancelStream()}
          >
            <IconStop size={11} />
          </button>
        ) : (
          <button
            type="submit"
            className={`send-btn chrome-action ${compact ? "is-active" : ""}`}
            title="Send"
            tabIndex={compact ? 0 : -1}
            disabled={!compact || !sendState.canSend || sendState.sending}
          >
            <IconSend size={13} />
          </button>
        )}
      </div>
    </div>
  );
}

function MainApp() {
  const { state, ready } = useHesion();
  const session = useActiveSession();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [studyView, setStudyView] = useState<StudyPanelView>("chat");
  const [sendState, setSendState] = useState<CompactSendState>({
    canSend: false,
    sending: false,
    streaming: false,
  });
  const compactSubmit = useRef<() => Promise<void>>(async () => {});
  const onSendState = useCallback((next: CompactSendState) => {
    setSendState(next);
  }, []);
  const compact = state.compactMode;
  const isStudy = (state.config.taskMode ?? "default") === "study";

  useEffect(() => {
    if (!isStudy) setStudyView("chat");
  }, [isStudy]);

  const onLogoClick = useCallback(() => {
    if (state.compactMode) void window.hesion.createSession();
    else setDrawerOpen(true);
  }, [state.compactMode]);

  useLayoutEffect(() => {
    document.documentElement.classList.toggle("hesion-compact", compact);
    if (compact) {
      document.documentElement.classList.remove(
        "hesion-leaving-compact",
        "hesion-revealing",
      );
    }
  }, [compact]);

  useLayoutEffect(() => {
    const light = state.config.theme === "light";
    document.documentElement.classList.toggle("theme-light", light);
  }, [state.config.theme]);

  if (!ready) {
    return <div className="app" aria-busy="true" />;
  }

  return (
    <div className={`app ${compact ? "is-compact" : ""}`}>
      <form
        className="chrome"
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          if (compact) void compactSubmit.current();
        }}
      >
        <ChromeLogo
          title={compact ? "New chat" : "Chats"}
          onClick={onLogoClick}
          light={state.config.theme === "light"}
        />
        <CompactChrome
          active={compact}
          bindSubmit={(fn) => {
            compactSubmit.current = fn;
          }}
          onSendState={onSendState}
        />
        <ChromeActions
          compact={compact}
          onOpenSettings={() => setSettingsOpen(true)}
          sendState={sendState}
        />
      </form>

      <div
        className={`app-body ${compact ? "is-hidden" : ""} ${isStudy ? "is-study" : ""}`}
        aria-hidden={compact}
      >
        {isStudy ? (
          <StudyWorkspace
            messages={session?.messages ?? []}
            view={studyView}
            onViewChange={setStudyView}
          />
        ) : (
          <MessageList messages={session?.messages ?? []} />
        )}
        <Composer studyView={studyView} onStudyView={setStudyView} />
      </div>

      {drawerOpen && !compact && (
        <SessionsDrawer onClose={() => setDrawerOpen(false)} />
      )}
      {settingsOpen && !compact && (
        <SettingsModal onClose={() => setSettingsOpen(false)} />
      )}
    </div>
  );
}

export default function App() {
  return (
    <HesionProvider>
      <MainApp />
    </HesionProvider>
  );
}
