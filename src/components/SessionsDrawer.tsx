import { useHesion } from "../lib/hesion";
import { IconClose, IconPlus } from "./Icons";

export function SessionsDrawer({ onClose }: { onClose: () => void }) {
  const { state } = useHesion();

  return (
    <>
      <div className="drawer-backdrop" onClick={onClose} />
      <aside className="drawer" aria-label="Chats">
        <div className="drawer-head">
          <h2>chats</h2>
          <div className="drawer-head-actions">
            <button
              type="button"
              className="icon-btn"
              title="New chat"
              onClick={() => {
                void window.hesion.createSession();
                onClose();
              }}
            >
              <IconPlus size={12} />
            </button>
            <button
              type="button"
              className="icon-btn"
              title="Close"
              onClick={onClose}
            >
              <IconClose size={12} />
            </button>
          </div>
        </div>
        <div className="session-list" role="list">
          {state.sessions.map((s) => (
            <button
              key={s.id}
              type="button"
              role="listitem"
              className={`session-item ${s.id === state.activeSessionId ? "active" : ""}`}
              title={s.title}
              onClick={() => {
                void window.hesion.setActiveSession(s.id);
                onClose();
              }}
              onDoubleClick={() => {
                const title = prompt("Rename chat", s.title);
                if (title) void window.hesion.renameSession(s.id, title);
              }}
            >
              {s.title}
            </button>
          ))}
        </div>
        <div className="drawer-foot">
          <button
            type="button"
            className="drawer-link"
            disabled={!state.activeSessionId}
            onClick={async () => {
              if (!state.activeSessionId) return;
              const md = await window.hesion.exportMarkdown(
                state.activeSessionId,
              );
              const blob = new Blob([md], { type: "text/markdown" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = "hesion-chat.md";
              a.click();
              URL.revokeObjectURL(url);
            }}
          >
            export
          </button>
          <button
            type="button"
            className="drawer-link danger"
            disabled={!state.activeSessionId}
            onClick={() => {
              if (state.activeSessionId && confirm("Delete this chat?")) {
                void window.hesion.deleteSession(state.activeSessionId);
              }
            }}
          >
            delete
          </button>
        </div>
      </aside>
    </>
  );
}
