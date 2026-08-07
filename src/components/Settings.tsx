import { useEffect, useState } from "react";
import type { CaptureMode, HesionConfig } from "@shared/types";
import { useHesion } from "../lib/hesion";

export function SettingsModal({ onClose }: { onClose: () => void }) {
  const { state } = useHesion();
  const [draft, setDraft] = useState<HesionConfig>(state.config);

  useEffect(() => {
    setDraft(state.config);
  }, [state.config]);

  function setKey(
    provider: keyof HesionConfig["apiKeys"],
    value: string,
  ) {
    setDraft((d) => ({
      ...d,
      apiKeys: { ...d.apiKeys, [provider]: value },
    }));
  }

  async function save() {
    await window.hesion.updateConfig(draft);
    onClose();
  }

  return (
    <div className="settings-backdrop" onClick={onClose}>
      <div
        className="settings-panel"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
      >
        <h2>Settings</h2>

        <div className="field">
          <label>System prompt</label>
          <textarea
            rows={3}
            value={draft.systemPrompt}
            onChange={(e) =>
              setDraft((d) => ({ ...d, systemPrompt: e.target.value }))
            }
          />
        </div>

        <div className="field">
          <label>Chat box placeholder</label>
          <input
            value={draft.composerPlaceholder ?? ""}
            onChange={(e) =>
              setDraft((d) => ({
                ...d,
                composerPlaceholder: e.target.value,
              }))
            }
            placeholder="Plan, search, build anything…"
          />
        </div>

        <div className="field">
          <label>Screen capture mode</label>
          <select
            value={draft.captureMode}
            onChange={(e) =>
              setDraft((d) => ({
                ...d,
                captureMode: e.target.value as CaptureMode,
              }))
            }
          >
            <option value="output">Active monitor</option>
            <option value="window">Active window</option>
            <option value="region">Region</option>
          </select>
        </div>

        <div className="field-row">
          <div>
            <div className="label">Active window metadata</div>
            <div className="hint">Include class/title via hyprctl</div>
          </div>
          <button
            type="button"
            className={`toggle ${draft.includeActiveWindow ? "on" : ""}`}
            onClick={() =>
              setDraft((d) => ({
                ...d,
                includeActiveWindow: !d.includeActiveWindow,
              }))
            }
            aria-label="Toggle active window context"
          />
        </div>

        <div className="field-row">
          <div>
            <div className="label">Clipboard context</div>
            <div className="hint">Append wl-paste on send</div>
          </div>
          <button
            type="button"
            className={`toggle ${draft.includeClipboard ? "on" : ""}`}
            onClick={() =>
              setDraft((d) => ({
                ...d,
                includeClipboard: !d.includeClipboard,
              }))
            }
            aria-label="Toggle clipboard context"
          />
        </div>

        <div className="field-row">
          <div>
            <div className="label">Microphone button</div>
            <div className="hint">Show voice input in the composer</div>
          </div>
          <button
            type="button"
            className={`toggle ${draft.showMicrophone ? "on" : ""}`}
            onClick={() =>
              setDraft((d) => ({
                ...d,
                showMicrophone: !d.showMicrophone,
              }))
            }
            aria-label="Toggle microphone button"
          />
        </div>

        <div className="field-row">
          <div>
            <div className="label">Light mode</div>
            <div className="hint">Use a light color scheme</div>
          </div>
          <button
            type="button"
            className={`toggle ${draft.theme === "light" ? "on" : ""}`}
            onClick={() =>
              setDraft((d) => ({
                ...d,
                theme: d.theme === "light" ? "dark" : "light",
              }))
            }
            aria-label="Toggle light mode"
          />
        </div>

        <div className="field">
          <label>Compact mode hotkey</label>
          <input
            value={draft.compactHotkey}
            onChange={(e) =>
              setDraft((d) => ({ ...d, compactHotkey: e.target.value }))
            }
            placeholder="Alt+Shift+Space"
          />
        </div>

        <div className="field">
          <label>OpenAI API key</label>
          <input
            type="password"
            value={draft.apiKeys.openai || ""}
            onChange={(e) => setKey("openai", e.target.value)}
            placeholder="sk-…"
          />
        </div>
        <div className="field">
          <label>Anthropic API key</label>
          <input
            type="password"
            value={draft.apiKeys.anthropic || ""}
            onChange={(e) => setKey("anthropic", e.target.value)}
            placeholder="sk-ant-…"
          />
        </div>
        <div className="field">
          <label>OpenRouter API key</label>
          <input
            type="password"
            value={draft.apiKeys.openrouter || ""}
            onChange={(e) => setKey("openrouter", e.target.value)}
            placeholder="sk-or-…"
          />
        </div>
        <div className="field">
          <label>Gemini API key</label>
          <input
            type="password"
            value={draft.apiKeys.gemini || ""}
            onChange={(e) => setKey("gemini", e.target.value)}
            placeholder="AIza…"
          />
        </div>

        <div className="settings-actions">
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn primary"
            onClick={() => void save()}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
