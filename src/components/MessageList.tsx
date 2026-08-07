import { useEffect, useRef } from "react";
import type { ChatMessage } from "@shared/types";
import { useHesion } from "../lib/hesion";
import { LoadingDots } from "./LoadingDots";
import { IconUser } from "./Icons";
import { Markdown } from "./Markdown";
import emptyStarUrl from "../../assets/empty-star.svg";
import logoUrl from "../../assets/logo.png";
import logoDarkUrl from "../../assets/logo-dark.png";

function displayUserContent(content: string): string {
  return content
    .replace(/^Active window:.*?(?:\n\n|$)/, "")
    .replace(/^Clipboard:\n[\s\S]*?(?:\n\n(?=\S)|$)/, "")
    .replace(/^\(see attached screenshot\)\s*$/, "")
    .trim();
}

export function MessageList({ messages }: { messages: ChatMessage[] }) {
  const { state } = useHesion();
  const endRef = useRef<HTMLDivElement>(null);
  const light = state.config.theme === "light";
  const assistantMark = light ? logoDarkUrl : logoUrl;

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, state.streaming]);

  if (messages.length === 0) {
    return (
      <div className="messages">
        <div className="empty">
          <img
            className="empty-ascii"
            src={emptyStarUrl}
            alt=""
            aria-hidden="true"
            draggable={false}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="messages">
      {messages.map((m) => {
        const isStreamingAssistant =
          m.role === "assistant" && !m.content && state.streaming;
        const userVisible =
          m.role === "user" ? displayUserContent(m.content) : "";

        return (
          <div key={m.id} className={`message ${m.role}`}>
            {m.role === "assistant" && (
              <img
                className="message-mark"
                src={assistantMark}
                alt=""
                draggable={false}
                aria-hidden="true"
              />
            )}
            <div className="message-main">
              {isStreamingAssistant ? (
                <LoadingDots label="Thinking" />
              ) : m.role === "assistant" ? (
                m.content && (
                  <div className="message-body">
                    <Markdown>{m.content}</Markdown>
                  </div>
                )
              ) : (
                userVisible && (
                  <div className="message-body">
                    <div style={{ whiteSpace: "pre-wrap" }}>{userVisible}</div>
                  </div>
                )
              )}
            </div>
            {m.role === "user" && (
              <span className="message-mark message-mark-user" aria-hidden="true">
                <IconUser size={14} />
              </span>
            )}
          </div>
        );
      })}
      <div ref={endRef} />
    </div>
  );
}
