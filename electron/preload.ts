import { contextBridge, ipcRenderer } from "electron";
import type {
  AppState,
  HesionConfig,
  ModelInfo,
} from "../shared/types";

export interface HesionAPI {
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
}

const api: HesionAPI = {
  getState: () => ipcRenderer.invoke("hesion:get-state"),
  getModels: () => ipcRenderer.invoke("hesion:get-models"),
  updateConfig: (partial) => ipcRenderer.invoke("hesion:update-config", partial),
  createSession: () => ipcRenderer.invoke("hesion:create-session"),
  deleteSession: (id) => ipcRenderer.invoke("hesion:delete-session", id),
  setActiveSession: (id) => ipcRenderer.invoke("hesion:set-active-session", id),
  renameSession: (id, title) =>
    ipcRenderer.invoke("hesion:rename-session", id, title),
  setSessionModel: (id, model) =>
    ipcRenderer.invoke("hesion:set-session-model", id, model),
  setScreenContext: (enabled) =>
    ipcRenderer.invoke("hesion:set-screen-context", enabled),
  captureScreen: () => ipcRenderer.invoke("hesion:capture-screen"),
  clearAttachment: () => ipcRenderer.invoke("hesion:clear-attachment"),
  attachImage: (data, mimeType, source = "file") =>
    ipcRenderer.invoke("hesion:attach-image", data, mimeType, source),
  sendMessage: (text) => ipcRenderer.invoke("hesion:send-message", text),
  elaborate: () => ipcRenderer.invoke("hesion:elaborate"),
  harvestFlashcards: () => ipcRenderer.invoke("hesion:harvest-flashcards"),
  generateQuiz: () => ipcRenderer.invoke("hesion:generate-quiz"),
  deleteFlashcard: (cardId) =>
    ipcRenderer.invoke("hesion:delete-flashcard", cardId),
  clearActiveQuiz: () => ipcRenderer.invoke("hesion:clear-active-quiz"),
  clearUsage: () => ipcRenderer.invoke("hesion:clear-usage"),
  cancelStream: () => ipcRenderer.invoke("hesion:cancel-stream"),
  transcribe: (audioBase64, mimeType) =>
    ipcRenderer.invoke("hesion:transcribe", audioBase64, mimeType),
  setCompactMode: (enabled) =>
    ipcRenderer.invoke("hesion:set-compact-mode", enabled),
  toggleCompactMode: () => ipcRenderer.invoke("hesion:toggle-compact-mode"),
  setCompactHeight: (height) =>
    ipcRenderer.invoke("hesion:set-compact-height", height),
  getExpandedHeight: () => ipcRenderer.invoke("hesion:get-expanded-height"),
  exportMarkdown: (id) => ipcRenderer.invoke("hesion:export-markdown", id),
  onState: (cb) => {
    const handler = (_event: unknown, state: AppState) => cb(state);
    ipcRenderer.on("hesion:state", handler);
    return () => ipcRenderer.removeListener("hesion:state", handler);
  },
};

contextBridge.exposeInMainWorld("hesion", api);
