import { useEffect, useId, useRef, useState } from "react";
import type { TaskMode } from "@shared/types";
import { IconCards, IconQuiz, IconStudy } from "./Icons";

export type StudyPanelView = "chat" | "deck" | "quiz";

export function TaskModeSelect({
  value,
  onChange,
  studyView,
  onStudyView,
  cardCount,
  studying,
  onStartQuiz,
}: {
  value: TaskMode;
  onChange: (mode: TaskMode) => void;
  studyView: StudyPanelView;
  onStudyView: (view: StudyPanelView) => void;
  cardCount: number;
  studying: boolean;
  onStartQuiz: () => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const isStudy = value === "study";

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("mousedown", onPointerDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function ensureStudy() {
    if (!isStudy) onChange("study");
  }

  return (
    <div className={`study-menu ${open ? "open" : ""}`} ref={rootRef}>
      <button
        type="button"
        className={`icon-btn ${isStudy ? "active" : ""}`}
        title="Study"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => {
          if (!isStudy) {
            onChange("study");
            return;
          }
          setOpen((v) => !v);
        }}
      >
        <IconStudy size={14} />
      </button>

      {open && (
        <ul id={listId} className="study-menu-list" role="menu">
          <li role="none">
            <button
              type="button"
              role="menuitem"
              className={`study-menu-option ${studyView === "deck" ? "active" : ""}`}
              onClick={() => {
                ensureStudy();
                onStudyView(studyView === "deck" ? "chat" : "deck");
                setOpen(false);
              }}
            >
              <IconCards size={14} />
              <span>Flashcards{cardCount > 0 ? ` · ${cardCount}` : ""}</span>
            </button>
          </li>
          <li role="none">
            <button
              type="button"
              role="menuitem"
              className={`study-menu-option ${studyView === "quiz" ? "active" : ""} ${studying ? "is-busy" : ""}`}
              disabled={studying}
              onClick={() => {
                ensureStudy();
                if (studyView === "quiz") {
                  onStudyView("chat");
                  setOpen(false);
                  return;
                }
                onStudyView("quiz");
                onStartQuiz();
                setOpen(false);
              }}
            >
              <IconQuiz size={14} />
              <span>{studying ? "Building…" : "Quiz"}</span>
            </button>
          </li>
          {isStudy && (
            <li role="none">
              <button
                type="button"
                role="menuitem"
                className="study-menu-option"
                onClick={() => {
                  onStudyView("chat");
                  onChange("default");
                  setOpen(false);
                }}
              >
                <span>Leave study</span>
              </button>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
