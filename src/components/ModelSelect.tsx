import { useEffect, useId, useRef, useState } from "react";
import type { ModelInfo } from "@shared/types";

export function ModelSelect({
  models,
  value,
  onChange,
}: {
  models: ModelInfo[];
  value: string;
  onChange: (modelId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const selected = models.find((m) => m.id === value);
  const empty = models.length === 0;
  const label = empty
    ? "No models"
    : (selected?.label ?? "Select model");

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

  return (
    <div className={`model-menu ${open ? "open" : ""}`} ref={rootRef}>
      <button
        type="button"
        className="model-menu-trigger"
        title={empty ? "Add API keys in Settings" : "Model"}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="model-menu-label">{label}</span>
        <span className="model-menu-caret" aria-hidden />
      </button>

      {open && (
        <ul
          id={listId}
          className="model-menu-list"
          role="listbox"
          aria-label="Model"
        >
          {empty ? (
            <li className="model-menu-empty" role="presentation">
              Add API keys in Settings — adding more unlocks more models.
            </li>
          ) : (
            models.map((m) => {
              const active = m.id === value;
              return (
                <li key={m.id} role="presentation">
                  <button
                    type="button"
                    role="option"
                    aria-selected={active}
                    className={`model-menu-option ${active ? "active" : ""}`}
                    onClick={() => {
                      onChange(m.id);
                      setOpen(false);
                    }}
                  >
                    <span className="model-menu-option-label">{m.label}</span>
                    <span className="model-menu-option-meta">{m.provider}</span>
                  </button>
                </li>
              );
            })
          )}
        </ul>
      )}
    </div>
  );
}
