/// <reference types="vite/client" />

import type { AppState, HesionConfig, ModelInfo } from "@shared/types";

export {};

declare global {
  interface Window {
    hesion: {
      getState: () => Promise<AppState>;
      getModels: () => Promise<ModelInfo[]>;
      updateConfig: (partial: Partial<HesionConfig>) => Promise<AppState>;
      createSession: () => Promise<AppState>;
      deleteSession: (id: string) => Promise<AppState>;
      setActiveSession: (id: string) => Promise<AppState>;
      renameSession: (id: string, title: string) => Promise<AppState>;
      setSessionModel: (id: string, model: string) => Promise<AppState>;
      setScreenContext: (enabled: boolean) => Promise<AppState>;
      captureScreen: () => Promise<AppState>;
      clearAttachment: () => Promise<AppState>;
      attachImage: (
        data: string,
        mimeType: string,
        source?: "screen" | "paste" | "file",
      ) => Promise<AppState>;
      sendMessage: (text: string) => Promise<AppState>;
      elaborate: () => Promise<AppState>;
      harvestFlashcards: () => Promise<AppState>;
      generateQuiz: () => Promise<AppState>;
      deleteFlashcard: (cardId: string) => Promise<AppState>;
      clearActiveQuiz: () => Promise<AppState>;
      clearUsage: () => Promise<AppState>;
      cancelStream: () => Promise<AppState>;
      transcribe: (audioBase64: string, mimeType: string) => Promise<string>;
      setCompactMode: (enabled: boolean) => Promise<AppState>;
      toggleCompactMode: () => Promise<AppState>;
      setCompactHeight: (height: number) => Promise<AppState>;
      getExpandedHeight: () => Promise<number>;
      exportMarkdown: (id: string) => Promise<string>;
      onState: (cb: (state: AppState) => void) => () => void;
    };
  }
}
